import type { MediaJob, MediaKind } from '@/types';
import { USE_MOCK, api } from './api';
import { wait } from '@/lib/format';

/* ============================================================
   Multimodal service — text→image, text→video, speech→text.
   Backend contract (OpenAI-compatible):
     POST /media/generate { kind, prompt } -> { id }
     GET  /media/:id                       -> MediaJob
     POST /stt (multipart audio)           -> { text }
   Speech-to-text priority:
     1. Backend /stt endpoint (when VITE_API_BASE is set)
     2. OpenAI Whisper API (when VITE_OPENAI_API_KEY is set)
     3. Web Speech API (browser built-in — Chrome/Edge)
     4. Mock fallback
   ============================================================ */

export async function createMediaJob(
  kind: MediaKind,
  prompt: string,
  size?: string,
): Promise<MediaJob> {
  const job: MediaJob = {
    id:        `media-${Date.now()}`,
    kind,
    prompt,
    status:    'queued',
    progress:  0,
    hue:       Math.floor(Math.random() * 360),
    createdAt: Date.now(),
  };
  if (!USE_MOCK) {
    const { data } = await api.post<{ id: string }>('/media/generate', { kind, prompt, size });
    return { ...job, id: data.id, status: 'generating' };
  }
  return job;
}

/* ── DALL-E 3 direct call (browser → OpenAI) ─────────────── */

async function generateDalleImage(prompt: string): Promise<string> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  if (!key) throw new Error('No OpenAI key');
  const base =
    ((import.meta.env.VITE_OPENAI_BASE_URL as string | undefined) ?? '').replace(/\/$/, '') ||
    'https://api.openai.com/v1';
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { data: { url: string }[] };
  const url = data.data[0]?.url;
  if (!url) throw new Error('No URL in DALL-E response');
  return url;
}

export async function runMediaJob(
  job: MediaJob,
  onProgress: (j: MediaJob) => void,
): Promise<MediaJob> {
  if (!USE_MOCK) {
    for (;;) {
      const { data } = await api.get<Partial<MediaJob>>(`/media/${job.id}`);
      // Merge server status/progress/url onto the local job (which keeps the
      // prompt, kind, hue, createdAt the stateless backend doesn't track).
      const merged: MediaJob = { ...job, ...data };
      onProgress(merged);
      if (merged.status === 'done' || merged.status === 'error') return merged;
      await wait(1500);
    }
  }

  /* Direct DALL-E 3 for images when an OpenAI key is configured. */
  const openaiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  if (job.kind === 'image' && openaiKey) {
    let current: MediaJob = { ...job, status: 'generating', progress: 15 };
    onProgress(current);
    try {
      const url = await generateDalleImage(job.prompt);
      current = { ...current, status: 'done', progress: 100, url };
      onProgress(current);
      return current;
    } catch {
      /* Key set but call failed — fall through to mock animation */
    }
  }

  /* Mock simulation (video always, image when no key or DALL-E failed). */
  const steps = job.kind === 'video' ? 14 : 8;
  let current: MediaJob = { ...job, status: 'generating' };
  onProgress(current);
  for (let s = 1; s <= steps; s++) {
    await wait(job.kind === 'video' ? 260 : 200);
    current = { ...current, progress: Math.round((s / steps) * 100) };
    onProgress(current);
  }
  current = { ...current, status: 'done', progress: 100 };
  onProgress(current);
  return current;
}

/* ── Speech-to-text ──────────────────────────────────────── */

/**
 * Attempt real-time transcription via the browser Web Speech API.
 * Resolves to the transcript string, or throws if unsupported / denied.
 * Note: this runs a short one-shot recognition, not continuous streaming.
 */
/* Inline types for Web Speech API (not in default TS lib). */
interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:  ((ev: ISpeechRecognitionEvent) => void) | null;
  onerror:   ((ev: { error: string }) => void) | null;
  onend:     (() => void) | null;
  start(): void;
  stop():  void;
}
interface ISpeechRecognitionEvent {
  results: { 0: { transcript: string } }[];
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

function getSR(): SpeechRecognitionCtor | undefined {
  type W = { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  const w = window as unknown as W;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function transcribeWebSpeech(): Promise<string> {
  const SR = getSR();
  if (!SR) return Promise.reject(new Error('SpeechRecognition not supported'));

  return new Promise((resolve, reject) => {
    const rec = new SR();
    rec.lang = document.documentElement.lang ?? 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    const timer = setTimeout(() => {
      rec.stop();
      reject(new Error('Speech recognition timed out'));
    }, 10_000);

    rec.onresult = (ev: ISpeechRecognitionEvent) => {
      clearTimeout(timer);
      const text = ev.results[0]?.[0]?.transcript ?? '';
      resolve(text || '');
    };

    rec.onerror = (ev: { error: string }) => {
      clearTimeout(timer);
      reject(new Error(ev.error));
    };

    rec.onend = () => clearTimeout(timer);

    try {
      rec.start();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * Transcribe via OpenAI Whisper (direct browser call).
 * Only used when VITE_OPENAI_API_KEY is set and no backend is configured.
 */
async function transcribeWhisper(blob: Blob): Promise<string> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  if (!key) throw new Error('No OpenAI key');

  const form = new FormData();
  form.append('file',  new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' }));
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}` },
    body:    form,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { text: string };
  return data.text;
}

const MOCK_SAMPLES = [
  '帮我找海淀中关村学区 800 万以内的三居室',
  '分析一下朝阳望京未来三年的投资回报',
  '现在首套房贷利率是多少，月供怎么算',
  'Compare Haidian and Xicheng school districts under 8 million.',
  '西城区 500 万预算能买什么户型？',
];

/**
 * Transcribe an audio blob.
 * Priority: backend → Whisper API → mock.
 * The Web Speech API path is handled separately in VoiceRecorder
 * (before recording starts) because it requires live mic access.
 */
export async function transcribe(blob: Blob): Promise<string> {
  /* 1. Backend STT */
  if (!USE_MOCK) {
    const form = new FormData();
    form.append('audio', blob);
    const { data } = await api.post<{ text: string }>('/stt', form);
    return data.text;
  }

  /* 2. Whisper (direct, if key is available and blob has real audio data) */
  if (blob.size > 0) {
    const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
    if (key) {
      try {
        return await transcribeWhisper(blob);
      } catch {
        /* fall through to mock */
      }
    }
  }

  /* 3. Mock */
  await wait(900);
  return MOCK_SAMPLES[Math.floor(Math.random() * MOCK_SAMPLES.length)];
}

/** Exposed so VoiceRecorder can try Web Speech API directly. */
export { transcribeWebSpeech };

/* ── Local Whisper (Transformers.js, runs in-browser) ──────── */

export interface WhisperProgress {
  loaded: number;
  total:  number;
  file:   string;
}

type WorkerOutMsg =
  | { type: 'loading' }
  | { type: 'progress'; loaded: number; total: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

let _whisperWorker: Worker | null = null;

function getWhisperWorker(): Worker {
  if (!_whisperWorker) {
    _whisperWorker = new Worker(
      new URL('../workers/whisperWorker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return _whisperWorker;
}

/** Decode audio blob to 16 kHz mono Float32Array using the Web Audio API. */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const raw = audioBuffer.getChannelData(0); // take left/mono channel

  // Resample to 16 kHz (Whisper's expected sample rate)
  if (audioBuffer.sampleRate === 16_000) return raw;
  const ratio        = audioBuffer.sampleRate / 16_000;
  const targetLength = Math.round(raw.length / ratio);
  const resampled    = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    resampled[i] = raw[Math.round(i * ratio)] ?? 0;
  }
  return resampled;
}

/**
 * Transcribe an audio blob using a local Whisper model (onnx-community/whisper-tiny)
 * running inside a Web Worker via Transformers.js.
 *
 * The model is downloaded once (~80 MB) and cached in the browser.
 * No data ever leaves the user's machine.
 *
 * @param blob     Audio blob from MediaRecorder (webm/opus).
 * @param lang     BCP-47 language hint, e.g. 'chinese' or 'english'.
 * @param onProgress  Called periodically during the first-time model download.
 * @param onStatus    Called as the pipeline moves through states.
 */
export function transcribeLocalWhisper(
  blob: Blob,
  lang = 'chinese',
  onProgress?: (p: WhisperProgress) => void,
  onStatus?: (s: 'loading' | 'ready' | 'transcribing') => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = getWhisperWorker();

    const handler = (e: MessageEvent<WorkerOutMsg>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'loading':
        case 'ready':
        case 'transcribing':
          onStatus?.(msg.type);
          break;
        case 'progress':
          onProgress?.({ loaded: msg.loaded, total: msg.total, file: msg.file });
          break;
        case 'done':
          worker.removeEventListener('message', handler);
          resolve(msg.text);
          break;
        case 'error':
          worker.removeEventListener('message', handler);
          reject(new Error(msg.message));
          break;
      }
    };

    worker.addEventListener('message', handler);

    // Decode audio first (needs main-thread AudioContext), then ship samples to worker.
    decodeToMono16k(blob)
      .then((samples) => worker.postMessage({ type: 'transcribe', samples, lang }, [samples.buffer]))
      .catch((err: unknown) => {
        worker.removeEventListener('message', handler);
        reject(err instanceof Error ? err : new Error('Audio decode failed'));
      });
  });
}
