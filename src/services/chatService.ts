import type { AiModelDef, AiProvider } from '@/types';
import { USE_MOCK, API_BASE } from './api';
import { useAuthStore } from '@/store/authStore';
import { wait } from '@/lib/format';
import { webSearch } from './searchService';

/* ============================================================
   Chat service — real AI streaming with multi-provider support.

   Priority order:
     1. VITE_API_BASE set → proxy through FastAPI backend.
     2. Direct provider key set → call provider API in browser
        (dev/demo only — keys are exposed in the bundle).
     3. Neither → rich mock streaming fallback.

   All providers emit the same StreamChunk union so Chat.tsx
   can stay provider-agnostic.
   ============================================================ */

export const AI_MODELS: AiModelDef[] = [
  { id: 'claude-sonnet-4-6',       name: 'Claude Sonnet',    provider: 'claude' },
  { id: 'claude-opus-4-8',         name: 'Claude Opus',      provider: 'claude' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku',   provider: 'claude' },
  { id: 'deepseek-chat',           name: 'DeepSeek V3',      provider: 'deepseek' },
  { id: 'deepseek-reasoner',       name: 'DeepSeek R1',      provider: 'deepseek', supportsThinking: true },
  { id: 'gpt-4o',                  name: 'GPT-4o',           provider: 'openai' },
  { id: 'gpt-4o-mini',             name: 'GPT-4o mini',      provider: 'openai' },
  { id: 'o3-mini',                 name: 'o3-mini',          provider: 'openai', supportsThinking: true },
  { id: 'gemini-2.0-flash',        name: 'Gemini 2.0 Flash', provider: 'gemini' },
  { id: 'gemini-1.5-pro',          name: 'Gemini 1.5 Pro',   provider: 'gemini' },
];

export const DEFAULT_MODEL = AI_MODELS[0]; // Claude Sonnet 4.6

const DEV = import.meta.env.DEV;

const PROVIDER_BASE: Record<AiProvider, string> = {
  openai:   'https://api.openai.com/v1',
  // In dev, route through Vite proxy to avoid CORS; in prod keep direct URL.
  claude:   DEV ? '/anthropic-proxy' : 'https://api.anthropic.com',
  deepseek: DEV ? '/deepseek-proxy/v1' : 'https://api.deepseek.com/v1',
  gemini:   'https://generativelanguage.googleapis.com',
};

function providerKey(provider: AiProvider): string {
  const m: Record<AiProvider, string> = {
    openai:   (import.meta.env.VITE_OPENAI_API_KEY   as string) ?? '',
    claude:   (import.meta.env.VITE_CLAUDE_API_KEY   as string) ?? '',
    deepseek: (import.meta.env.VITE_DEEPSEEK_API_KEY as string) ?? '',
    gemini:   (import.meta.env.VITE_GEMINI_API_KEY   as string) ?? '',
  };
  return m[provider];
}

/* ── Stream chunk union ──────────────────────────────────────── */

export type StreamChunk =
  | { type: 'thinking'; content: string }
  | { type: 'delta';    content: string }
  | { type: 'trace';    id: string; icon: string; label: string; latency?: string; done: boolean }
  | { type: 'source';   key: string; label: string; url?: string }
  | { type: 'done' }
  | { type: 'error';    message: string };

/* ── SSE line parser shared by OpenAI-compatible adapters ──── */

async function* parseSse(
  response: Response,
): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) yield line;
  }
  // flush remaining
  if (buf) yield buf;
}

/* ── OpenAI / DeepSeek / backend-proxy streaming ──────────────── */

async function* streamOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
    signal,
  });

  if (!res.ok) {
    yield { type: 'error', message: await res.text() };
    return;
  }

  for await (const line of parseSse(res)) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') { yield { type: 'done' }; return; }
    try {
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string; reasoning_content?: string } }[];
      };
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning_content) yield { type: 'thinking', content: delta.reasoning_content };
      if (delta?.content)           yield { type: 'delta',    content: delta.content };
    } catch { /* skip malformed */ }
  }
  yield { type: 'done' };
}

/* ── Claude (Anthropic) streaming ──────────────────────────── */

async function* streamClaude(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const system  = messages.find((m) => m.role === 'system')?.content;
  const history = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const res = await fetch(`${PROVIDER_BASE.claude}/v1/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':                           'application/json',
      'x-api-key':                              apiKey,
      'anthropic-version':                      '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream:     true,
      system,
      messages: history,
    }),
    signal,
  });

  if (!res.ok) { yield { type: 'error', message: await res.text() }; return; }

  for await (const line of parseSse(res)) {
    if (!line.startsWith('data: ')) continue;
    try {
      const ev = JSON.parse(line.slice(6)) as {
        type: string;
        delta?: { type: string; text?: string };
      };
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        yield { type: 'delta', content: ev.delta.text };
      }
      if (ev.type === 'message_stop') { yield { type: 'done' }; return; }
    } catch { /* skip */ }
  }
  yield { type: 'done' };
}

/* ── Gemini streaming ───────────────────────────────────────── */

async function* streamGemini(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const system   = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const url = `${PROVIDER_BASE.gemini}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig:  { temperature: 0.7, maxOutputTokens: 4096 },
    }),
    signal,
  });

  if (!res.ok) { yield { type: 'error', message: await res.text() }; return; }

  for await (const line of parseSse(res)) {
    if (!line.startsWith('data: ')) continue;
    try {
      const ev = JSON.parse(line.slice(6)) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const text = ev.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield { type: 'delta', content: text };
      if (ev.candidates?.[0]?.finishReason === 'STOP') { yield { type: 'done' }; return; }
    } catch { /* skip */ }
  }
  yield { type: 'done' };
}

/* ── Backend proxy (FastAPI /chat/stream) ───────────────────── */

async function* streamBackend(
  messages: { role: string; content: string }[],
  model: string,
  provider: AiProvider,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const token = useAuthStore.getState().tokens?.accessToken;

  const res = await fetch(`${API_BASE}/chat/stream`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body:   JSON.stringify({ messages, model, provider }),
    signal,
  });

  if (!res.ok) { yield { type: 'error', message: await res.text() }; return; }

  for await (const line of parseSse(res)) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') { yield { type: 'done' }; return; }
    try {
      yield JSON.parse(data) as StreamChunk;
    } catch { /* skip */ }
  }
  yield { type: 'done' };
}

/* ── Mock streaming ─────────────────────────────────────────── */

const MOCK_TRACES = [
  { id: 'plan',   icon: 'workflow', label: '规划器拆解查询 → 3 个子任务' },
  { id: 'search', icon: 'home',     label: '房源搜索智能体 · 全量扫描' },
  { id: 'market', icon: 'trend',    label: '市场智能体 · 价格指数分析' },
  { id: 'rag',    icon: 'brain',    label: '知识库 · 检索到 6 份文档' },
];


function buildMockResponse(text: string): string {
  const q = text.toLowerCase();
  if (q.includes('学区') || q.includes('school'))
    return `**海淀 vs 西城学区对比分析（2026）**

根据最新数据，两区学区实力均属全市顶级：

**海淀区（中关村片区）**
- 均价：约 ¥11.8万/㎡，房源充足，换手快
- 重点校：中关村小学、人大附中、北大附中
- 学位竞争：★★★★☆

**西城区（金融街片区）**
- 均价：约 ¥15.2万/㎡，供应极为紧张
- 重点校：北师大实验小学、北京四中、北海幼儿园
- 学位竞争：★★★★★

**综合建议**：预算 ¥800万以内，海淀中关村性价比更高；若首要目标是顶级资源且预算充足，西城更优。也可关注近年快速崛起的**朝阳亚运村**（约 ¥7.2万/㎡），教育资源持续提升。`;

  if (q.includes('月供') || q.includes('房贷') || q.includes('mortgage') || q.includes('贷款'))
    return `**房贷测算报告**

以总价 ¥600万、首付30% 为例：

| 项目 | 金额 |
|------|------|
| 首付款 | ¥ 180万 |
| 贷款额 | ¥ 420万 |
| LPR（2026.01） | 3.50% |
| 30年月供 | **¥ 18,856元** |
| 20年月供 | **¥ 24,341元** |
| 总利息（30年） | ¥ 258.8万 |

**推荐银行方案（由低到高）**：
1. 工商银行 — 3.45%（优质客户专属，可申请）
2. 建设银行 — 3.50%（标准利率，放款快）
3. 招商银行 — 3.55%（服务好，审批灵活）

> 首套房可享 LPR-30bp 优惠，建议同步申请多家预审后再做决定。`;

  return `**Atlas 多智能体分析报告**

已协调以下专业智能体处理您的查询：

- **规划器** — 分解为 3 个并行子任务
- **市场智能体** — 北京核心区成交量环比 ↑12%
- **投资智能体** — 次核心区预期年化回报 4–6%
- **知识库** — 检索到 6 份相关政策与市场报告

**主要洞察**：当前市场处于温和复苏阶段，政策面偏暖，信贷边际宽松。建议关注次核心区域的性价比标的，把握换仓窗口期。

如需深入分析某个具体方向（学区、投资回报、贷款方案），请直接提问。`;
}

async function* streamMock(
  userText: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  // Simulate agent trace
  for (const t of MOCK_TRACES) {
    if (signal.aborted) return;
    yield { type: 'trace', ...t, done: false };
    await wait(480);
    yield { type: 'trace', ...t, latency: `${(Math.random() * 0.8 + 0.4).toFixed(1)}s`, done: true };
  }

  await wait(200);

  // Simulate thinking tokens for "reasoning" feel
  const thinkingText = `分析用户查询：「${userText.slice(0, 40)}」\n识别意图 → 房产咨询\n确定所需智能体 → [市场, 学区, 房贷]\n规划回答结构 → 结论优先 + 数据支撑`;
  for (let i = 0; i < thinkingText.length; i += 4) {
    if (signal.aborted) return;
    yield { type: 'thinking', content: thinkingText.slice(i, i + 4) };
    await wait(12);
  }

  await wait(150);

  // Stream response text
  const response = buildMockResponse(userText);
  for (let i = 0; i < response.length; i += 3) {
    if (signal.aborted) return;
    yield { type: 'delta', content: response.slice(i, i + 3) };
    await wait(18);
  }

  // Emit web search results as sources (real Tavily or scored mock)
  try {
    const results = await webSearch(userText, 3);
    for (const r of results) {
      if (signal.aborted) return;
      yield { type: 'source', key: r.url, label: r.title };
    }
  } catch { /* never block done on search failure */ }

  yield { type: 'done' };
}

/* ── Public API ─────────────────────────────────────────────── */

export interface StreamOptions {
  provider: AiProvider;
  model:    string;
  /** Full conversation history including the new user message. */
  messages: { role: string; content: string }[];
  signal:   AbortSignal;
  onChunk:  (chunk: StreamChunk) => void;
}

export async function streamChat(opts: StreamOptions): Promise<void> {
  const { provider, model, messages, signal, onChunk } = opts;

  let gen: AsyncGenerator<StreamChunk>;

  if (!USE_MOCK) {
    // Route through FastAPI backend.
    gen = streamBackend(messages, model, provider, signal);
  } else {
    const key = providerKey(provider);
    if (key) {
      switch (provider) {
        case 'openai':
          gen = streamOpenAI(
            (import.meta.env.VITE_OPENAI_BASE_URL as string) || PROVIDER_BASE.openai,
            key, model, messages, signal,
          );
          break;
        case 'deepseek':
          gen = streamOpenAI(PROVIDER_BASE.deepseek, key, model, messages, signal);
          break;
        case 'claude':
          gen = streamClaude(key, model, messages, signal);
          break;
        case 'gemini':
          gen = streamGemini(key, model, messages, signal);
          break;
        default:
          gen = streamMock(messages[messages.length - 1]?.content ?? '', signal);
      }
    } else {
      gen = streamMock(messages[messages.length - 1]?.content ?? '', signal);
    }
  }

  for await (const chunk of gen) {
    if (signal.aborted) break;
    onChunk(chunk);
    if (chunk.type === 'done' || chunk.type === 'error') break;
  }
}
