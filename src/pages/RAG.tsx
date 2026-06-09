import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { genId } from '@/lib/id';
import { authedFetch } from '@/services/api';

/* ============================================================
   Types
   ============================================================ */

interface DocRecord {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: 'processing' | 'ready' | 'error';
  chunk_count: number;
  error_message?: string;
  created_at: string;
}

interface AgentEvent {
  name: string;
  action: string;
  done: boolean;
}

interface SourceRef {
  chunk_id: string;
  document_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agents: AgentEvent[];
  sources: SourceRef[];
  streaming: boolean;
  error?: string;
}

/* ============================================================
   Constants
   ============================================================ */

const ACCEPTED = [
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.md', '.txt', '.py', '.js', '.ts', '.tsx', '.jsx',
  '.java', '.go', '.rs', '.yaml', '.yml', '.json',
];

// Must match backend MAX_BYTES (rag.py = 50 MB). Reject oversized files up front
// so the user gets a clear message instead of a connection reset from the gateway.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const FILE_TYPE_ICON: Record<string, string> = {
  pdf: 'file',
  docx: 'file',
  xlsx: 'table',
  pptx: 'slides',
  markdown: 'file',
  code: 'file-code',
  text: 'file',
};

/* ============================================================
   Helper components
   ============================================================ */

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'ready' ? 'var(--success)' :
    status === 'error' ? 'var(--danger)' :
    'var(--secondary)';
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0, display: 'inline-block',
      boxShadow: status === 'processing' ? `0 0 6px ${color}` : 'none',
      animation: status === 'processing' ? 'pulse 1.5s infinite' : 'none',
    }} />
  );
}

function AgentLine({ ev }: { ev: AgentEvent }) {
  const agentColors: Record<string, string> = {
    QueryAnalyzer: '#f59e0b',
    Retriever: '#3b82f6',
    Synthesizer: '#8b5cf6',
    CitationAgent: '#10b981',
  };
  const color = agentColors[ev.name] || 'var(--sub)';
  const CheckIcon = getIcon('check-circle');
  const LoaderIcon = getIcon('loader');
  return (
    <div className="row gap-2" style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 0' }}>
      <span style={{ color, fontWeight: 650, minWidth: 100, fontSize: 11 }}>{ev.name}</span>
      {ev.done
        ? <CheckIcon size={11} color="var(--success)" style={{ flexShrink: 0 }} />
        : <LoaderIcon size={11} color={color} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      }
      <span>{ev.action}</span>
    </div>
  );
}

function SourceCard({ src, index }: { src: SourceRef; index: number }) {
  const [open, setOpen] = useState(false);
  const ChevronIcon = getIcon('chevron-right');
  return (
    <div
      style={{
        borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--glass-border)',
        background: 'var(--surface-1)',
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="row gap-2"
        style={{
          width: '100%', padding: '7px 10px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <ChevronIcon
          size={12}
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}
          color="var(--sub)"
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--sub)', flex: 1 }}>
          [{index + 1}] {src.filename} · 第{src.chunk_index + 1}段
        </span>
        <span style={{
          fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
          background: `rgba(59,130,246,${src.similarity * 0.4})`,
          color: 'var(--secondary)',
        }}>
          {(src.similarity * 100).toFixed(1)}%
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '6px 10px 10px',
              fontSize: 12, color: 'var(--muted)',
              lineHeight: 1.6,
              borderTop: '1px solid var(--glass-border)',
            }}>
              {src.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   Main page
   ============================================================ */

export default function RAG() {
  const { lang, t } = useT();

  /* ── Document state ─────────────────────────────────────── */
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Chat state ─────────────────────────────────────────── */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Polling for processing docs ────────────────────────── */
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const Icons = {
    Layers: getIcon('layers'),
    FilePlus: getIcon('file-add'),
    Upload: getIcon('upload'),
    Trash: getIcon('trash'),
    Send: getIcon('send'),
    Loader: getIcon('loader'),
    MsgCircle: getIcon('msg-circle'),
    File: getIcon('file'),
    Refresh: getIcon('refresh'),
  };

  /* ── Load documents ─────────────────────────────────────── */
  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await authedFetch('/api/rag/documents?page=1&page_size=50');
      if (res.ok) {
        const data = await res.json() as { items: DocRecord[] };
        setDocs(data.items);
      }
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  /* Poll every 3s while any doc is processing */
  useEffect(() => {
    const hasProcessing = docs.some(d => d.status === 'processing');
    if (hasProcessing && !pollTimer.current) {
      pollTimer.current = setInterval(() => void loadDocs(), 3000);
    } else if (!hasProcessing && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    return () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [docs, loadDocs]);

  /* ── Upload ─────────────────────────────────────────────── */
  const uploadFile = useCallback(async (file: File) => {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setUploadError(`不支持的格式 "${ext}"`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 50 MB`);
      return;
    }
    setUploading(true);
    setUploadError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await authedFetch('/api/rag/documents', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText })) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      const doc = await res.json() as DocRecord;
      setDocs(prev => [doc, ...prev]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => void uploadFile(f));
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(f => void uploadFile(f));
  }, [uploadFile]);

  /* ── Delete document ────────────────────────────────────── */
  const deleteDoc = useCallback(async (id: string) => {
    await authedFetch(`/api/rag/documents/${id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== id));
  }, []);

  /* ── Chat ───────────────────────────────────────────────── */
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const sendQuery = useCallback(async () => {
    if (!query.trim() || chatLoading) return;

    const userMsg: ChatMsg = {
      id: genId(),
      role: 'user',
      content: query.trim(),
      agents: [], sources: [], streaming: false,
    };

    const assistantId = genId();
    const assistantMsg: ChatMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      agents: [], sources: [], streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setQuery('');
    setChatLoading(true);

    try {
      const res = await authedFetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content, top_k: 5 }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const updateMsg = (updater: (prev: ChatMsg) => ChatMsg) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? updater(m) : m)
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string;
              name?: string; action?: string; done?: boolean;
              content?: string;
              sources?: SourceRef[];
              message?: string;
            };

            if (evt.type === 'agent') {
              updateMsg(m => {
                const existing = m.agents.findIndex(a => a.name === evt.name);
                const ev: AgentEvent = { name: evt.name!, action: evt.action!, done: !!evt.done };
                if (existing >= 0) {
                  const next = [...m.agents];
                  next[existing] = ev;
                  return { ...m, agents: next };
                }
                return { ...m, agents: [...m.agents, ev] };
              });
            } else if (evt.type === 'chunk') {
              updateMsg(m => ({ ...m, content: m.content + (evt.content ?? '') }));
            } else if (evt.type === 'sources') {
              updateMsg(m => ({ ...m, sources: evt.sources ?? [] }));
            } else if (evt.type === 'error') {
              updateMsg(m => ({ ...m, error: evt.message, streaming: false }));
            } else if (evt.type === 'done') {
              updateMsg(m => ({ ...m, streaming: false }));
            }
          } catch { /* malformed line */ }
        }
        scrollToBottom();
      }

      updateMsg(m => ({ ...m, streaming: false }));
    } catch (e) {
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, error: e instanceof Error ? e.message : '请求失败', streaming: false }
          : m
        )
      );
    } finally {
      setChatLoading(false);
      scrollToBottom();
    }
  }, [query, chatLoading]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendQuery(); }
  };

  const readyDocs = docs.filter(d => d.status === 'ready');

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <AppShell title={{ zh: 'RAG 知识库', en: 'RAG Knowledge Base' }} crumb="atlas / rag">
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: 20,
        height: 'calc(100vh - var(--topbar-h) - 56px)',
      }}>

        {/* ── Left: Knowledge base panel ───────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div className="row gap-2" style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center',
              background: 'var(--grad-primary)',
            }}>
              <Icons.Layers size={16} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 13.5 }}>
                {lang === 'zh' ? '知识库' : 'Knowledge Base'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {docs.length} {lang === 'zh' ? '份文档' : 'documents'} · {readyDocs.length} {lang === 'zh' ? '就绪' : 'ready'}
              </div>
            </div>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => void loadDocs()}
              style={{ padding: '5px' }}
            >
              <Icons.Refresh size={13} />
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              margin: '12px 12px 8px',
              border: `2px dashed ${dragging ? 'var(--secondary)' : 'var(--glass-border)'}`,
              borderRadius: 12,
              padding: '16px 12px',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {uploading ? (
              <div className="row gap-2" style={{ justifyContent: 'center', fontSize: 12.5, color: 'var(--secondary)' }}>
                <Icons.Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {t('rag.uploading')}
              </div>
            ) : (
              <>
                <Icons.FilePlus size={20} color="var(--sub)" style={{ margin: '0 auto 6px' }} />
                <div style={{ fontSize: 12, color: 'var(--sub)', fontWeight: 600 }}>
                  {t('rag.noDrop')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {t('rag.formats')}
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED.join(',')}
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {uploadError && (
            <div style={{
              margin: '0 12px 8px',
              padding: '7px 10px',
              borderRadius: 7,
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.2)',
              fontSize: 12,
              color: 'var(--danger)',
              flexShrink: 0,
            }}>
              ⚠ {uploadError}
            </div>
          )}

          {/* Document list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
            {docsLoading && docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 12 }}>
                <Icons.Loader size={18} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 6px', display: 'block' }} />
                {lang === 'zh' ? '加载中…' : 'Loading…'}
              </div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 12 }}>
                {t('rag.noDoc')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {docs.map(doc => {
                  const FileIcon = getIcon(FILE_TYPE_ICON[doc.file_type] || 'file');
                  return (
                    <motion.div
                      key={doc.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="card"
                      style={{ padding: '9px 10px' }}
                    >
                      <div className="row gap-2">
                        <FileIcon size={15} color="var(--sub)" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12.5, fontWeight: 600,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {doc.filename}
                          </div>
                          <div className="row gap-2" style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                            <StatusDot status={doc.status} />
                            <span>
                              {doc.status === 'ready'
                                ? `${doc.chunk_count} ${t('rag.chunks')}`
                                : doc.status === 'error'
                                ? (doc.error_message?.slice(0, 30) ?? t('rag.error'))
                                : t('rag.processing')}
                            </span>
                            <span style={{ marginLeft: 'auto' }}>
                              {(doc.file_size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ padding: '3px 5px', color: 'var(--danger)', opacity: 0.6 }}
                          onClick={() => void deleteDoc(doc.id)}
                          title={t('rag.delete')}
                        >
                          <Icons.Trash size={12} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Chat panel ─────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Chat header */}
          <div className="row gap-2" style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}>
            <Icons.MsgCircle size={16} color="var(--secondary)" />
            <span style={{ fontWeight: 650, fontSize: 14 }}>
              {lang === 'zh' ? '知识库问答' : 'Knowledge Q&A'}
            </span>
            {readyDocs.length > 0 && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 11.5,
                padding: '2px 10px',
                borderRadius: 999,
                background: 'rgba(16,185,129,0.12)',
                color: 'var(--success)',
              }}>
                {readyDocs.length} {lang === 'zh' ? '份文档就绪' : 'docs ready'}
              </span>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10 }}>
                <Icons.Layers size={36} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {readyDocs.length === 0
                    ? t('rag.noKb')
                    : (lang === 'zh' ? '向知识库提问' : 'Ask your knowledge base')}
                </div>
                {readyDocs.length > 0 && (
                  <div style={{ fontSize: 12.5, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
                    {lang === 'zh'
                      ? `已索引 ${readyDocs.length} 份文档，共 ${readyDocs.reduce((a, d) => a + d.chunk_count, 0)} 个段落，输入问题开始检索`
                      : `${readyDocs.length} documents indexed with ${readyDocs.reduce((a, d) => a + d.chunk_count, 0)} chunks. Start asking questions.`}
                  </div>
                )}
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 8,
                  }}
                >
                  {/* User bubble */}
                  {msg.role === 'user' && (
                    <div style={{
                      maxWidth: '75%',
                      padding: '10px 14px',
                      borderRadius: '16px 16px 4px 16px',
                      background: 'var(--grad-primary)',
                      color: '#fff',
                      fontSize: 14,
                      lineHeight: 1.6,
                      boxShadow: '0 4px 16px rgba(79,124,255,0.3)',
                    }}>
                      {msg.content}
                    </div>
                  )}

                  {/* Assistant: agent log */}
                  {msg.role === 'assistant' && msg.agents.length > 0 && (
                    <div style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      maxWidth: '85%',
                      width: '100%',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em' }}>
                        {lang === 'zh' ? 'AGENT 活动' : 'AGENT ACTIVITY'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {msg.agents.map((ev, i) => (
                          <AgentLine key={i} ev={ev} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assistant: answer bubble */}
                  {msg.role === 'assistant' && (
                    <div style={{
                      maxWidth: '85%',
                      padding: '12px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--glass-border)',
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: msg.error ? 'var(--danger)' : 'var(--text)',
                      minWidth: 200,
                    }}>
                      {msg.error
                        ? `⚠ ${msg.error}`
                        : msg.content
                        ? msg.content
                        : msg.streaming
                        ? (
                          <span className="row gap-2" style={{ color: 'var(--muted)', fontSize: 13 }}>
                            <Icons.Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                            {t('rag.thinking')}
                          </span>
                        )
                        : null
                      }
                      {msg.streaming && msg.content && (
                        <span style={{
                          display: 'inline-block', width: 2, height: '1em',
                          background: 'var(--secondary)',
                          animation: 'blink 0.7s infinite',
                          marginLeft: 2, verticalAlign: 'middle',
                        }} />
                      )}
                    </div>
                  )}

                  {/* Sources */}
                  {msg.role === 'assistant' && msg.sources.length > 0 && (
                    <div style={{ maxWidth: '85%', width: '100%' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>
                        {t('rag.sources')} ({msg.sources.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {msg.sources.map((src, i) => (
                          <SourceCard key={src.chunk_id} src={src} index={i} />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: '14px 16px',
            borderTop: '1px solid var(--glass-border)',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}>
            <div className="row gap-3">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={readyDocs.length === 0 ? t('rag.noKb') : t('rag.ask')}
                disabled={chatLoading || readyDocs.length === 0}
                rows={1}
                style={{
                  flex: 1,
                  background: 'var(--surface-1)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 14,
                  color: 'var(--text)',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  maxHeight: 120,
                  overflow: 'auto',
                }}
              />
              <button
                className="btn btn-primary"
                style={{ padding: '10px 16px', borderRadius: 12, gap: 6, flexShrink: 0 }}
                onClick={() => void sendQuery()}
                disabled={chatLoading || !query.trim() || readyDocs.length === 0}
              >
                {chatLoading
                  ? <Icons.Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Icons.Send size={16} />
                }
                {lang === 'zh' ? '发送' : 'Send'}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
              Enter {lang === 'zh' ? '发送' : 'to send'} · Shift+Enter {lang === 'zh' ? '换行' : 'for newline'}
              {readyDocs.length === 0 && (
                <span style={{ color: 'var(--danger)', marginLeft: 8 }}>
                  ← {lang === 'zh' ? '请先上传并等待文档处理完成' : 'Upload a document first'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
