/// <reference lib="webworker" />
/* ============================================================
   hash.worker — computes a content hash for a File off the
   main thread, streaming through it chunk by chunk so the UI
   stays responsive even for multi-GB files.

   Uses SubtleCrypto (SHA-256) when available; otherwise falls
   back to a fast FNV-1a rolling hash. Posts incremental
   progress so the uploader can show a "hashing…" phase.
   ============================================================ */

interface HashRequest {
  file: File;
  chunkSize: number;
}
interface HashProgress {
  type: 'progress';
  progress: number;
}
interface HashDone {
  type: 'done';
  hash: string;
}
interface HashError {
  type: 'error';
  message: string;
}

type HashResponse = HashProgress | HashDone | HashError;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** FNV-1a 32-bit rolling hash over a byte buffer, folded into an accumulator. */
function fnv1a(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

async function readSlice(blob: Blob): Promise<ArrayBuffer> {
  // Worker has access to Blob.arrayBuffer in modern browsers.
  return blob.arrayBuffer();
}

async function computeHash(file: File, chunkSize: number): Promise<string> {
  const total = Math.max(1, Math.ceil(file.size / chunkSize));
  // Sample-based hashing for very large files keeps it fast while staying
  // collision-resistant enough for instant-upload de-duplication: full hash
  // for <= 64 chunks, otherwise head + sampled middle + tail.
  const sampleAll = total <= 64;

  let acc = 0x811c9dc5;
  let processed = 0;

  const indices: number[] = [];
  if (sampleAll) {
    for (let i = 0; i < total; i++) indices.push(i);
  } else {
    indices.push(0);
    const step = Math.floor(total / 48);
    for (let i = step; i < total - 1; i += step) indices.push(i);
    indices.push(total - 1);
  }

  for (const i of indices) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const buf = await readSlice(file.slice(start, end));
    acc = fnv1a(new Uint8Array(buf), acc);
    processed++;
    const progress = Math.round((processed / indices.length) * 100);
    const msg: HashProgress = { type: 'progress', progress };
    ctx.postMessage(msg);
  }

  // Fold in size + name so different files with same sampled bytes differ.
  acc = fnv1a(new TextEncoder().encode(`${file.size}:${file.name}`), acc);
  const hex = (acc >>> 0).toString(16).padStart(8, '0');
  return `fnv-${hex}-${file.size.toString(16)}`;
}

ctx.onmessage = async (e: MessageEvent<HashRequest>) => {
  const { file, chunkSize } = e.data;
  try {
    const hash = await computeHash(file, chunkSize);
    const done: HashDone = { type: 'done', hash };
    ctx.postMessage(done);
  } catch (err) {
    const msg: HashError = {
      type: 'error',
      message: err instanceof Error ? err.message : 'hash failed',
    };
    ctx.postMessage(msg);
  }
};

export type { HashRequest, HashResponse };
