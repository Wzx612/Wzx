import { useEffect, useRef, useState } from 'react';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { transcribe, transcribeWebSpeech } from '@/services/mediaService';
import type { RecorderStatus } from '@/types';

/* ============================================================
   VoiceRecorder — speech-to-text with a live waveform.

   Priority for transcription:
     1. Web Speech API (real-time, no upload) — Chrome/Edge only.
     2. MediaRecorder → Whisper API (if VITE_OPENAI_API_KEY set).
     3. MediaRecorder → backend /stt.
     4. Mock fallback.

   Waveform is driven by an AudioContext AnalyserNode regardless
   of which STT path is chosen.
   ============================================================ */

type WinSR = { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
const WS_SUPPORTED =
  typeof window !== 'undefined' &&
  !!((window as unknown as WinSR).SpeechRecognition ?? (window as unknown as WinSR).webkitSpeechRecognition);

export default function VoiceRecorder() {
  const { lang } = useT();
  const [status,     setStatus]     = useState<RecorderStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error,      setError]      = useState('');
  const [bars,       setBars]       = useState<number[]>(() => new Array(28).fill(6));
  const [mode,       setMode]       = useState<'webspeech' | 'mediarecorder'>(
    WS_SUPPORTED ? 'webspeech' : 'mediarecorder',
  );

  const mediaRef   = useRef<MediaRecorder | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef     = useRef<number | null>(null);

  const Mic     = getIcon('mic');
  const Sparkle = getIcon('sparkle');

  const cleanup = () => {
    if (rafRef.current !== null)  cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current   = null;
  };

  useEffect(() => cleanup, []);

  /* ── Waveform animation from live mic stream ──────────── */

  const startWaveform = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx      = new AudioCtx();
      audioCtxRef.current = ctx;
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(data);
        setBars(Array.from({ length: 28 }, (_, i) => 6 + (data[i % data.length] / 255) * 42));
        rafRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      /* AudioContext not available — waveform stays flat */
    }
  };

  /* ── Path A: Web Speech API ───────────────────────────── */

  const startWebSpeech = async () => {
    setError('');
    setTranscript('');
    setStatus('recording');

    /* Start a mic stream just for the waveform visualisation. */
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startWaveform(stream);
    } catch {
      /* Mic denied — waveform will be flat, but recognition can still work. */
    }

    try {
      const text = await transcribeWebSpeech();
      setTranscript(text || (lang === 'zh' ? '（未检测到语音）' : '(no speech detected)'));
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error && err.message === 'not-allowed'
          ? lang === 'zh' ? '麦克风权限被拒绝' : 'Microphone permission denied'
          : lang === 'zh' ? '语音识别失败，请重试' : 'Recognition failed — please try again',
      );
    } finally {
      cleanup();
      setBars(new Array(28).fill(6));
    }
  };

  /* ── Path B: MediaRecorder → STT ─────────────────────── */

  const startMediaRecorder = async () => {
    setError('');
    setTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;

      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setStatus('transcribing');
        try {
          const text = await transcribe(blob);
          setTranscript(text);
          setStatus('done');
        } catch {
          setStatus('error');
          setError(lang === 'zh' ? '转写失败' : 'Transcription failed');
        } finally {
          cleanup();
          setBars(new Array(28).fill(6));
        }
      };

      mr.start();
      setStatus('recording');
      startWaveform(stream);
    } catch {
      /* Mic denied — fall back to mock transcription */
      setStatus('transcribing');
      try {
        const text = await transcribe(new Blob());
        setTranscript(text);
        setStatus('done');
      } catch {
        setStatus('error');
        setError(lang === 'zh' ? '无法访问麦克风' : 'Microphone unavailable');
      }
    }
  };

  /* ── Stop (MediaRecorder path) ─────────────────────────── */

  const stop = () => {
    mediaRef.current?.stop();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setBars(new Array(28).fill(6));
  };

  const start = () => {
    if (mode === 'webspeech') return startWebSpeech();
    return startMediaRecorder();
  };

  const recording     = status === 'recording';
  const transcribing  = status === 'transcribing';
  const canToggleStop = recording && mode === 'mediarecorder';

  const statusLabel =
    recording   ? lang === 'zh' ? '录音中…' : 'Recording…'
    : transcribing ? lang === 'zh' ? '转写中…' : 'Transcribing…'
    : lang === 'zh' ? '点击开始语音输入' : 'Tap to start voice input';

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 3 }}>
              {lang === 'zh' ? '语音转文字 · 实时对话' : 'Speech → Text · Realtime'}
            </h3>
            <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
              {mode === 'webspeech'
                ? lang === 'zh' ? 'Web Speech API（浏览器原生）' : 'Web Speech API (browser built-in)'
                : lang === 'zh' ? 'MediaRecorder + STT' : 'MediaRecorder + STT'}
            </div>
          </div>
          {/* Mode toggle */}
          {WS_SUPPORTED && status === 'idle' && (
            <div style={{ display: 'flex', background: 'var(--surface-3)', borderRadius: 'var(--r-pill)', padding: 3, gap: 2 }}>
              {(['webspeech', 'mediarecorder'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 'var(--r-pill)',
                    border: 'none',
                    cursor: 'pointer',
                    background: mode === m ? 'var(--grad-primary)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {m === 'webspeech' ? 'Live' : 'Record'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 18, padding: 18,
          borderRadius: 'var(--r)',
          background: 'var(--surface-1)',
          border: '1px solid var(--glass-border)',
          marginBottom: 16,
        }}
      >
        <button
          onClick={canToggleStop ? stop : () => void start()}
          disabled={transcribing}
          aria-label={recording ? 'stop' : 'record'}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            cursor: transcribing ? 'default' : 'pointer',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            background: recording ? 'var(--danger)' : 'var(--grad-primary)',
            boxShadow: recording
              ? '0 0 0 6px rgba(244,63,94,0.25)'
              : '0 8px 22px rgba(79,124,255,0.4)',
            transition: 'all 0.2s',
          }}
        >
          <Mic color="#fff" size={24} />
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 48 }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1, borderRadius: 999,
                  height: recording ? h : 6,
                  background: recording ? 'var(--grad-primary)' : 'var(--surface-3)',
                  transition: 'height 0.08s linear',
                }}
              />
            ))}
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 6 }}>
            {statusLabel}
            {mode === 'webspeech' && !recording && !transcribing && (
              <span style={{ color: 'var(--success)', marginLeft: 8 }}>● live</span>
            )}
          </div>
        </div>
      </div>

      {transcript && (
        <div
          style={{
            padding: 16, borderRadius: 'var(--r)',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <div className="row gap-2" style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
            <Sparkle size={14} />
            {lang === 'zh' ? '转写结果' : 'Transcript'}
            <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
              {mode === 'webspeech' ? 'Web Speech API' : 'Whisper / STT'}
            </span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{transcript}</div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
