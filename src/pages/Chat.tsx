import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { Markdown } from '@/lib/markdown';
import { useChatStore } from '@/store/chatStore';
import { streamChat, AI_MODELS } from '@/services/chatService';
import { transcribeLocalWhisper, type WhisperProgress } from '@/services/mediaService';
import type { AiProvider, ChatMessage, ChatSession } from '@/types';

/* ── Agent panel config ──────────────────────────────────────── */

interface AgentEntry {
  id: string;
  icon: string;
  name: { en: string; zh: string };
  color: string;
  on: boolean;
  core?: boolean;
}

const AGENTS_INIT: AgentEntry[] = [
  { id: 'plan',     icon: 'workflow', name: { en: 'Planner',        zh: '规划器'   }, color: '#4F7CFF', on: true,  core: true },
  { id: 'search',   icon: 'home',     name: { en: 'Property Search', zh: '房源搜索' }, color: '#4F7CFF', on: true  },
  { id: 'market',   icon: 'trend',    name: { en: 'Market Analysis', zh: '市场分析' }, color: '#00D4FF', on: true  },
  { id: 'school',   icon: 'school',   name: { en: 'School District', zh: '学区分析' }, color: '#F59E0B', on: true  },
  { id: 'mortgage', icon: 'bank',     name: { en: 'Mortgage Advisor',zh: '房贷顾问' }, color: '#10B981', on: false },
  { id: 'rag',      icon: 'brain',    name: { en: 'Knowledge Base',  zh: '知识库'   }, color: '#10B981', on: true  },
  { id: 'web',      icon: 'globe',    name: { en: 'Web Search',      zh: '联网搜索' }, color: '#7C3AED', on: false },
];

const QUICK_PROMPTS = [
  { icon: 'school',  color: '#F59E0B', en: 'Best school districts under ¥80k/㎡', zh: '8万/㎡以内的优质学区房' },
  { icon: 'trend',   color: '#00D4FF', en: 'Investment outlook for 朝阳 in 2026',  zh: '2026年朝阳区投资前景分析' },
  { icon: 'bank',    color: '#10B981', en: 'Monthly payment on a ¥6M apartment',  zh: '600万房产的月供测算' },
  { icon: 'home',    color: '#4F7CFF', en: '3-bed near metro, ¥5M budget',         zh: '500万预算·地铁旁三居室' },
];

/* ── Helpers ─────────────────────────────────────────────────── */

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

/* ── Sub-components ──────────────────────────────────────────── */

function ThinkingBlock({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const { lang } = useT();
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        {lang === 'zh' ? '思考过程' : 'Thinking process'}
        <span style={{ opacity: 0.6 }}>({text.split('\n').length} lines)</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <pre
              style={{
                margin: '6px 0 0',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(124,58,237,0.06)',
                border: '1px solid rgba(124,58,237,0.18)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78em',
                lineHeight: 1.65,
                color: 'var(--muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TraceBlock({ msg }: { msg: ChatMessage }) {
  const { lang } = useT();
  if (!msg.trace || msg.trace.length === 0) return null;
  return (
    <div
      style={{
        margin: '4px 0 14px',
        borderRadius: 10,
        border: '1px solid var(--glass-border)',
        background: 'var(--surface-1)',
        overflow: 'hidden',
      }}
    >
      {msg.trace.map((t, i) => {
        const Icon = getIcon(t.icon);
        return (
          <div
            key={t.id}
            className="row gap-3"
            style={{
              padding: '9px 14px',
              fontSize: 13,
              borderBottom: i < msg.trace!.length - 1 ? '1px solid var(--glass-border)' : 'none',
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--surface-3)' }}>
              <Icon size={12} />
            </div>
            <span style={{ fontWeight: 550, flex: 1 }}>{lang === 'zh' ? t.label : t.label}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
              {t.done ? (
                <>
                  {t.latency} <span style={{ color: 'var(--success)' }}>✓</span>
                </>
              ) : (
                <span
                  style={{
                    display: 'inline-block', width: 12, height: 12,
                    border: '2px solid var(--glass-border)',
                    borderTopColor: 'var(--secondary)',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SourcesBlock({ msg }: { msg: ChatMessage }) {
  const { lang } = useT();
  if (!msg.sources || msg.sources.length === 0) return null;
  return (
    <div className="row gap-2" style={{ flexWrap: 'wrap', marginTop: 12 }}>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>
        {lang === 'zh' ? '依据来源' : 'Sources'}
      </span>
      {msg.sources.map((s, i) => (
        <span key={i} className="badge" style={{ fontSize: 11.5 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--secondary)' }}>{s.key}</span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { lang } = useT();
  const Sparkle = getIcon('sparkle');
  const [thinkingOpen, setThinkingOpen] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className="row gap-3" style={{ marginBottom: 26, alignItems: 'flex-start' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 13,
          background: 'var(--grad-accent)', color: '#fff',
        }}>
          {lang === 'zh' ? '我' : 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 6, color: 'var(--sub)' }}>
            {lang === 'zh' ? '我' : 'You'}
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text)' }}>{msg.content}</div>
        </div>
      </div>
    );
  }

  /* assistant */
  return (
    <motion.div
      className="row gap-3"
      style={{ marginBottom: 26, alignItems: 'flex-start' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--grad-iris)',
      }}>
        <Sparkle color="#fff" size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        <div className="row gap-2" style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>
          Atlas
          <span className="mono" style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'var(--surface-3)', color: 'var(--sub)' }}>
            {msg.model ?? 'multi-agent'}
          </span>
        </div>

        {/* Agent trace */}
        <TraceBlock msg={msg} />

        {/* Thinking process */}
        {msg.thinking && (
          <ThinkingBlock
            text={msg.thinking}
            open={thinkingOpen}
            onToggle={() => setThinkingOpen((o) => !o)}
          />
        )}

        {/* Response body */}
        {msg.content && (
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--text)' }}>
            {msg.streaming && !msg.content.includes('\n') ? (
              /* Still arriving — render inline to avoid re-tokenizing on every character */
              <Markdown content={msg.content} inline />
            ) : (
              <Markdown content={msg.content} />
            )}
            {msg.streaming && (
              <span
                style={{
                  display: 'inline-block', width: 8, height: 15,
                  background: 'var(--secondary)',
                  verticalAlign: 'text-bottom', marginLeft: 2,
                  borderRadius: 1,
                  animation: 'blink 1s steps(2) infinite',
                }}
              />
            )}
          </div>
        )}

        {/* Error */}
        {msg.error && (
          <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 6 }}>
            ⚠ {msg.error}
          </div>
        )}

        {/* Sources */}
        {!msg.streaming && <SourcesBlock msg={msg} />}
      </div>
    </motion.div>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const X = getIcon('close');
  return (
    <div
      className="row gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? 'var(--surface-3)' : 'transparent',
        transition: 'background 0.15s',
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {session.title}
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {relativeTime(session.updatedAt)}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────── */

export default function Chat() {
  const { lang } = useT();
  const b = (o: { en: string; zh: string }) => (lang === 'zh' ? o.zh : o.en);

  const store = useChatStore();
  const activeSession = store.activeSession();

  const [input, setInput]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [agents, setAgents] = useState<AgentEntry[]>(AGENTS_INIT);

  /* ── Voice recording + local Whisper ──────────────────────── */
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'loading' | 'transcribing'>('idle');
  const [whisperPct,  setWhisperPct]  = useState(0);
  const [voiceError,  setVoiceError]  = useState('');
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const voiceStream = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    mediaRecRef.current?.stop();
    voiceStream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const startRecording = useCallback(async () => {
    setVoiceError('');

    /* Guard: getUserMedia requires a secure context (localhost or HTTPS). */
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError(lang === 'zh' ? '当前环境不支持麦克风（需要 localhost 或 HTTPS）' : 'Microphone requires localhost or HTTPS');
      return;
    }

    /* Show spinner while the browser permission dialog is open. */
    setVoiceStatus('loading');
    audioChunks.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setVoiceStatus('idle');
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceError(
        msg.includes('denied') || msg.includes('NotAllowed')
          ? lang === 'zh' ? '麦克风权限被拒绝，请在浏览器地址栏授权' : 'Microphone permission denied'
          : lang === 'zh' ? `麦克风错误: ${msg}` : `Mic error: ${msg}`,
      );
      console.error('[Voice] getUserMedia failed:', err);
      return;
    }

    /* Refs are set before status changes to 'recording', so
       stopRecording() called on the red button always finds a live ref. */
    voiceStream.current = stream;
    const mr = new MediaRecorder(stream);
    mediaRecRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size) audioChunks.current.push(e.data); };

    mr.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
      audioChunks.current = [];
      if (!blob.size) { setVoiceStatus('idle'); return; }

      try {
        const text = await transcribeLocalWhisper(
          blob,
          lang === 'zh' ? 'chinese' : 'english',
          (p: WhisperProgress) => {
            if (p.total > 0) setWhisperPct(Math.round((p.loaded / p.total) * 100));
          },
          (s) => setVoiceStatus(s === 'transcribing' ? 'transcribing' : 'loading'),
        );
        if (text) {
          setInput((prev) => (prev ? `${prev} ${text}` : text));
          /* inputRef is a stable ref — safe to access after the await */
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      } catch (err) {
        console.error('[Voice] transcription failed:', err);
        setVoiceError(lang === 'zh' ? `转写失败: ${err instanceof Error ? err.message : '未知错误'}` : `Transcription failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      } finally {
        setVoiceStatus('idle');
        setWhisperPct(0);
      }
    };

    mr.start();
    /* Only turn red AFTER the MediaRecorder has actually started —
       guarantees mediaRecRef.current is live when the user clicks stop. */
    setVoiceStatus('recording');
  }, [lang]);

  const toggleVoice = useCallback(() => {
    if (voiceStatus === 'recording') {
      stopRecording();
    } else if (voiceStatus === 'idle') {
      void startRecording();
    }
  }, [voiceStatus, stopRecording, startRecording]);

  /* Model / provider picker */
  const [modelId, setModelId]   = useState(AI_MODELS[0].id);
  const [showModels, setShowModels] = useState(false);
  const currentModel = AI_MODELS.find((m) => m.id === modelId) ?? AI_MODELS[0];

  const scrollRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  /* Ensure there is always an active session */
  const ensureSession = useCallback((): string => {
    if (activeSession) return activeSession.id;
    return store.newSession();
  }, [activeSession, store]);

  const scrollBottom = () =>
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });

  /* Auto-scroll while streaming */
  useEffect(() => {
    if (busy) scrollBottom();
  });

  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;

    setBusy(true);
    setInput('');

    const sessionId = ensureSession();
    if (!store.sessions.some((s) => s.id === sessionId)) {
      /* session was just created — select it */
      store.selectSession(sessionId);
    }

    /* Add user message */
    store.addUserMessage(sessionId, text);
    scrollBottom();

    /* Create assistant placeholder */
    const assistantId = store.startAssistant(sessionId, modelId, currentModel.provider as AiProvider);
    scrollBottom();

    /* Wire up abort */
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    /* Build history for context */
    const session = store.getSession(sessionId);
    const history = (session?.messages ?? [])
      .filter((m) => m.id !== assistantId)
      .slice(-20)                 /* keep last 20 to stay within context window */
      .map((m) => ({ role: m.role, content: m.content }));

    history.push({ role: 'user', content: text });

    try {
      const traceSources: { key: string; label: string }[] = [];

      await streamChat({
        provider: currentModel.provider as AiProvider,
        model:    modelId,
        messages: [
          { role: 'system', content: '你是 Atlas 多智能体房产顾问平台的 AI 助手。用中文回答房产相关问题，回答要专业、简洁、有数据支撑。如果用户用英文提问则用英文回答。' },
          ...history,
        ],
        signal: ctrl.signal,
        onChunk: (chunk) => {
          switch (chunk.type) {
            case 'trace': {
              const existing = store.getSession(sessionId)?.messages.find((m) => m.id === assistantId);
              const traces = existing?.trace ?? [];
              if (!chunk.done) {
                /* Add new pending trace step */
                store.setTrace(sessionId, assistantId, [
                  ...traces,
                  { id: chunk.id, icon: chunk.icon, label: chunk.label, done: false },
                ]);
              } else {
                /* Mark existing step done */
                store.markTraceDone(sessionId, assistantId, chunk.id, chunk.latency);
                /* If this trace emits a source, record it */
                if (chunk.label.includes('知识库') || chunk.label.includes('Knowledge')) {
                  traceSources.push({ key: 'KB·01', label: chunk.label });
                }
              }
              break;
            }
            case 'thinking':
              store.appendThinking(sessionId, assistantId, chunk.content);
              break;
            case 'delta':
              store.appendDelta(sessionId, assistantId, chunk.content);
              break;
            case 'source':
              traceSources.push({ key: chunk.key, label: chunk.label });
              break;
            case 'done':
              if (traceSources.length) {
                store.setSources(sessionId, assistantId, traceSources);
              }
              store.finalizeMessage(sessionId, assistantId);
              break;
            case 'error':
              store.setMessageError(sessionId, assistantId, chunk.message);
              break;
          }
          scrollBottom();
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        store.finalizeMessage(sessionId, assistantId);
      } else {
        store.setMessageError(
          sessionId,
          assistantId,
          err instanceof Error ? err.message : 'Unknown error',
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, modelId, currentModel, ensureSession, store]);

  /* Stop ongoing generation */
  const stop = () => {
    abortRef.current?.abort();
  };

  /* Textarea auto-resize */
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  /* Key handler: Enter sends, Shift+Enter newline */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const Plus   = getIcon('plus');
  const Send   = getIcon('send');
  const Chevron = getIcon('chevron');
  const Stop   = getIcon('close');
  const Trash  = getIcon('trash');
  const Mic    = getIcon('mic');

  const messages = activeSession?.messages ?? [];

  /* Group sessions by date for the sidebar */
  const today     = store.sessions.filter((s) => Date.now() - s.updatedAt < 86_400_000);
  const older     = store.sessions.filter((s) => Date.now() - s.updatedAt >= 86_400_000);

  return (
    <AppShell title={{ en: 'AI Chat Center', zh: '智能对话中心' }} crumb="atlas / workspace / chat" fixedHeight bare>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '256px 1fr 272px',
          height: 'calc(100vh - var(--topbar-h))',
          minHeight: 0,
        }}
      >
        {/* ── History rail ─────────────────────────────────────── */}
        <aside
          style={{
            borderRight: '1px solid var(--glass-border)',
            padding: '14px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'auto',
          }}
        >
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center', marginBottom: 12, width: '100%' }}
            onClick={() => store.newSession()}
          >
            <Plus size={15} />
            {lang === 'zh' ? '新建对话' : 'New Conversation'}
          </button>

          {today.length > 0 && (
            <>
              <div className="nav-group-label">{lang === 'zh' ? '今天' : 'Today'}</div>
              {today.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === store.activeSessionId}
                  onSelect={() => store.selectSession(s.id)}
                  onDelete={() => store.deleteSession(s.id)}
                />
              ))}
            </>
          )}

          {older.length > 0 && (
            <>
              <div className="nav-group-label" style={{ marginTop: 8 }}>
                {lang === 'zh' ? '更早' : 'Earlier'}
              </div>
              {older.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === store.activeSessionId}
                  onSelect={() => store.selectSession(s.id)}
                  onDelete={() => store.deleteSession(s.id)}
                />
              ))}
            </>
          )}

          {store.sessions.length > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ marginTop: 'auto', width: '100%', color: 'var(--danger)', justifyContent: 'center' }}
              onClick={() => store.clearAll()}
            >
              <Trash size={13} />
              {lang === 'zh' ? '清空记录' : 'Clear All'}
            </button>
          )}
        </aside>

        {/* ── Chat column ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {/* Messages */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: '28px 8% 8px', minHeight: 0 }}
          >
            {messages.length === 0 ? (
              /* Welcome screen */
              <div style={{ maxWidth: 680, margin: '6vh auto 0', textAlign: 'center' }}>
                <div
                  style={{
                    width: 72, height: 72, borderRadius: 22,
                    margin: '0 auto 22px',
                    background: 'var(--grad-iris)',
                    display: 'grid', placeItems: 'center',
                    boxShadow: '0 16px 40px rgba(79,124,255,0.45)',
                  }}
                >
                  {(() => { const S = getIcon('sparkle'); return <S color="#fff" size={36} />; })()}
                </div>
                <h2 style={{ fontSize: 27, fontWeight: 680, marginBottom: 10 }}>
                  {lang === 'zh' ? '今天需要智能体团队帮您做什么？' : 'How can the agent team help today?'}
                </h2>
                <p style={{ color: 'var(--sub)', fontSize: 15, marginBottom: 30 }}>
                  {lang === 'zh'
                    ? '询问任何房产问题，多智能体将协同规划、检索与推理。'
                    : 'Ask anything about properties. Agents plan, retrieve, and reason together.'}
                </p>
                <div className="grid-base" style={{ gridTemplateColumns: '1fr 1fr', textAlign: 'left' }}>
                  {QUICK_PROMPTS.map((p, i) => {
                    const Icon = getIcon(p.icon);
                    return (
                      <div
                        key={i}
                        className="card card-hover"
                        style={{ padding: 16, cursor: 'pointer', display: 'flex', gap: 13, alignItems: 'flex-start' }}
                        onClick={() => void send(b(p))}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: `${p.color}22`, color: p.color }}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, lineHeight: 1.4 }}>{b(p)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Composer */}
          <div style={{ padding: '12px 8% 20px', flexShrink: 0 }}>
            <div
              className="card"
              style={{
                borderRadius: 'var(--r-lg)',
                padding: '12px 12px 10px',
                border: '1px solid var(--glass-border-strong)',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  lang === 'zh'
                    ? '询问房源、学区、房贷…（Enter 发送，Shift+Enter 换行）'
                    : 'Ask about a property, district, mortgage… (Enter to send)'
                }
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  background: 'none',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  lineHeight: 1.55,
                  padding: '6px 6px 10px',
                  overflow: 'hidden',
                }}
              />
              <div className="row gap-2">
                {/* Model picker */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="mono"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, color: 'var(--sub)',
                      padding: '6px 11px', borderRadius: 'var(--r-pill)',
                      background: 'var(--surface-1)', border: '1px solid var(--glass-border)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowModels((v) => !v)}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                    {currentModel.name}
                    <Chevron size={12} />
                  </button>

                  <AnimatePresence>
                    {showModels && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        style={{
                          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                          background: 'var(--bg-2)', border: '1px solid var(--glass-border-strong)',
                          borderRadius: 12, padding: 6, zIndex: 100, width: 220,
                          boxShadow: 'var(--shadow-md)',
                        }}
                      >
                        {(['openai', 'claude', 'deepseek', 'gemini'] as AiProvider[]).map((provider) => {
                          const models = AI_MODELS.filter((m) => m.provider === provider);
                          return (
                            <div key={provider}>
                              <div className="nav-group-label" style={{ padding: '6px 10px 4px' }}>
                                {provider.toUpperCase()}
                              </div>
                              {models.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => { setModelId(m.id); setShowModels(false); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', padding: '7px 10px', borderRadius: 8,
                                    background: modelId === m.id ? 'var(--surface-3)' : 'transparent',
                                    border: 'none', cursor: 'pointer', fontSize: 13,
                                    color: modelId === m.id ? 'var(--text)' : 'var(--sub)',
                                    textAlign: 'left',
                                  }}
                                >
                                  {m.name}
                                  {m.supportsThinking && (
                                    <span className="badge" style={{ fontSize: 10, marginLeft: 'auto' }}>thinking</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex-1" />

                {/* Mic button — local Whisper STT */}
                {!busy && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={toggleVoice}
                      disabled={voiceStatus === 'loading' || voiceStatus === 'transcribing'}
                      title={
                        voiceStatus === 'recording'
                          ? lang === 'zh' ? '点击停止录音' : 'Click to stop'
                          : voiceStatus === 'loading'
                          ? lang === 'zh' ? '加载模型中…' : 'Loading model…'
                          : voiceStatus === 'transcribing'
                          ? lang === 'zh' ? '转写中…' : 'Transcribing…'
                          : lang === 'zh' ? '语音输入（本地 Whisper）' : 'Voice input (local Whisper)'
                      }
                      style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none',
                        cursor: (voiceStatus === 'loading' || voiceStatus === 'transcribing') ? 'default' : 'pointer',
                        display: 'grid', placeItems: 'center',
                        background:
                          voiceStatus === 'recording'
                            ? 'rgba(244,63,94,0.15)'
                            : 'var(--surface-1)',
                        color:
                          voiceStatus === 'recording'
                            ? 'var(--danger)'
                            : (voiceStatus === 'loading' || voiceStatus === 'transcribing')
                            ? 'var(--secondary)'
                            : 'var(--sub)',
                        transition: 'all 0.15s',
                        boxShadow: voiceStatus === 'recording' ? '0 0 0 4px rgba(244,63,94,0.18)' : 'none',
                      }}
                    >
                      {(voiceStatus === 'loading' || voiceStatus === 'transcribing') ? (
                        <span
                          style={{
                            display: 'inline-block', width: 14, height: 14,
                            border: '2px solid var(--glass-border)',
                            borderTopColor: 'var(--secondary)',
                            borderRadius: '50%',
                            animation: 'spin 0.7s linear infinite',
                          }}
                        />
                      ) : (
                        <Mic size={17} />
                      )}
                    </button>
                    {/* Model download progress bar */}
                    {voiceStatus === 'loading' && whisperPct > 0 && (
                      <div
                        style={{
                          position: 'absolute', bottom: -6, left: 0, right: 0,
                          height: 2, borderRadius: 1,
                          background: 'var(--surface-3)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${whisperPct}%`,
                            background: 'var(--grad-primary)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Stop / Send */}
                {busy ? (
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ gap: 5, color: 'var(--danger)' }}
                    onClick={stop}
                  >
                    <Stop size={14} />
                    {lang === 'zh' ? '停止' : 'Stop'}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ width: 36, height: 36, padding: 0, justifyContent: 'center', borderRadius: 10 }}
                    disabled={!input.trim()}
                    onClick={() => void send()}
                    aria-label="Send"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
            {voiceError && (
              <div style={{ fontSize: 11.5, color: 'var(--danger)', textAlign: 'center', marginTop: 6 }}>
                ⚠ {voiceError}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
              {lang === 'zh'
                ? 'Atlas 可能出错，重要决策请核实信息'
                : 'Atlas may make mistakes — verify important information'}
            </div>
          </div>
        </div>

        {/* ── Agent panel ──────────────────────────────────────── */}
        <aside
          style={{
            borderLeft: '1px solid var(--glass-border)',
            padding: '18px 14px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="nav-group-label">{lang === 'zh' ? '参与智能体' : 'Active Agents'}</div>
          {agents.map((a) => {
            const Icon = getIcon(a.icon);
            return (
              <div
                key={a.id}
                className="row gap-3"
                style={{
                  padding: 9,
                  borderRadius: 'var(--r-sm)',
                  cursor: a.core ? 'default' : 'pointer',
                  background: a.on ? 'var(--surface-2)' : 'transparent',
                  border: a.on ? '1px solid var(--glass-border-strong)' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
                onClick={() => {
                  if (!a.core) {
                    setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x)));
                  }
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${a.color},${a.color}99)` }}>
                  <Icon color="#fff" size={15} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b(a.name)}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {a.core
                      ? lang === 'zh' ? '编排核心' : 'orchestrator'
                      : a.on
                        ? lang === 'zh' ? '就绪' : 'ready'
                        : lang === 'zh' ? '待命' : 'idle'}
                  </div>
                </div>
                {!a.core && (
                  <div
                    style={{
                      width: 34, height: 20, borderRadius: 999,
                      background: a.on ? 'var(--grad-primary)' : 'var(--surface-3)',
                      position: 'relative', flexShrink: 0,
                      transition: 'background 0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute', top: 2,
                        left: a.on ? 16 : 2,
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s var(--ease)',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Context stats */}
          <div style={{ marginTop: 'auto' }}>
            <div className="nav-group-label" style={{ marginBottom: 8 }}>
              {lang === 'zh' ? '会话信息' : 'Session Info'}
            </div>
            <div className="card" style={{ padding: '10px 12px', fontSize: 12 }}>
              {[
                { label: lang === 'zh' ? '消息数' : 'Messages', value: messages.length },
                { label: lang === 'zh' ? '模型'   : 'Model',    value: currentModel.name },
                { label: lang === 'zh' ? '会话数' : 'Sessions', value: store.sessions.length },
              ].map((r) => (
                <div key={r.label} className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
