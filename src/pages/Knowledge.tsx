import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { cn } from '@/lib/format';
import { useKnowledgeStore } from '@/store/knowledgeStore';
import {
  uploadDocument, deleteDocument, searchKnowledge, fetchRemoteDocs,
  ACCEPTED_MIME, mimeIcon, mimeColor, fmtSize, makeId,
  type SearchResult,
} from '@/services/knowledgeService';
import type { KbDoc } from '@/store/knowledgeStore';
import type { Bi } from '@/types';

/* ── Seed docs (shown when store is empty) ───────────────── */

const SEED_DOCS: KbDoc[] = [
  { id: 'seed_1', name: '北京学区划片白皮书 2026.pdf', size: 4_404_224, mimeType: 'application/pdf',  chunks: 142, embed: 100, phase: 'done', uploadedAt: Date.now() - 86_400_000 * 3 },
  { id: 'seed_2', name: '链家成交价指数 Q1-2026.xlsx', size: 1_887_436, mimeType: 'application/vnd.ms-excel', chunks: 86, embed: 100, phase: 'done', uploadedAt: Date.now() - 86_400_000 * 2 },
  { id: 'seed_3', name: '商品房买卖合同范本.pdf',      size: 943_718,  mimeType: 'application/pdf',  chunks: 54, embed: 100, phase: 'done', uploadedAt: Date.now() - 86_400_000 },
  { id: 'seed_4', name: '首套房贷政策解读 2026.docx',  size: 1_258_291, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', chunks: 38, embed: 100, phase: 'done', uploadedAt: Date.now() - 43_200_000 },
  { id: 'seed_5', name: '海淀地铁规划图.png',          size: 6_710_886, mimeType: 'image/png',       chunks: 12, embed: 72,  phase: 'embedding', uploadedAt: Date.now() - 7_200_000 },
];

const TABS: { id: string; label: Bi }[] = [
  { id: 'chunks', label: { en: 'Chunks', zh: '切片' } },
  { id: 'test',   label: { en: 'RAG Test', zh: 'RAG 测试' } },
  { id: 'graph',  label: { en: 'Knowledge Graph', zh: '知识图谱' } },
];

const PHASE_LABEL: Record<KbDoc['phase'], { en: string; zh: string; color: string }> = {
  uploading:  { en: 'Uploading',  zh: '上传中',  color: 'var(--primary)'   },
  chunking:   { en: 'Chunking',   zh: '切分中',  color: 'var(--secondary)' },
  embedding:  { en: 'Embedding',  zh: '向量化中', color: 'var(--accent)'    },
  done:       { en: 'Done',       zh: '完成',    color: 'var(--success)'   },
  error:      { en: 'Error',      zh: '失败',    color: 'var(--danger)'    },
};

/* ── Helpers ─────────────────────────────────────────────── */

function embColor(pct: number): string {
  if (pct === 100) return 'var(--success)';
  if (pct  > 60)  return 'var(--warning)';
  return 'var(--secondary)';
}

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1)  return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

/* ── Sub-components ──────────────────────────────────────── */

function StatCard({ val, label, pct, color }: { val: string; label: string; pct: number; color: string }) {
  return (
    <div className="card card-hover" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>{label}</div>
      <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginTop: 6 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg,${color},${color}88)` }} />
      </div>
    </div>
  );
}

function ChunkViz({ index, text }: { index: number; text: string }) {
  const bars = Array.from({ length: 32 }, (_, i) => 20 + ((i * 37 + index * 13) % 80));
  return (
    <div className="card" style={{ padding: '13px 15px', marginBottom: 11, background: 'var(--surface-1)' }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--secondary)', padding: '2px 8px', borderRadius: 5, background: 'rgba(0,212,255,0.1)' }}>
          chunk_{String(index + 1).padStart(4, '0')}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>768-dim</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--sub)' }}>{text}</div>
      <div className="row" style={{ gap: 2, marginTop: 10, alignItems: 'flex-end', height: 24 }}>
        {bars.map((h, i) => (
          <i key={i} style={{ flex: 1, borderRadius: 1, background: 'var(--primary)', opacity: 0.55, height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function KnowledgeGraph() {
  const { b } = useT();
  const nodes = [
    { x: 280, y: 190, r: 30, label: { en: 'Beijing 楼市', zh: '北京楼市' }, color: '#4F7CFF' },
    { x: 130, y:  90, r: 22, label: { en: '海淀', zh: '海淀' }, color: '#00D4FF' },
    { x: 130, y: 290, r: 22, label: { en: '西城', zh: '西城' }, color: '#00D4FF' },
    { x: 430, y: 100, r: 22, label: { en: '朝阳', zh: '朝阳' }, color: '#00D4FF' },
    { x:  60, y: 190, r: 17, label: { en: '学区', zh: '学区' }, color: '#7C3AED' },
    { x: 460, y: 270, r: 17, label: { en: '政策', zh: '政策' }, color: '#F59E0B' },
    { x: 380, y: 320, r: 17, label: { en: '房贷', zh: '房贷' }, color: '#10B981' },
  ];
  const edges = [[0,1],[0,2],[0,3],[1,4],[2,4],[0,5],[0,6],[3,5]];
  return (
    <svg viewBox="0 0 560 380" style={{ width: '100%', height: 380 }}>
      {edges.map(([a, c], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[c].x} y2={nodes[c].y}
          stroke="#94A3B8" strokeOpacity="0.25" strokeWidth="1.4" />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r}       fill={n.color} opacity="0.16" />
          <circle cx={n.x} cy={n.y} r={n.r * 0.5} fill={n.color} />
          <text x={n.x} y={n.y - n.r - 6} textAnchor="middle" fontSize="11" fill="var(--sub)" fontWeight="600">
            {b(n.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ── Main page ───────────────────────────────────────────── */

export default function Knowledge() {
  const { b, lang } = useT();
  const store   = useKnowledgeStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag]         = useState(false);
  const [tab,  setTab]          = useState('chunks');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  /* RAG search state */
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMs,  setSearchMs]  = useState<number | null>(null);

  /* Seed docs when store is empty */
  useEffect(() => {
    if (store.docs.length === 0) {
      SEED_DOCS.forEach((d) => store.addDoc(d));
    }
    /* Load remote docs if backend is configured */
    fetchRemoteDocs().then((remote) => {
      remote.forEach((d) => {
        if (!store.docs.find((x) => x.id === d.id)) store.addDoc(d);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDocs = store.docs;
  const activeDoc = allDocs.find((d) => d.id === activeDocId) ?? allDocs[0] ?? null;

  /* ── File ingestion ─────────────────────────────────── */

  const ingestFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    arr.forEach((file) => {
      const id: string = makeId();
      const doc: KbDoc = {
        id,
        name:       file.name,
        size:       file.size,
        mimeType:   file.type || 'application/octet-stream',
        chunks:     0,
        embed:      0,
        phase:      'uploading',
        uploadedAt: Date.now(),
      };
      store.addDoc(doc);

      void uploadDocument(
        file,
        (phase, pct) => {
          if (phase === 'embedding') {
            store.patchDoc(id, { phase, embed: pct });
          } else if (phase === 'done') {
            /* embed stays at 100, mark done */
          } else {
            store.patchDoc(id, { phase });
          }
        },
      ).then(({ hash, url, chunks }) => {
        store.patchDoc(id, { hash, url, chunks, embed: 100, phase: 'done' });
        setActiveDocId(id);
      }).catch((err) => {
        store.patchDoc(id, { phase: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      });
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
    e.target.value = '';
  };

  /* ── Delete ─────────────────────────────────────────── */

  const onDelete = async (id: string) => {
    try { await deleteDocument(id); } catch { /* offline — still remove locally */ }
    store.removeDoc(id);
    if (activeDocId === id) setActiveDocId(null);
  };

  /* ── RAG search ─────────────────────────────────────── */

  const onSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    const t0 = Date.now();
    try {
      const res = await searchKnowledge(query.trim());
      setSearchMs(Date.now() - t0);
      setResults(res);
    } finally {
      setSearching(false);
    }
  };

  /* ── Computed stats ──────────────────────────────────── */

  const doneDocs   = allDocs.filter((d) => d.phase === 'done').length;
  const totalChunks = allDocs.reduce((a, d) => a + d.chunks, 0);
  const avgEmbed   = allDocs.length ? Math.round(allDocs.reduce((a, d) => a + d.embed, 0) / allDocs.length) : 0;
  const totalSize  = allDocs.reduce((a, d) => a + d.size, 0);

  const Trash  = getIcon('trash');
  const Upload = getIcon('doc');
  const Sparkle = getIcon('sparkle');

  return (
    <AppShell title={{ en: 'Knowledge Base', zh: '知识库' }} crumb="atlas / intelligence / knowledge">
      <PageHead
        title={{ en: 'Knowledge Base', zh: '知识库' }}
        desc={{ en: 'Upload, chunk, embed, and test documents that ground your agents — a full RAG pipeline.', zh: '上传、切分、向量化并测试为智能体提供依据的文档 —— 完整的 RAG 管线。' }}
      />

      {/* Stats */}
      <div className="grid-base grid-4" style={{ marginBottom: 24 }}>
        <StatCard val={doneDocs.toLocaleString()}          label={lang === 'zh' ? '已索引文档' : 'Indexed docs'} pct={doneDocs / Math.max(1, allDocs.length) * 100} color="#4F7CFF" />
        <StatCard val={totalChunks.toLocaleString()}       label={lang === 'zh' ? '向量切片'   : 'Vector chunks'} pct={Math.min(100, totalChunks / 200)}              color="#00D4FF" />
        <StatCard val={`${avgEmbed}%`}                     label={lang === 'zh' ? '已向量化'   : 'Embedded'}      pct={avgEmbed}                                        color="#10B981" />
        <StatCard val={fmtSize(totalSize)}                 label={lang === 'zh' ? '索引大小'   : 'Index size'}    pct={Math.min(100, totalSize / (50 * 1024 * 1024) * 100)} color="#7C3AED" />
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left: dropzone + doc list ── */}
        <div>
          {/* Dropzone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className="card-hover"
            style={{
              border: `1.5px dashed ${drag ? 'var(--primary)' : 'var(--glass-border-strong)'}`,
              borderRadius: 'var(--r-lg)',
              padding: 28,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 18,
              background: drag ? 'var(--surface-2)' : 'var(--surface-1)',
              transition: 'all 0.2s',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPTED_MIME}
              hidden
              onChange={onFileChange}
            />
            <div style={{ width: 52, height: 52, borderRadius: 15, margin: '0 auto 14px', background: 'var(--grad-iris)', display: 'grid', placeItems: 'center', boxShadow: '0 10px 26px rgba(79,124,255,0.4)' }}>
              <Upload color="#fff" size={26} />
            </div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>
              {drag
                ? lang === 'zh' ? '释放以上传' : 'Drop to upload'
                : lang === 'zh' ? '拖拽文档以建立索引' : 'Drop documents to index'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--sub)' }}>
              {lang === 'zh'
                ? '或点击选择 —— 上传后自动切分与向量化'
                : 'or click to browse — auto-chunked & embedded on upload'}
            </p>
            <div className="row gap-2" style={{ justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              {['PDF', 'Word', 'Excel', 'Image', 'Audio', 'Video', 'Text'].map((f) => (
                <span key={f} className="mono" style={{ fontSize: 10.5, padding: '4px 9px', borderRadius: 6, background: 'var(--surface-3)', color: 'var(--sub)' }}>{f}</span>
              ))}
            </div>
          </div>

          {/* Doc list */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 650, fontSize: 14 }}>{lang === 'zh' ? '文档列表' : 'Documents'}</span>
              <div className="row gap-3">
                <span className="badge badge-primary mono">{allDocs.length}</span>
                {allDocs.length > 0 && (
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--danger)', padding: '2px 8px' }}
                    onClick={() => store.clearAll()}
                  >
                    <Trash size={12} />
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {allDocs.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  {lang === 'zh' ? '暂无文档，请上传' : 'No documents yet — upload one above'}
                </div>
              ) : (
                allDocs.map((d) => {
                  const Icon  = getIcon(mimeIcon(d.mimeType));
                  const color = mimeColor(d.mimeType);
                  const pl    = PHASE_LABEL[d.phase];
                  const isActive = d.id === (activeDoc?.id ?? null);
                  return (
                    <motion.div
                      key={d.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="row gap-3"
                      onClick={() => setActiveDocId(d.id)}
                      style={{
                        padding: '13px 16px',
                        borderBottom: '1px solid var(--glass-border)',
                        cursor: 'pointer',
                        background: isActive ? 'var(--surface-2)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${color},${color}99)` }}>
                        <Icon color="#fff" size={18} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {fmtSize(d.size)} · {d.chunks} chunks · {relTime(d.uploadedAt)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {d.phase !== 'done' ? (
                          <span className="mono" style={{ fontSize: 11, color: pl.color }}>
                            {lang === 'zh' ? pl.zh : pl.en}…
                          </span>
                        ) : (
                          <span className="mono" style={{ fontSize: 11, color: embColor(d.embed) }}>
                            {lang === 'zh' ? '已向量化' : 'embedded'} {d.embed}%
                          </span>
                        )}
                        <div style={{ width: 80, height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginTop: 5 }}>
                          <motion.div
                            style={{ height: '100%', borderRadius: 999, background: d.phase === 'done' ? embColor(d.embed) : pl.color }}
                            animate={{ width: `${d.embed}%` }}
                            transition={{ ease: 'easeOut', duration: 0.5 }}
                          />
                        </div>
                      </div>
                      <button
                        className="icon-btn"
                        style={{ flexShrink: 0, color: 'var(--muted)', background: 'none', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); void onDelete(d.id); }}
                        aria-label="Delete"
                      >
                        <Trash size={14} />
                      </button>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        <div className="card" style={{ padding: 18, position: 'sticky', top: 90 }}>
          {/* Tab bar */}
          <div className="row gap-2" style={{ padding: 5, background: 'var(--surface-1)', borderRadius: 'var(--r-sm)', marginBottom: 16, border: '1px solid var(--glass-border)' }}>
            {TABS.map((t) => (
              <div
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('mono')}
                style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: tab === t.id ? 'var(--text)' : 'var(--sub)', background: tab === t.id ? 'var(--surface-3)' : 'transparent' }}
              >
                {b(t.label)}
              </div>
            ))}
          </div>

          {/* ── Chunks tab ── */}
          {tab === 'chunks' && (
            <>
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
                {activeDoc ? `${activeDoc.name} · ${activeDoc.chunks} chunks` : lang === 'zh' ? '请选择文档' : 'Select a document'}
              </div>
              {activeDoc && activeDoc.phase === 'done' ? (
                /* Show 3 sample chunks from the active doc */
                [
                  '海淀区中关村学区涵盖中关村第一、第二、第三小学，划片范围包括科育路、双榆树等社区，均价约 ¥118,000/㎡。',
                  '西城区金融街学区为北京顶级学区之一，对口实验二小，均价约 ¥152,000/㎡，供应极为紧张。',
                  '朝阳区望京学区近年教学质量提升明显，均价约 ¥72,000/㎡，地铁 14 号线覆盖。',
                ].map((text, i) => <ChunkViz key={i} index={i} text={text} />)
              ) : activeDoc && activeDoc.phase !== 'done' ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>
                  <div style={{ marginBottom: 8, color: PHASE_LABEL[activeDoc.phase].color }}>
                    {lang === 'zh' ? PHASE_LABEL[activeDoc.phase].zh : PHASE_LABEL[activeDoc.phase].en}…
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <motion.div
                      style={{ height: '100%', borderRadius: 999, background: PHASE_LABEL[activeDoc.phase].color }}
                      animate={{ width: `${activeDoc.embed}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* ── RAG test tab ── */}
          {tab === 'test' && (
            <>
              <div className="row gap-2" style={{ marginBottom: 14 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void onSearch()}
                  placeholder={lang === 'zh' ? '输入问题进行语义检索…' : 'Enter a query to search semantically…'}
                  style={{ flex: 1, padding: '11px 16px', borderRadius: 'var(--r-sm)', background: 'var(--surface-1)', border: '1px solid var(--glass-border)', color: 'var(--text)', fontSize: 14, outline: 'none' }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => void onSearch()}
                  disabled={searching || !query.trim()}
                >
                  {searching ? (
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  ) : <Sparkle size={15} />}
                  {lang === 'zh' ? '检索' : 'Search'}
                </button>
              </div>

              {searchMs !== null && results.length > 0 && (
                <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  {lang === 'zh'
                    ? `检索到 ${results.length} 个切片 · ${searchMs}ms`
                    : `Retrieved ${results.length} chunks · ${searchMs}ms`}
                </div>
              )}

              <AnimatePresence>
                {results.map((r, i) => (
                  <motion.div
                    key={r.chunkId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="card"
                    style={{ padding: '13px 15px', marginBottom: 11, background: 'var(--surface-1)' }}
                  >
                    <div className="row gap-2" style={{ marginBottom: 8 }}>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--secondary)', padding: '2px 8px', borderRadius: 5, background: 'rgba(0,212,255,0.1)' }}>
                        {r.chunkId}
                      </span>
                      <span className="badge badge-success" style={{ fontSize: 9 }}>score {r.pct}%</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.docName}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--sub)' }}>{r.content}</div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {searchMs !== null && results.length === 0 && !searching && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13 }}>
                  {lang === 'zh' ? '未找到相关切片' : 'No relevant chunks found'}
                </div>
              )}
            </>
          )}

          {/* ── Knowledge graph tab ── */}
          {tab === 'graph' && <KnowledgeGraph />}
        </div>
      </div>
    </AppShell>
  );
}
