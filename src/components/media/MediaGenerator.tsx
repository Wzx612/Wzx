import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { createMediaJob, runMediaJob } from '@/services/mediaService';
import type { MediaJob, MediaKind } from '@/types';

export default function MediaGenerator() {
  const { lang } = useT();
  const [kind, setKind] = useState<MediaKind>('image');
  const [prompt, setPrompt] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [busy, setBusy] = useState(false);

  const ImageIcon = getIcon('image');
  const VideoIcon = getIcon('play');
  const Sparkle = getIcon('sparkle');

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    const job = await createMediaJob(kind, text);
    setJobs((prev) => [job, ...prev]);
    setPrompt('');
    await runMediaJob(job, (j) => setJobs((prev) => prev.map((x) => (x.id === j.id ? j : x))));
    setBusy(false);
  };

  const presets =
    kind === 'image'
      ? [
          { en: 'Modern apartment interior, sunset light', zh: '现代公寓内景，落日暖光' },
          { en: 'Aerial view of Beijing CBD skyline', zh: '北京 CBD 天际线航拍' },
        ]
      : [
          { en: '360° walkthrough of a 3-bed flat', zh: '三居室 360° 漫游视频' },
          { en: 'Time-lapse of a district over 4 seasons', zh: '小区四季延时短片' },
        ];

  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 3 }}>
            {lang === 'zh' ? '文生图 · 问生视频' : 'Text → Image / Video'}
          </h3>
          <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>
            {lang === 'zh' ? '多模态生成,任务卡实时进度' : 'Multimodal generation with live task cards'}
          </div>
        </div>
        <div className="row" style={{ padding: 3, background: 'var(--surface-3)', borderRadius: 'var(--r-pill)' }}>
          {(['image', 'video'] as MediaKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 'var(--r-pill)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                background: kind === k ? 'var(--grad-primary)' : 'transparent',
                color: kind === k ? '#fff' : 'var(--sub)',
              }}
            >
              {k === 'image' ? <ImageIcon size={14} /> : <VideoIcon size={14} />}
              {k === 'image' ? (lang === 'zh' ? '图片' : 'Image') : lang === 'zh' ? '视频' : 'Video'}
            </button>
          ))}
        </div>
      </div>

      <div className="row gap-2" style={{ marginBottom: 12 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && generate()}
          placeholder={lang === 'zh' ? '描述你想生成的内容…' : 'Describe what to generate…'}
          style={{
            flex: 1,
            padding: '11px 15px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-1)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button className="btn btn-primary" onClick={generate} disabled={busy || !prompt.trim()}>
          <Sparkle size={15} />
          {lang === 'zh' ? '生成' : 'Generate'}
        </button>
      </div>

      <div className="row gap-2" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
        {presets.map((p, i) => (
          <button
            key={i}
            className="badge"
            style={{ cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            onClick={() => setPrompt(lang === 'zh' ? p.zh : p.en)}
          >
            {lang === 'zh' ? p.zh : p.en}
          </button>
        ))}
      </div>

      <div className="grid-base grid-3">
        <AnimatePresence>
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="card"
              style={{ overflow: 'hidden', padding: 0 }}
            >
              <div
                style={{
                  height: job.kind === 'video' ? 110 : 130,
                  position: 'relative',
                  overflow: 'hidden',
                  background:
                    job.status === 'done' && !job.url
                      ? `repeating-linear-gradient(135deg, hsl(${job.hue},60%,42%), hsl(${job.hue},60%,42%) 12px, hsl(${job.hue},60%,36%) 12px, hsl(${job.hue},60%,36%) 24px)`
                      : 'var(--surface-3)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {job.status === 'done' && job.url ? (
                  <img
                    src={job.url}
                    alt={job.prompt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : job.status === 'done' ? (
                  <span className="mono" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                    {job.kind === 'video' ? '▶ generated video' : 'generated image'}
                  </span>
                ) : (
                  <div style={{ textAlign: 'center', width: '70%' }}>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 8 }}>
                      {job.progress}%
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-1)', overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', background: 'var(--grad-primary)', borderRadius: 999 }}
                        animate={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {job.prompt}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
