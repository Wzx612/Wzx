import { useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead, SectionHead } from '@/components/ui/Headings';
import ChunkedUploader from '@/components/upload/ChunkedUploader';
import VirtualList from '@/components/virtual/VirtualList';
import ThreeScene from '@/components/three/ThreeScene';
import MediaGenerator from '@/components/media/MediaGenerator';
import VoiceRecorder from '@/components/media/VoiceRecorder';
import PhoneLogin from '@/components/auth/PhoneLogin';
import { useT } from '@/lib/useT';
import { fmtCny, fmtUnitPrice } from '@/lib/format';
import { generateListings, type ListingRow } from '@/mock/properties';
import type { Bi } from '@/types';

const STATUS_META: Record<ListingRow['status'], { label: Bi; color: string }> = {
  on: { label: { en: 'On sale', zh: '在售' }, color: '#10B981' },
  pending: { label: { en: 'Pending', zh: '待定' }, color: '#F59E0B' },
  sold: { label: { en: 'Sold', zh: '已售' }, color: '#64748B' },
};

export default function Capabilities() {
  const { b, lang } = useT();
  const [count] = useState(20000);
  const listings = useMemo(() => generateListings(count), [count]);

  return (
    <AppShell title={{ en: 'Capability Center', zh: '能力中心' }} crumb="atlas / platform / capabilities">
      <PageHead
        title={{ en: 'Capability Center', zh: '能力中心' }}
        desc={{
          en: 'Production-grade frontend building blocks powering the platform — chunked upload, virtual scrolling, 3D, multimodal generation, voice, and dual-token auth.',
          zh: '支撑平台的生产级前端能力 —— 分片上传、虚拟滚动、3D、多模态生成、语音与双 Token 鉴权。',
        }}
      />

      {/* 3D */}
      <SectionHead
        title={{ en: '3D Data City (Three.js)', zh: '3D 数据之城(Three.js)' }}
        sub={{ en: 'WebGL building grid pulsing with district demand', zh: 'WebGL 楼宇随区域热度起伏' }}
        actions={<span className="badge badge-accent mono">three · webgl</span>}
      />
      <div className="card" style={{ padding: 12, marginBottom: 32 }}>
        <ThreeScene height={360} />
      </div>

      {/* upload + auth */}
      <div className="grid-base grid-2" style={{ marginBottom: 32 }}>
        <ChunkedUploader />
        <PhoneLogin />
      </div>

      {/* virtual list */}
      <SectionHead
        title={{ en: 'Virtual Scroll — 20,000 listings', zh: '虚拟滚动 —— 2 万条房源' }}
        sub={{ en: 'Only visible rows are rendered', zh: '仅渲染可视区行,滚动流畅' }}
        actions={<span className="badge badge-primary mono">{count.toLocaleString()} rows</span>}
      />
      <div className="card" style={{ overflow: 'hidden', marginBottom: 32 }}>
        <div
          className="row mono"
          style={{
            padding: '11px 16px',
            borderBottom: '1px solid var(--glass-border)',
            fontSize: 11,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            gap: 0,
          }}
        >
          <span style={{ width: 120 }}>{lang === 'zh' ? '编号' : 'Code'}</span>
          <span style={{ width: 80 }}>{lang === 'zh' ? '区域' : 'District'}</span>
          <span style={{ width: 90, textAlign: 'right' }}>{lang === 'zh' ? '面积' : 'Area'}</span>
          <span style={{ flex: 1, textAlign: 'right' }}>{lang === 'zh' ? '总价' : 'Total'}</span>
          <span style={{ flex: 1, textAlign: 'right' }}>{lang === 'zh' ? '单价' : 'Unit'}</span>
          <span style={{ width: 90, textAlign: 'right' }}>{lang === 'zh' ? '状态' : 'Status'}</span>
        </div>
        <VirtualList
          items={listings}
          rowHeight={52}
          height={420}
          renderRow={(row: ListingRow) => {
            const st = STATUS_META[row.status];
            return (
              <div
                className="row"
                style={{
                  height: 52,
                  padding: '0 16px',
                  borderBottom: '1px solid var(--glass-border)',
                  fontSize: 13,
                  gap: 0,
                }}
              >
                <span className="mono" style={{ width: 120, color: 'var(--sub)' }}>{row.code}</span>
                <span style={{ width: 80, fontWeight: 600 }}>{row.district}</span>
                <span className="mono" style={{ width: 90, textAlign: 'right' }}>{row.area}㎡</span>
                <span className="mono" style={{ flex: 1, textAlign: 'right', fontWeight: 600 }}>
                  {fmtCny(row.totalPrice, lang)}
                </span>
                <span className="mono" style={{ flex: 1, textAlign: 'right', color: 'var(--sub)' }}>
                  {fmtUnitPrice(row.unitPrice, lang)}
                </span>
                <span style={{ width: 90, textAlign: 'right' }}>
                  <span className="badge" style={{ color: st.color, borderColor: 'transparent', background: 'var(--surface-2)', fontSize: 10.5 }}>
                    <span className="badge-dot" style={{ background: st.color }} />
                    {b(st.label)}
                  </span>
                </span>
              </div>
            );
          }}
        />
      </div>

      {/* media generation */}
      <div style={{ marginBottom: 32 }}>
        <MediaGenerator />
      </div>

      {/* voice */}
      <div className="grid-base grid-2">
        <VoiceRecorder />
        <div className="card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>
            {lang === 'zh' ? '工程能力清单' : 'Engineering Capabilities'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { en: 'Chunked upload · resume · instant', zh: '分片上传 · 断点续传 · 秒传', on: true },
              { en: 'Virtual scrolling (long lists)', zh: '虚拟滚动(长列表)', on: true },
              { en: 'Web Worker hashing', zh: 'Web Worker 计算指纹', on: true },
              { en: 'Three.js 3D visualization', zh: 'Three.js 3D 可视化', on: true },
              { en: 'Text→Image / Text→Video', zh: '文生图 / 问生视频', on: true },
              { en: 'Speech→Text + realtime voice', zh: '语音转文字 + 实时对话', on: true },
              { en: 'Dual-token + silent refresh', zh: '双 Token + 静默刷新', on: true },
              { en: 'SSO (Google / 飞书 / 企业微信)', zh: 'SSO(Google / 飞书 / 企业微信)', on: true },
              { en: 'Phone + SMS OTP login', zh: '手机号验证码登录', on: true },
              { en: 'i18n + theme switch', zh: '国际化 + 主题切换', on: true },
              { en: 'RBAC button-level control', zh: 'RBAC 按钮级权限', on: true },
              { en: 'WebSocket live monitoring', zh: 'WebSocket 实时监控', on: true },
            ].map((c) => (
              <div
                key={c.en}
                className="row gap-3"
                style={{ padding: '10px 0', borderBottom: '1px solid var(--glass-border)', fontSize: 13.5 }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10B981', display: 'grid', placeItems: 'center', fontSize: 12, flexShrink: 0 }}>
                  ✓
                </span>
                <span>{b(c)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
