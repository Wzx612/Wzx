import type { UploadChunk } from '@/types';
import { USE_MOCK, api } from './api';
import { wait } from '@/lib/format';
import type { HashRequest, HashResponse } from '@/workers/hash.worker';

/* ============================================================
   Upload service — chunked, resumable, instant (秒传) upload.
   Hashing runs in a Web Worker; chunks upload with bounded
   concurrency and per-chunk retry. Mock mode simulates a
   backend that already holds ~12% of hashes (instant upload).
   Backend contract:
     GET  /upload/check?hash=...   -> { exists, uploaded:number[] }
     POST /upload/chunk            -> 200
     POST /upload/merge            -> { url }
   ============================================================ */

export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

/** Compute a file hash off the main thread. Returns a cancel-safe promise. */
export function hashFile(
  file: File,
  chunkSize: number,
  onProgress: (pct: number) => void,
): { promise: Promise<string>; cancel: () => void } {
  const worker = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), {
    type: 'module',
  });
  const promise = new Promise<string>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<HashResponse>) => {
      const data = e.data;
      if (data.type === 'progress') onProgress(data.progress);
      else if (data.type === 'done') {
        resolve(data.hash);
        worker.terminate();
      } else {
        reject(new Error(data.message));
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(new Error(err.message));
      worker.terminate();
    };
    const req: HashRequest = { file, chunkSize };
    worker.postMessage(req);
  });
  return { promise, cancel: () => worker.terminate() };
}

export interface InstantCheck {
  exists: boolean;
  uploaded: number[];
}

/** Ask the server whether this hash already exists (instant upload) or which chunks are present. */
export async function checkInstant(hash: string, totalChunks: number): Promise<InstantCheck> {
  if (!USE_MOCK) {
    const { data } = await api.get<InstantCheck>('/upload/check', { params: { hash } });
    return data;
  }
  await wait(280);
  // Deterministic: ~1 in 8 hashes already exist; otherwise a few random chunks present (resume demo).
  const seed = [...hash].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (seed % 8 === 0) return { exists: true, uploaded: [] };
  const uploaded: number[] = [];
  if (seed % 3 === 0) {
    for (let i = 0; i < totalChunks; i++) if ((seed + i) % 5 === 0) uploaded.push(i);
  }
  return { exists: false, uploaded };
}

/** Upload a single chunk (mock simulates latency + occasional transient failure). */
export async function uploadChunk(
  hash: string,
  chunk: UploadChunk,
  blob: Blob,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!USE_MOCK) {
    const form = new FormData();
    form.append('hash', hash);
    form.append('index', String(chunk.index));
    form.append('chunk', blob);
    await api.post('/upload/chunk', form, {
      signal,
      onUploadProgress: (e: { loaded: number; total?: number }) => {
        if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
    return;
  }
  // Mock: stream progress in steps; ~8% transient failure on first try.
  const steps = 6;
  for (let s = 1; s <= steps; s++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    await wait(90);
    onProgress(Math.round((s / steps) * 100));
  }
  if (chunk.retries === 0 && (chunk.index * 7 + blob.size) % 13 === 0) {
    throw new Error('transient network error');
  }
}

/** Tell the server to merge all chunks into the final object (returns its URL). */
export async function mergeChunks(hash: string, fileName: string): Promise<{ url: string }> {
  if (!USE_MOCK) {
    const { data } = await api.post<{ url: string }>('/upload/merge', { hash, fileName });
    return data;
  }
  await wait(500);
  return { url: `https://oss.atlas.ai/${hash}/${encodeURIComponent(fileName)}` };
}
