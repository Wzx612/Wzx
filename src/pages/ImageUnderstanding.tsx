import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';

/* ============================================================
   Types
   ============================================================ */

interface AnalysisResult {
  summary: string;
  objects: string[];
  texts: string[];
  scene: string;
  style: string;
  tags: string[];
}

interface VisionRecord {
  id: string;
  image_url: string;
  original_filename: string;
  result: AnalysisResult;
  latency_ms: number;
  token_input: number;
  token_output: number;
  created_at: string;
}

interface HistoryItem {
  id: string;
  image_url: string;
  original_filename: string;
  summary: string;
  tags: string[];
  created_at: string;
  status: string;
  latency_ms: number | null;
}

type AnalysisStatus = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

/* ============================================================
   Constants
   ============================================================ */

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 10;

/* ============================================================
   Sub-components
   ============================================================ */

function TagBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 550,
        background: 'rgba(79,124,255,0.12)',
        color: 'var(--secondary)',
        border: '1px solid rgba(79,124,255,0.2)',
      }}
    >
      {label}
    </span>
  );
}

function ResultSection({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  const Icon = getIcon(icon);
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-1)',
        border: '1px solid var(--glass-border)',
        marginBottom: 10,
      }}
    >
      <div
        className="row gap-2"
        style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--sub)', marginBottom: 10 }}
      >
        <Icon size={14} />
        {title}
      </div>
      {children}
    </div>
  );
}

/* ============================================================
   Main page
   ============================================================ */

export default function ImageUnderstanding() {
  const { lang } = useT();
  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  /* state */
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [result, setResult] = useState<VisionRecord | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ScanIcon    = getIcon('vision');
  const UploadIcon  = getIcon('upload');
  const DownloadIcon = getIcon('download');
  const CopyIcon    = getIcon('copy');
  const RefreshIcon = getIcon('refresh');
  const ClockIcon   = getIcon('clock');
  const TrashIcon   = getIcon('trash');

  /* ── File handling ─────────────────────────────────────── */

  const acceptFile = useCallback((file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setErrorMsg(t('不支持的格式，请上传 JPG、PNG 或 WebP', 'Unsupported format — use JPG, PNG, or WebP'));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(t(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），最大 10 MB`, `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 10 MB`));
      return;
    }
    setErrorMsg('');
    setStatus('idle');
    setResult(null);
    setFileName(file.name);
    setFileObj(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }, [lang]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) acceptFile(file);
  }, [acceptFile]);

  /* ── Analysis ───────────────────────────────────────────── */

  const analyze = useCallback(async () => {
    if (!fileObj || status === 'uploading' || status === 'analyzing') return;

    setStatus('uploading');
    setProgress(0);
    setErrorMsg('');
    setResult(null);

    const form = new FormData();
    form.append('file', fileObj);

    try {
      // Simulate upload progress (XHR not needed for small files, but gives good UX)
      const progressTimer = setInterval(() => {
        setProgress((p) => Math.min(p + 15, 85));
      }, 200);

      setStatus('analyzing');

      const res = await fetch(`${API_BASE}/api/vision/analyze`, {
        method: 'POST',
        body: form,
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }

      setProgress(100);
      const data = await res.json() as VisionRecord;
      setResult(data);
      setStatus('done');

      // Prepend to history
      setHistory((prev) => [
        {
          id: data.id,
          image_url: data.image_url,
          original_filename: data.original_filename,
          summary: data.result.summary,
          tags: data.result.tags,
          created_at: data.created_at,
          status: 'done',
          latency_ms: data.latency_ms,
        },
        ...prev,
      ]);
    } catch (err) {
      setStatus('error');
      setProgress(0);
      setErrorMsg(err instanceof Error ? err.message : t('分析失败，请重试', 'Analysis failed'));
    }
  }, [fileObj, status, lang]);

  /* ── History ────────────────────────────────────────────── */

  const loadHistory = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`${API_BASE}/api/vision/history?page=${page}&page_size=8`);
      if (!res.ok) return;
      const data = await res.json() as { items: HistoryItem[]; total: number };
      setHistory(data.items);
      setHistoryTotal(data.total);
      setHistoryPage(page);
      setHistoryLoaded(true);
    } catch {
      /* non-critical */
    }
  }, []);

  const loadRecord = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/vision/history/${id}`);
      if (!res.ok) return;
      const data = await res.json() as VisionRecord;
      setResult(data);
      setPreview(data.image_url);
      setFileName(data.original_filename);
      setStatus('done');
    } catch {
      /* non-critical */
    }
  }, []);

  /* ── Export / copy ──────────────────────────────────────── */

  const copyResult = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.result, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vision_${result.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStatus('idle');
    setPreview(null);
    setFileName('');
    setFileObj(null);
    setResult(null);
    setErrorMsg('');
    setProgress(0);
  };

  /* ── Render ─────────────────────────────────────────────── */

  const isLoading = status === 'uploading' || status === 'analyzing';

  return (
    <AppShell title={{ en: 'Image Understanding', zh: '图像理解' }} crumb="atlas / vision">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 360px',
          gap: 20,
        }}
      >
        {/* ── Left: upload + result ─────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Upload zone */}
          <div
            className="card"
            style={{ padding: 0, overflow: 'hidden' }}
          >
            {/* Header */}
            <div
              className="row gap-3"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--surface-2)',
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  display: 'grid', placeItems: 'center',
                  background: 'var(--grad-iris)',
                }}
              >
                <ScanIcon size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 650, fontSize: 15 }}>
                  {t('图像理解', 'Image Understanding')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                  {t('Qwen-VL-Max 视觉分析', 'Powered by Qwen-VL-Max')}
                </div>
              </div>
              {result && (
                <div className="row gap-2" style={{ marginLeft: 'auto' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={copyResult}
                    style={{ gap: 5 }}
                  >
                    <CopyIcon size={13} />
                    {copied ? t('已复制', 'Copied!') : t('复制', 'Copy')}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={exportJson}
                    style={{ gap: 5 }}
                  >
                    <DownloadIcon size={13} />
                    {t('导出 JSON', 'Export JSON')}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={reset}
                    style={{ gap: 5, color: 'var(--danger)' }}
                  >
                    <TrashIcon size={13} />
                    {t('清除', 'Clear')}
                  </button>
                </div>
              )}
            </div>

            {/* Drop zone or preview */}
            <div style={{ padding: 20 }}>
              {!preview ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? 'var(--secondary)' : 'var(--glass-border)'}`,
                    borderRadius: 16,
                    padding: '48px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
                  }}
                >
                  <div
                    style={{
                      width: 60, height: 60, borderRadius: 18,
                      margin: '0 auto 16px',
                      display: 'grid', placeItems: 'center',
                      background: 'var(--grad-primary)',
                      boxShadow: '0 12px 30px rgba(79,124,255,0.35)',
                    }}
                  >
                    <UploadIcon size={26} color="#fff" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                    {t('拖拽或点击上传图片', 'Drag & drop or click to upload')}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {t('支持 JPG、PNG、WebP · 最大 10 MB', 'Supports JPG, PNG, WebP · Max 10 MB')}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Image preview */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={preview}
                      alt="preview"
                      style={{
                        width: 240, height: 180,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: '1px solid var(--glass-border)',
                        display: 'block',
                      }}
                    />
                    {isLoading && (
                      <div
                        style={{
                          position: 'absolute', inset: 0,
                          borderRadius: 12,
                          background: 'rgba(11,16,32,0.7)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 36, height: 36,
                            border: '3px solid var(--glass-border)',
                            borderTopColor: 'var(--secondary)',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }}
                        />
                        <div style={{ fontSize: 12, color: 'var(--secondary)', fontWeight: 600 }}>
                          {status === 'uploading'
                            ? t('上传中…', 'Uploading…')
                            : t('AI 分析中…', 'Analyzing…')}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* File info + actions */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, wordBreak: 'break-all' }}>
                      {fileName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                      {fileObj ? `${(fileObj.size / 1024).toFixed(0)} KB` : ''}
                    </div>

                    {/* Progress bar */}
                    {isLoading && (
                      <div style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            height: 4, borderRadius: 2,
                            background: 'var(--surface-3)',
                            overflow: 'hidden',
                            marginBottom: 6,
                          }}
                        >
                          <motion.div
                            style={{ height: '100%', background: 'var(--grad-primary)', borderRadius: 2 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {progress}% {status === 'uploading' ? t('上传中', 'uploading') : t('分析中', 'analyzing')}
                        </div>
                      </div>
                    )}

                    <div className="row gap-2">
                      {status !== 'done' ? (
                        <button
                          className="btn btn-primary"
                          style={{ gap: 6 }}
                          onClick={() => void analyze()}
                          disabled={isLoading}
                        >
                          <ScanIcon size={14} />
                          {t('AI 分析', 'Analyze Image')}
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm"
                          style={{ gap: 6, background: 'var(--surface-3)', color: 'var(--sub)' }}
                          onClick={() => void analyze()}
                        >
                          <RefreshIcon size={13} />
                          {t('重新分析', 'Re-analyze')}
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                      >
                        {t('换图片', 'Change')}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={onFileChange}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(244,63,94,0.1)',
                    border: '1px solid rgba(244,63,94,0.25)',
                    fontSize: 13,
                    color: 'var(--danger)',
                  }}
                >
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          </div>

          {/* Result panel */}
          <AnimatePresence>
            {result && status === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="card"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                {/* Result header */}
                <div
                  className="row gap-3"
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--glass-border)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <div style={{ fontWeight: 650, fontSize: 14, flex: 1 }}>
                    {t('分析结果', 'Analysis Result')}
                  </div>
                  <div className="row gap-3" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    <span className="row gap-1">
                      <ClockIcon size={12} />
                      {result.latency_ms} ms
                    </span>
                    <span className="mono">
                      {result.token_input + result.token_output} tokens
                    </span>
                  </div>
                </div>

                <div style={{ padding: 16 }}>
                  {/* Summary */}
                  <ResultSection icon="eye" title={t('总览', 'Overview')}>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>
                      {result.result.summary}
                    </p>
                  </ResultSection>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Scene */}
                    <ResultSection icon="map" title={t('场景', 'Scene')}>
                      <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{result.result.scene || '—'}</div>
                    </ResultSection>

                    {/* Style */}
                    <ResultSection icon="sparkle" title={t('风格', 'Style')}>
                      <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{result.result.style || '—'}</div>
                    </ResultSection>
                  </div>

                  {/* Objects */}
                  {result.result.objects.length > 0 && (
                    <ResultSection icon="boxes" title={t('识别物体', 'Objects')}>
                      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                        {result.result.objects.map((obj, i) => (
                          <TagBadge key={i} label={obj} />
                        ))}
                      </div>
                    </ResultSection>
                  )}

                  {/* OCR Texts */}
                  {result.result.texts.length > 0 && (
                    <ResultSection icon="text" title={t('OCR 识别文字', 'OCR Text')}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {result.result.texts.map((txt, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              background: 'var(--surface-3)',
                              fontSize: 13,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text)',
                            }}
                          >
                            {txt}
                          </div>
                        ))}
                      </div>
                    </ResultSection>
                  )}

                  {/* Tags */}
                  {result.result.tags.length > 0 && (
                    <ResultSection icon="tag" title={t('标签', 'Tags')}>
                      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                        {result.result.tags.map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 550,
                              background: 'rgba(16,185,129,0.12)',
                              color: 'var(--success)',
                              border: '1px solid rgba(16,185,129,0.2)',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </ResultSection>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: history sidebar ───────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
            <div
              className="row"
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--surface-2)',
              }}
            >
              <span style={{ fontWeight: 650, fontSize: 13.5, flex: 1 }}>
                {t('历史记录', 'Analysis History')}
              </span>
              {!historyLoaded ? (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11.5, gap: 4 }}
                  onClick={() => void loadHistory(1)}
                >
                  {t('加载', 'Load')}
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11.5, gap: 4 }}
                  onClick={() => void loadHistory(historyPage)}
                >
                  <RefreshIcon size={11} />
                </button>
              )}
            </div>

            <div style={{ padding: 10, overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
              {!historyLoaded ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}
                >
                  {t('点击「加载」查看历史', 'Click Load to view history')}
                </div>
              ) : history.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}
                >
                  {t('暂无历史记录', 'No history yet')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {history.map((item) => (
                    <motion.div
                      key={item.id}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => void loadRecord(item.id)}
                      className="card card-hover"
                      style={{
                        padding: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div className="row gap-2" style={{ alignItems: 'flex-start' }}>
                        <img
                          src={item.image_url}
                          alt=""
                          style={{
                            width: 44, height: 44,
                            objectFit: 'cover',
                            borderRadius: 7,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.original_filename}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: 'var(--muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical' as const,
                              lineHeight: 1.5,
                              marginTop: 2,
                            }}
                          >
                            {item.summary}
                          </div>
                        </div>
                      </div>
                      {item.tags.length > 0 && (
                        <div className="row gap-1" style={{ flexWrap: 'wrap' }}>
                          {item.tags.slice(0, 3).map((tag, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 10.5,
                                padding: '1px 7px',
                                borderRadius: 999,
                                background: 'rgba(16,185,129,0.1)',
                                color: 'var(--success)',
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className="row"
                        style={{
                          fontSize: 10.5,
                          color: 'var(--muted)',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{new Date(item.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                        {item.latency_ms && <span>{item.latency_ms} ms</span>}
                      </div>
                    </motion.div>
                  ))}

                  {/* Pagination */}
                  {historyTotal > 8 && (
                    <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 8 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={historyPage <= 1}
                        onClick={() => void loadHistory(historyPage - 1)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        ‹
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                        {historyPage} / {Math.ceil(historyTotal / 8)}
                      </span>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={historyPage >= Math.ceil(historyTotal / 8)}
                        onClick={() => void loadHistory(historyPage + 1)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
