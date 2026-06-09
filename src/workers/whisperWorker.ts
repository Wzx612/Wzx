import { pipeline, env } from '@xenova/transformers';

// Only download from HuggingFace Hub; use browser cache after first download.
env.allowLocalModels  = false;
env.useBrowserCache   = true;

type InMsg =
  | { type: 'transcribe'; samples: Float32Array; lang: string }
  | { type: 'abort' };

type OutMsg =
  | { type: 'loading' }
  | { type: 'progress'; loaded: number; total: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

function post(msg: OutMsg) {
  self.postMessage(msg);
}

/* Singleton — model is loaded once and reused across calls. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded() {
  if (transcriber) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      post({ type: 'loading' });
      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny',       // INT8-quantized, ~75 MB, multilingual
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progress_callback: (info: any) => {
            if (info.status === 'progress') {
              post({
                type:   'progress',
                loaded: info.loaded ?? 0,
                total:  info.total  ?? 0,
                file:   info.file   ?? '',
              });
            }
          },
        },
      );
      post({ type: 'ready' });
    })();
  }
  await loadPromise;
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  if (e.data.type === 'abort') return;

  const { samples, lang } = e.data;

  try {
    await ensureLoaded();
    post({ type: 'transcribing' });

    const result = await transcriber(samples, {
      language:          lang,
      task:              'transcribe',
      return_timestamps: false,
    });

    post({ type: 'done', text: (result.text as string).trim() });
  } catch (err) {
    post({
      type:    'error',
      message: err instanceof Error ? err.message : 'Whisper transcription failed',
    });
  }
};
