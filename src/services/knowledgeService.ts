import type { KbDoc } from '@/store/knowledgeStore';
import { USE_MOCK, api } from './api';
import { hashFile, DEFAULT_CHUNK_SIZE, uploadChunk, mergeChunks, checkInstant } from './uploadService';
import { wait } from '@/lib/format';

/* ============================================================
   Knowledge Base service.
   Backend contract:
     POST /knowledge/docs           (multipart)  → { id, chunks }
     DELETE /knowledge/docs/:id                  → 204
     POST /knowledge/search { query, topK }      → SearchResult[]
     GET  /knowledge/docs                        → KbDoc[]
   ============================================================ */

export interface SearchResult {
  chunkId:   string;
  docId:     string;
  docName:   string;
  content:   string;
  score:     number;
  /** 0-100 */
  pct:       number;
}

/* ── Helpers ─────────────────────────────────────────────── */

function guessChunks(bytes: number): number {
  return Math.max(1, Math.round(bytes / (800 * 4)));
}

function makeId(): string {
  return `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Document upload ─────────────────────────────────────── */

export async function uploadDocument(
  file: File,
  onProgress: (phase: KbDoc['phase'], pct: number) => void,
): Promise<{ hash: string; url: string; chunks: number }> {
  if (!USE_MOCK) {
    /* Real backend: stream chunked upload then notify knowledge endpoint. */
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const total     = Math.max(1, Math.ceil(file.size / chunkSize));

    onProgress('uploading', 0);

    const { promise } = hashFile(file, chunkSize, () => undefined);
    const hash = await promise;

    const check = await checkInstant(hash, total);
    if (!check.exists) {
      const chunks = Array.from({ length: total }, (_, i) => ({
        index: i,
        start: i * chunkSize,
        end:   Math.min(file.size, (i + 1) * chunkSize),
        size:  Math.min(chunkSize, file.size - i * chunkSize),
        status: 'pending' as const,
        progress: 0,
        retries: 0,
      }));
      const ctrl = new AbortController();
      for (const c of chunks) {
        const blob = file.slice(c.start, c.end);
        await uploadChunk(hash, c, blob, (pct) =>
          onProgress('uploading', Math.round((c.index + pct / 100) / total * 100)),
          ctrl.signal,
        );
      }
      await mergeChunks(hash, file.name);
    }

    /* Tell the knowledge backend to index the file. */
    const { data } = await api.post<{ chunks: number; url: string }>(
      '/knowledge/docs',
      { hash, fileName: file.name, fileSize: file.size },
    );

    onProgress('chunking', 50);
    onProgress('embedding', 80);
    onProgress('done', 100);
    return { hash, url: data.url, chunks: data.chunks };
  }

  /* Mock: simulate chunking then embedding phases. */
  const chunks = guessChunks(file.size);

  /* "Upload" phase */
  for (let p = 0; p <= 100; p += 20) {
    onProgress('uploading', p);
    await wait(120);
  }

  /* "Chunking" phase */
  onProgress('chunking', 0);
  for (let p = 0; p <= 100; p += 25) {
    onProgress('chunking', p);
    await wait(90);
  }

  /* "Embedding" phase (progressive) */
  onProgress('embedding', 0);
  for (let p = 0; p <= 100; p += 10) {
    onProgress('embedding', p);
    await wait(140);
  }

  onProgress('done', 100);

  const { promise } = hashFile(file, DEFAULT_CHUNK_SIZE, () => undefined);
  const hash = await promise;
  return { hash, url: `https://oss.atlas.ai/${hash}/${encodeURIComponent(file.name)}`, chunks };
}

/* ── Document deletion ───────────────────────────────────── */

export async function deleteDocument(id: string): Promise<void> {
  if (!USE_MOCK) {
    await api.delete(`/knowledge/docs/${id}`);
    return;
  }
  await wait(300);
}

/* ── RAG search ──────────────────────────────────────────── */

const MOCK_CHUNKS: { content: string; tags: string[] }[] = [
  {
    content: '海淀区中关村学区涵盖中关村第一、第二、第三小学，划片范围包括科育路、双榆树等社区，均价约 ¥118,000/㎡。',
    tags: ['海淀', '学区', '中关村', '小学'],
  },
  {
    content: '西城区金融街学区为北京顶级学区之一，对口实验二小，二手房均价约 ¥152,000/㎡，供应极为紧张。',
    tags: ['西城', '学区', '金融街', '实验二小'],
  },
  {
    content: '朝阳区望京学区近年教学质量提升明显，房价相对友好，均价约 ¥72,000/㎡，地铁 14 号线覆盖。',
    tags: ['朝阳', '学区', '望京', '地铁'],
  },
  {
    content: '2026 年首套住房商业贷款利率基准为 LPR-30bp，当前 LPR 为 3.50%，即最低执行利率 3.20%。',
    tags: ['房贷', '利率', 'LPR', '首套', '政策'],
  },
  {
    content: '北京现行限购政策：非本市户籍居民家庭须提供连续 60 个月以上在京纳税或社保证明方可购房。',
    tags: ['政策', '限购', '北京', '户籍'],
  },
  {
    content: '海淀区二手房市场 2025 Q4 成交均价同比上涨 4.7%，核心学区板块上涨 6.2%，库存持续收紧。',
    tags: ['市场', '海淀', '二手房', '价格'],
  },
  {
    content: '房产交易税费：契税（90㎡以下首套 1%，90-144㎡ 1.5%，其余 3%）、增值税（满2年免征）。',
    tags: ['税费', '契税', '增值税', '交易'],
  },
  {
    content: 'Monthly payment formula: P × r × (1+r)^n / ((1+r)^n - 1), where P=principal, r=monthly rate, n=months.',
    tags: ['mortgage', 'formula', 'payment', 'calculation'],
  },
];

function scoreChunk(chunk: { content: string; tags: string[] }, query: string): number {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  let score = 0;
  const text = (chunk.content + ' ' + chunk.tags.join(' ')).toLowerCase();
  for (const t of terms) {
    if (text.includes(t)) score += 0.35;
    if (chunk.tags.some((tag) => tag.toLowerCase().includes(t))) score += 0.25;
  }
  /* Boost for longer query matches */
  if (text.includes(q)) score += 0.4;
  return Math.min(1, score);
}

export async function searchKnowledge(
  query: string,
  topK = 4,
): Promise<SearchResult[]> {
  if (!USE_MOCK) {
    const { data } = await api.post<SearchResult[]>('/knowledge/search', { query, topK });
    return data;
  }

  await wait(380 + Math.random() * 200);

  const scored = MOCK_CHUNKS
    .map((c, i) => ({ c, i, score: scoreChunk(c, query) + Math.random() * 0.05 }))
    .filter((x) => x.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ c, i, score }) => ({
    chunkId: `chunk_${String(i + 1).padStart(4, '0')}`,
    docId:   `kb_mock_${i}`,
    docName: ['北京学区划片白皮书 2026', '链家成交价指数 Q1-2026', '首套房贷政策解读 2026', '商品房买卖合同范本'][i % 4],
    content: c.content,
    score:   Math.round(score * 100) / 100,
    pct:     Math.round(score * 100),
  }));
}

/* ── Load remote doc list ────────────────────────────────── */

export async function fetchRemoteDocs(): Promise<KbDoc[]> {
  if (USE_MOCK) return [];
  try {
    const { data } = await api.get<KbDoc[]>('/knowledge/docs');
    return data;
  } catch {
    return [];
  }
}

/* ── Accepted file types ─────────────────────────────────── */

export const ACCEPTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/webm',
  'audio/mpeg',
  'video/mp4',
].join(',');

export function mimeIcon(mime: string): string {
  if (mime.includes('pdf'))    return 'doc';
  if (mime.includes('word'))   return 'doc';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'chart';
  if (mime.includes('image'))  return 'image';
  if (mime.includes('audio') || mime.includes('video')) return 'play';
  return 'doc';
}

export function mimeColor(mime: string): string {
  if (mime.includes('pdf'))   return '#F43F5E';
  if (mime.includes('word'))  return '#4F7CFF';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '#10B981';
  if (mime.includes('image')) return '#7C3AED';
  if (mime.includes('audio') || mime.includes('video')) return '#F59E0B';
  return '#4F7CFF';
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)} KB`;
  return `${bytes} B`;
}

export { makeId };
