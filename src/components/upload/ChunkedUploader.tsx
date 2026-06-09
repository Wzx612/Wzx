import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import {
  DEFAULT_CHUNK_SIZE,
  hashFile,
  checkInstant,
  uploadChunk,
  mergeChunks,
} from '@/services/uploadService';
import type { UploadTask, UploadChunk, UploadPhase } from '@/types';

const CONCURRENCY = 3;
const MAX_RETRY = 3;

function fmtBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(0)} KB`;
  return `${n} B`;
}

const PHASE_LABEL: Record<UploadPhase, { en: string; zh: string; color: string }> = {
  idle: { en: 'Ready', zh: '就绪', color: 'var(--muted)' },
  hashing: { en: 'Hashing (worker)', zh: '计算指纹(Worker)', color: 'var(--secondary)' },
  checking: { en: 'Checking server', zh: '校验服务端', color: 'var(--secondary)' },
  uploading: { en: 'Uploading', zh: '上传中', color: 'var(--primary)' },
  paused: { en: 'Paused', zh: '已暂停', color: 'var(--warning)' },
  merging: { en: 'Merging', zh: '合并中', color: 'var(--accent)' },
  done: { en: 'Completed', zh: '已完成', color: 'var(--success)' },
  instant: { en: 'Instant upload ⚡', zh: '秒传 ⚡', color: 'var(--success)' },
  error: { en: 'Error', zh: '失败', color: 'var(--danger)' },
};

export default function ChunkedUploader() {
  const { lang } = useT();
  const [task, setTask] = useState<UploadTask | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<File | null>(null);
  const pausedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const Up = getIcon('doc');
  const Play = getIcon('play');
  const Bolt = getIcon('bolt');

  const patch = useCallback((p: Partial<UploadTask>) => {
    setTask((prev) => (prev ? { ...prev, ...p } : prev));
  }, []);

  const patchChunk = useCallback((index: number, p: Partial<UploadChunk>) => {
    setTask((prev) => {
      if (!prev) return prev;
      const chunks = prev.chunks.map((c) => (c.index === index ? { ...c, ...p } : c));
      const progress = Math.round(
        chunks.reduce((a, c) => a + (c.status === 'done' ? 100 : c.progress), 0) / chunks.length,
      );
      return { ...prev, chunks, progress };
    });
  }, []);

  const runUpload = useCallback(
    async (file: File, chunks: UploadChunk[], hash: string) => {
      abortRef.current = new AbortController();
      const queue = chunks.filter((c) => c.status !== 'done').map((c) => c.index);
      let cursor = 0;

      const worker = async (): Promise<void> => {
        while (cursor < queue.length) {
          if (pausedRef.current) return;
          const idx = queue[cursor++];
          const chunk = chunks[idx];
          patchChunk(idx, { status: 'uploading', progress: 0 });
          let attempt = 0;
          for (;;) {
            try {
              const blob = file.slice(chunk.start, chunk.end);
              await uploadChunk(
                hash,
                { ...chunk, retries: attempt },
                blob,
                (pct) => patchChunk(idx, { progress: pct }),
                abortRef.current?.signal,
              );
              patchChunk(idx, { status: 'done', progress: 100 });
              break;
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') return;
              attempt++;
              if (attempt >= MAX_RETRY) {
                patchChunk(idx, { status: 'error', retries: attempt });
                throw err;
              }
              patchChunk(idx, { status: 'pending', retries: attempt });
              await new Promise((r) => setTimeout(r, 300 * attempt));
            }
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        if (pausedRef.current) {
          patch({ phase: 'paused' });
          return;
        }
        patch({ phase: 'merging' });
        await mergeChunks(hash, file.name);
        patch({ phase: 'done', progress: 100 });
      } catch {
        patch({ phase: 'error', error: lang === 'zh' ? '部分分片上传失败' : 'Some chunks failed' });
      }
    },
    [patch, patchChunk, lang],
  );

  const start = useCallback(
    async (file: File) => {
      fileRef.current = file;
      pausedRef.current = false;
      const chunkSize = DEFAULT_CHUNK_SIZE;
      const total = Math.max(1, Math.ceil(file.size / chunkSize));
      const chunks: UploadChunk[] = Array.from({ length: total }, (_, i) => ({
        index: i,
        start: i * chunkSize,
        end: Math.min(file.size, (i + 1) * chunkSize),
        size: Math.min(chunkSize, file.size - i * chunkSize),
        status: 'pending',
        progress: 0,
        retries: 0,
      }));

      setTask({
        id: `up-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        hash: '',
        chunkSize,
        chunks,
        phase: 'hashing',
        progress: 0,
        instant: false,
      });

      // 1) hash in worker
      const { promise } = hashFile(file, chunkSize, (pct) =>
        patch({ progress: Math.round(pct * 0.15) }),
      );
      const hash = await promise;
      patch({ hash, phase: 'checking' });

      // 2) instant-upload / resume check
      const check = await checkInstant(hash, total);
      if (check.exists) {
        setTask((prev) =>
          prev
            ? {
                ...prev,
                instant: true,
                phase: 'instant',
                progress: 100,
                chunks: prev.chunks.map((c) => ({ ...c, status: 'done', progress: 100 })),
              }
            : prev,
        );
        return;
      }
      // mark already-present chunks (resume)
      const resumed = chunks.map((c) =>
        check.uploaded.includes(c.index) ? { ...c, status: 'done' as const, progress: 100 } : c,
      );
      patch({ phase: 'uploading', chunks: resumed });
      await runUpload(file, resumed, hash);
    },
    [patch, runUpload],
  );

  const pause = () => {
    pausedRef.current = true;
    abortRef.current?.abort();
    patch({ phase: 'paused' });
  };
  const resume = () => {
    if (!fileRef.current || !task) return;
    pausedRef.current = false;
    patch({ phase: 'uploading' });
    void runUpload(fileRef.current, task.chunks, task.hash);
  };
  const reset = () => {
    pausedRef.current = true;
    abortRef.current?.abort();
    setTask(null);
    fileRef.current = null;
  };

  const onFiles = (files: FileList | null) => {
    if (files && files[0]) void start(files[0]);
  };

  const phase = task?.phase ?? 'idle';
  const pl = PHASE_LABEL[phase];
  const doneCount = task?.chunks.filter((c) => c.status === 'done').length ?? 0;

  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 3 }}>
            {lang === 'zh' ? '大文件分片上传' : 'Chunked File Upload'}
          </h3>
          <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
            {lang === 'zh'
              ? 'Worker 计算指纹 · 秒传 · 断点续传 · 并发分片'
              : 'Worker hashing · instant upload · resumable · concurrent chunks'}
          </div>
        </div>
        {task && (
          <span className="badge" style={{ color: pl.color, borderColor: 'transparent', background: 'var(--surface-2)' }}>
            <span className="badge-dot" style={{ background: pl.color }} />
            {lang === 'zh' ? pl.zh : pl.en}
          </span>
        )}
      </div>

      {!task ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          style={{
            border: `1.5px dashed ${dragOver ? 'var(--primary)' : 'var(--glass-border-strong)'}`,
            borderRadius: 'var(--r-lg)',
            padding: 34,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--surface-2)' : 'var(--surface-1)',
            transition: 'all 0.2s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 15,
              margin: '0 auto 14px',
              background: 'var(--grad-iris)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 10px 26px rgba(79,124,255,0.4)',
            }}
          >
            <Up color="#fff" size={26} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {lang === 'zh' ? '拖拽任意大文件到此' : 'Drop any large file here'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>
            {lang === 'zh'
              ? `或点击选择 · 分片大小 ${fmtBytes(DEFAULT_CHUNK_SIZE)} · 并发 ${CONCURRENCY}`
              : `or click · ${fmtBytes(DEFAULT_CHUNK_SIZE)} chunks · ${CONCURRENCY} concurrent`}
          </div>
        </div>
      ) : (
        <>
          <div className="row gap-3" style={{ marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.fileName}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {fmtBytes(task.fileSize)} · {task.chunks.length} chunks · {doneCount}/{task.chunks.length} done
                {task.hash && ` · ${task.hash}`}
              </div>
            </div>
            <div className="row gap-2">
              {phase === 'uploading' && (
                <button className="btn btn-sm btn-ghost" onClick={pause}>
                  {lang === 'zh' ? '暂停' : 'Pause'}
                </button>
              )}
              {phase === 'paused' && (
                <button className="btn btn-sm btn-primary" onClick={resume}>
                  <Play size={13} />
                  {lang === 'zh' ? '继续' : 'Resume'}
                </button>
              )}
              <button className="btn btn-sm btn-ghost" onClick={reset}>
                {lang === 'zh' ? '重置' : 'Reset'}
              </button>
            </div>
          </div>

          {/* overall bar */}
          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 8 }}>
            <motion.div
              style={{
                height: '100%',
                borderRadius: 999,
                background: task.instant ? 'var(--success)' : 'var(--grad-primary)',
              }}
              animate={{ width: `${task.progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.3 }}
            />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--sub)' }}>
              {task.instant
                ? lang === 'zh'
                  ? '服务端已存在相同指纹，秒传完成'
                  : 'Server already had this hash — instant upload'
                : `${task.progress}%`}
            </span>
            {task.instant && (
              <span className="row gap-2" style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>
                <Bolt size={13} />
                {lang === 'zh' ? '秒传' : 'Instant'}
              </span>
            )}
          </div>

          {/* chunk grid */}
          <div className="nav-group-label" style={{ padding: '0 0 8px' }}>
            {lang === 'zh' ? '分片状态' : 'Chunk Map'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16px, 1fr))', gap: 4 }}>
            {task.chunks.map((c) => {
              const color =
                c.status === 'done'
                  ? 'var(--success)'
                  : c.status === 'uploading'
                    ? 'var(--primary)'
                    : c.status === 'error'
                      ? 'var(--danger)'
                      : 'var(--surface-3)';
              return (
                <div
                  key={c.index}
                  title={`#${c.index} · ${c.status} · ${c.progress}%`}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 3,
                    background: color,
                    opacity: c.status === 'uploading' ? 0.4 + (c.progress / 100) * 0.6 : 1,
                    transition: 'all 0.25s',
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
