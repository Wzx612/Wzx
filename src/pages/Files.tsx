import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { cn } from '@/lib/format';
import { useFileStore } from '@/store/fileStore';
import {
  uploadFile,
  listFiles,
  deleteFile,
  getDownloadUrl,
} from '@/services/fileService';
import type { FileRecord } from '@/services/fileService';
import { fmtSize } from '@/services/knowledgeService';

/* ── helpers ────────────────────────────────────────────── */

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1)  return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function typeIcon(ft: string): string {
  switch (ft.toLowerCase()) {
    case 'pdf':                return 'doc';
    case 'docx': case 'doc':   return 'doc';
    case 'xlsx': case 'xls':   return 'table';
    case 'pptx': case 'ppt':   return 'slides';
    case 'txt':                return 'text';
    case 'md': case 'markdown': return 'file-code';
    default:                   return 'doc';
  }
}

function typeColor(ft: string): string {
  switch (ft.toLowerCase()) {
    case 'pdf':                return '#F43F5E';
    case 'docx': case 'doc':   return '#4F7CFF';
    case 'xlsx': case 'xls':   return '#10B981';
    case 'pptx': case 'ppt':   return '#F59E0B';
    case 'txt':                return '#94A3B8';
    case 'md': case 'markdown': return '#7C3AED';
    default:                   return '#64748B';
  }
}

const ACCEPTED = [
  '.pdf', '.docx', '.doc', '.xlsx', '.xls',
  '.pptx', '.ppt', '.txt', '.md', '.markdown',
].join(',');

/* ── sub-components ─────────────────────────────────────── */

function StatCard({
  val, label, color,
}: { val: string; label: string; color: string }) {
  return (
    <div className="card card-hover" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>{label}</div>
    </div>
  );
}

/* ── main page ──────────────────────────────────────────── */

export default function Files() {
  const { lang } = useT();
  const store   = useFileStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  /* load file list on mount */
  useEffect(() => {
    void listFiles().then(({ items }) => {
      store.setFiles(items);
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── upload ─────────────────────────────────────────── */

  const ingest = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      const localId = `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      store.addUploading({ localId, name: file.name, size: file.size, progress: 0 });

      uploadFile(file, (pct) => store.patchUploading(localId, { progress: pct }))
        .then((record) => {
          store.removeUploading(localId);
          store.prependFile(record);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          store.patchUploading(localId, { error: msg });
        });
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) ingest(e.dataTransfer.files);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) ingest(e.target.files);
    e.target.value = '';
  };

  /* ── delete ─────────────────────────────────────────── */

  const onDelete = async (id: string) => {
    setDeleteId(id);
    try {
      await deleteFile(id);
      store.removeFile(id);
    } catch { /* show nothing — record may already be gone */ }
    finally { setDeleteId(null); }
  };

  /* ── download ───────────────────────────────────────── */

  const onDownload = async (rec: FileRecord) => {
    try {
      const { url } = await getDownloadUrl(rec.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.file_name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { /* silently ignore presign errors */ }
  };

  /* ── computed stats ─────────────────────────────────── */

  const totalSize  = store.files.reduce((s, f) => s + f.file_size, 0);
  const types      = new Set(store.files.map((f) => f.file_type)).size;

  const UploadIcon   = getIcon('upload');
  const DownloadIcon = getIcon('download');
  const TrashIcon    = getIcon('trash');
  const FileAddIcon  = getIcon('file-add');
  const LoaderIcon   = getIcon('loader');

  return (
    <AppShell title={{ en: 'File Center', zh: '文件中心' }} crumb="atlas / files">
      <PageHead
        title={{ en: 'File Center', zh: '文件中心' }}
        desc={{
          en: 'Upload, manage, and download files stored in MinIO object storage.',
          zh: '上传、管理并下载存储于 MinIO 对象存储的文件。',
        }}
      />

      {/* stats */}
      <div className="grid-base grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          val={store.files.length.toString()}
          label={lang === 'zh' ? '已上传文件' : 'Total files'}
          color="#4F7CFF"
        />
        <StatCard
          val={fmtSize(totalSize)}
          label={lang === 'zh' ? '存储占用' : 'Storage used'}
          color="#00D4FF"
        />
        <StatCard
          val={types.toString()}
          label={lang === 'zh' ? '文件类型' : 'File types'}
          color="#10B981"
        />
        <StatCard
          val={store.uploading.length.toString()}
          label={lang === 'zh' ? '上传中' : 'Uploading'}
          color="#F59E0B"
        />
      </div>

      {/* drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className="card-hover"
        style={{
          border: `1.5px dashed ${drag ? 'var(--primary)' : 'var(--glass-border-strong)'}`,
          borderRadius: 'var(--r-lg)',
          padding: '32px 28px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          background: drag ? 'var(--surface-2)' : 'var(--surface-1)',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPTED}
          hidden
          onChange={onFileChange}
        />
        <div style={{
          width: 52, height: 52, borderRadius: 15,
          margin: '0 auto 14px',
          background: 'var(--grad-iris)',
          display: 'grid', placeItems: 'center',
          boxShadow: '0 10px 26px rgba(79,124,255,0.4)',
        }}>
          <FileAddIcon color="#fff" size={26} />
        </div>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>
          {drag
            ? lang === 'zh' ? '释放以上传' : 'Drop to upload'
            : lang === 'zh' ? '拖拽文件上传到 MinIO' : 'Drag files to upload to MinIO'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--sub)' }}>
          {lang === 'zh'
            ? '或点击选择文件 —— 最大 50 MB'
            : 'or click to browse — max 50 MB per file'}
        </p>
        <div className="row gap-2" style={{ justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          {['PDF', 'DOCX', 'XLSX', 'PPTX', 'TXT', 'Markdown'].map((f) => (
            <span key={f} className="mono" style={{ fontSize: 10.5, padding: '4px 9px', borderRadius: 6, background: 'var(--surface-3)', color: 'var(--sub)' }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* uploading queue */}
      <AnimatePresence>
        {store.uploading.map((u) => (
          <motion.div
            key={u.localId}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card"
            style={{ padding: '14px 18px', marginBottom: 10 }}
          >
            <div className="row gap-3" style={{ alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {u.error
                  ? <span style={{ fontSize: 18 }}>⚠</span>
                  : <UploadIcon size={18} color="var(--primary)" />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name}
                </div>
                {u.error ? (
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{u.error}</div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', borderRadius: 999, background: 'var(--grad-iris)' }}
                        animate={{ width: `${u.progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.3 }}
                      />
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {fmtSize(u.size)} · {u.progress}%
                    </div>
                  </div>
                )}
              </div>
              {u.error && (
                <button
                  className="icon-btn"
                  onClick={() => store.removeUploading(u.localId)}
                  style={{ color: 'var(--muted)', background: 'none', border: 'none' }}
                >
                  ×
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* file list */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 650, fontSize: 14 }}>
            {lang === 'zh' ? '文件列表' : 'Files'}
          </span>
          <span className="badge badge-primary mono">{store.files.length}</span>
        </div>

        {/* header row */}
        {store.files.length > 0 && (
          <div
            className="row mono"
            style={{
              padding: '8px 18px',
              borderBottom: '1px solid var(--glass-border)',
              fontSize: 11,
              color: 'var(--muted)',
              gap: 0,
            }}
          >
            <span style={{ flex: '1 1 0', minWidth: 0 }}>
              {lang === 'zh' ? '文件名' : 'File name'}
            </span>
            <span style={{ width: 64, textAlign: 'center', flexShrink: 0 }}>
              {lang === 'zh' ? '类型' : 'Type'}
            </span>
            <span style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>
              {lang === 'zh' ? '大小' : 'Size'}
            </span>
            <span style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>
              {lang === 'zh' ? '上传时间' : 'Uploaded'}
            </span>
            <span style={{ width: 80, textAlign: 'right', flexShrink: 0 }} />
          </div>
        )}

        {loading ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--muted)' }}>
            <LoaderIcon size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline' }} />
          </div>
        ) : store.files.length === 0 && store.uploading.length === 0 ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {lang === 'zh' ? '暂无文件，请上传' : 'No files yet — upload one above'}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {store.files.map((f) => {
              const Icon  = getIcon(typeIcon(f.file_type));
              const color = typeColor(f.file_type);
              const deleting = deleteId === f.id;
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10, height: 0 }}
                  className={cn('row')}
                  style={{
                    padding: '13px 18px',
                    borderBottom: '1px solid var(--glass-border)',
                    gap: 0,
                    alignItems: 'center',
                    opacity: deleting ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* icon + name */}
                  <div className="row gap-3" style={{ flex: '1 1 0', minWidth: 0, alignItems: 'center' }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8,
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                      background: `linear-gradient(135deg,${color},${color}99)`,
                    }}>
                      <Icon color="#fff" size={17} />
                    </div>
                    <span style={{
                      fontSize: 13.5, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.file_name}
                    </span>
                  </div>

                  {/* type badge */}
                  <div style={{ width: 64, textAlign: 'center', flexShrink: 0 }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10.5, padding: '3px 7px', borderRadius: 5,
                        background: `${color}22`, color,
                        textTransform: 'uppercase',
                      }}
                    >
                      {f.file_type}
                    </span>
                  </div>

                  {/* size */}
                  <span className="mono" style={{ width: 80, textAlign: 'right', flexShrink: 0, fontSize: 12, color: 'var(--sub)' }}>
                    {fmtSize(f.file_size)}
                  </span>

                  {/* upload time */}
                  <span className="mono" style={{ width: 100, textAlign: 'right', flexShrink: 0, fontSize: 12, color: 'var(--muted)' }}>
                    {relTime(f.created_at)}
                  </span>

                  {/* actions */}
                  <div className="row gap-2" style={{ width: 80, justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button
                      className="icon-btn"
                      title={lang === 'zh' ? '下载' : 'Download'}
                      onClick={() => void onDownload(f)}
                      style={{ color: 'var(--primary)', background: 'none', border: 'none' }}
                    >
                      <DownloadIcon size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title={lang === 'zh' ? '删除' : 'Delete'}
                      onClick={() => void onDelete(f.id)}
                      disabled={deleting}
                      style={{ color: 'var(--danger)', background: 'none', border: 'none' }}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </AppShell>
  );
}
