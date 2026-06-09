import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { createMediaJob, runMediaJob } from '@/services/mediaService';
import type { MediaJob } from '@/types';

const SIZES = [
  { id: '1024*1024', label: '1:1' },
  { id: '1280*720', label: '16:9' },
  { id: '720*1280', label: '9:16' },
];

const PRESETS = [
  { en: 'Modern apartment interior, warm sunset light, photorealistic', zh: '现代公寓内景，落日暖光，写实风格' },
  { en: 'Aerial view of Beijing CBD skyline at dusk', zh: '黄昏时分北京 CBD 天际线航拍' },
  { en: 'Minimalist Nordic living room, soft daylight', zh: '极简北欧风客厅，柔和日光' },
  { en: 'Luxury villa with garden and pool, blue sky', zh: '带花园泳池的豪华别墅，蓝天' },
];

export default function TextToImage() {
  const { lang } = useT();
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024*1024');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const Sparkle = getIcon('sparkle');
  const Loader = getIcon('loader');
  const Download = getIcon('download');
  const Warn = getIcon('warn');

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    try {
      const job = await createMediaJob('image', text, size);
      setJobs((prev) => [job, ...prev]);
      setPrompt('');
      await runMediaJob(job, (j) => setJobs((prev) => prev.map((x) => (x.id === j.id ? j : x))));
    } catch (err) {
      setError((err as Error).message || (lang === 'zh' ? '生成失败' : 'Generation failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title={{ en: 'Text to Image', zh: '文生图' }} crumb="atlas / intelligence / text-to-image">
      <PageHead
        title={{ en: 'Text to Image', zh: '文生图' }}
        desc={{
          en: 'Generate images from a text prompt, powered by Tongyi Wanxiang.',
          zh: '输入文字描述生成图像，由通义万相驱动。',
        }}
      />

      <div className="card" style={{ padding: 22, marginBottom: 28 }}>
        <label style={lbl}>{lang === 'zh' ? '提示词' : 'Prompt'}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
          }}
          placeholder={lang === 'zh' ? '描述你想生成的图像…（Ctrl/⌘+Enter 生成）' : 'Describe the image to generate… (Ctrl/⌘+Enter)'}
          rows={3}
          maxLength={800}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-1)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            resize: 'vertical',
            marginBottom: 14,
          }}
        />

        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>{lang === 'zh' ? '尺寸' : 'Size'}</span>
            <div className="row" style={{ padding: 3, background: 'var(--surface-3)', borderRadius: 'var(--r-pill)' }}>
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSize(s.id)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 'var(--r-pill)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: size === s.id ? 'var(--grad-primary)' : 'transparent',
                    color: size === s.id ? '#fff' : 'var(--sub)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={busy || !prompt.trim()}>
            {busy ? <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkle size={15} />}
            {busy ? (lang === 'zh' ? '生成中…' : 'Generating…') : lang === 'zh' ? '生成' : 'Generate'}
          </button>
        </div>

        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          {PRESETS.map((p, i) => (
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

        {error && (
          <div className="row gap-2" style={{ alignItems: 'center', marginTop: 14, color: 'var(--danger)', fontSize: 12.5 }}>
            <Warn size={15} />
            {error}
          </div>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
          {lang === 'zh' ? '生成的图片会显示在这里' : 'Your generated images will appear here'}
        </div>
      ) : (
        <div className="grid-base grid-3">
          <AnimatePresence>
            {jobs.map((job) => (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="card"
                style={{ overflow: 'hidden', padding: 0 }}
              >
                <div style={{ aspectRatio: '1 / 1', position: 'relative', background: 'var(--surface-3)', display: 'grid', placeItems: 'center' }}>
                  {job.status === 'done' && job.url ? (
                    <img src={job.url} alt={job.prompt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : job.status === 'error' ? (
                    <div className="row gap-2" style={{ color: 'var(--danger)', fontSize: 12.5 }}>
                      <Warn size={15} />
                      {lang === 'zh' ? '生成失败' : 'Failed'}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', width: '70%' }}>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 8 }}>{job.progress}%</div>
                      <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-1)', overflow: 'hidden' }}>
                        <motion.div style={{ height: '100%', background: 'var(--grad-primary)', borderRadius: 999 }} animate={{ width: `${job.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: job.url ? 8 : 0 }}>
                    {job.prompt}
                  </div>
                  {job.status === 'done' && job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <Download size={14} />
                      {lang === 'zh' ? '查看 / 下载' : 'View / Download'}
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </AppShell>
  );
}

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--sub)',
  marginBottom: 6,
  fontWeight: 600,
};
