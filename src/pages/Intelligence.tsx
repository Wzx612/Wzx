import { useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import BeijingMap from '@/components/map/BeijingMap';
import type { MapDistrict } from '@/components/map/BeijingMap';
import type { Bi } from '@/types';

/* ── District data ──────────────────────────────────────── */

interface District extends MapDistrict {
  roi: number;
  transit: number;
  pop: 'low' | 'mid' | 'high' | 'vhigh';
}

const DISTRICTS: District[] = [
  { id: 'haidian',     en: 'Haidian',     zh: '海淀区', price: 118, roi: 78, school: 95, transit: 88, growth: 6.2, pop: 'high'  },
  { id: 'xicheng',     en: 'Xicheng',     zh: '西城区', price: 152, roi: 72, school: 99, transit: 92, growth: 4.1, pop: 'vhigh' },
  { id: 'dongcheng',   en: 'Dongcheng',   zh: '东城区', price: 145, roi: 70, school: 90, transit: 90, growth: 4.6, pop: 'vhigh' },
  { id: 'chaoyang',    en: 'Chaoyang',    zh: '朝阳区', price: 82,  roi: 85, school: 74, transit: 82, growth: 7.8, pop: 'high'  },
  { id: 'fengtai',     en: 'Fengtai',     zh: '丰台区', price: 64,  roi: 80, school: 66, transit: 70, growth: 8.4, pop: 'mid'   },
  { id: 'shijingshan', en: 'Shijingshan', zh: '石景山', price: 58,  roi: 76, school: 62, transit: 64, growth: 6.9, pop: 'mid'   },
  { id: 'tongzhou',    en: 'Tongzhou',    zh: '通州区', price: 48,  roi: 88, school: 58, transit: 60, growth: 9.6, pop: 'low'   },
];

/* ── Layer definitions ──────────────────────────────────── */

const LAYERS: { id: string; icon: string; name: Bi; sub: Bi; color: string }[] = [
  { id: 'heat',    icon: 'activity', name: { en: 'Price Heatmap',    zh: '价格热力'   }, sub: { en: 'avg ¥/㎡',        zh: '均价 ¥/㎡'  }, color: '#F43F5E' },
  { id: 'school',  icon: 'school',   name: { en: 'School Districts',  zh: '学区图层'   }, sub: { en: '142 schools',     zh: '142 所学校'  }, color: '#F59E0B' },
  { id: 'transit', icon: 'train',    name: { en: 'Transportation',    zh: '交通图层'   }, sub: { en: '24 metro lines',  zh: '24 条地铁'   }, color: '#00D4FF' },
  { id: 'density', icon: 'users',    name: { en: 'Population Density',zh: '人口密度'  }, sub: { en: 'per km²',         zh: '每平方公里'  }, color: '#7C3AED' },
];

/* ── Price colour helper (mirrored in BeijingMap) ─────── */

function priceColor(p: number): string {
  const t = Math.max(0, Math.min(1, (p - 40) / 120));
  return `hsl(${(1 - t) * 145}, 70%, 50%)`;
}

/* ── Page ───────────────────────────────────────────────── */

export default function Intelligence() {
  const { b, lang } = useT();
  const [layers,   setLayers]   = useState<Record<string, boolean>>({ heat: true, school: false, transit: true, density: false });
  const [active,   setActive]   = useState<District>(DISTRICTS[0]);
  const [price,    setPrice]    = useState(160000);
  const Sparkle   = getIcon('sparkle');
  const SearchIcon = getIcon('search');

  const onSelect = (id: string) => {
    const d = DISTRICTS.find((x) => x.id === id);
    if (d) setActive(d);
  };

  return (
    <AppShell title={{ en: 'Estate Intelligence', zh: '楼市情报中心' }} crumb="atlas / intelligence / gis" fixedHeight bare>
      <div style={{ display: 'grid', gridTemplateColumns: '248px 1fr 304px', height: 'calc(100vh - var(--topbar-h))', minHeight: 0 }}>

        {/* ── Left: layers + filters ──────────────────────── */}
        <aside style={{ borderRight: '1px solid var(--glass-border)', padding: '18px 14px', overflowY: 'auto' }}>
          <div className="nav-group-label">{lang === 'zh' ? '地图图层' : 'Map Layers'}</div>

          {LAYERS.map((l) => {
            const Icon = getIcon(l.icon);
            const on   = layers[l.id];
            return (
              <div
                key={l.id}
                className="row gap-3"
                onClick={() => setLayers((prev) => ({ ...prev, [l.id]: !prev[l.id] }))}
                style={{ padding: '10px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer', marginBottom: 3, background: on ? 'var(--surface-2)' : 'transparent' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0, background: `linear-gradient(135deg,${l.color},${l.color}99)` }}>
                  <Icon color="#fff" size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b(l.name)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b(l.sub)}</div>
                </div>
                <div style={{ width: 36, height: 21, borderRadius: 999, background: on ? 'var(--grad-primary)' : 'var(--surface-3)', position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
              </div>
            );
          })}

          <div className="nav-group-label">{lang === 'zh' ? '筛选条件' : 'Filters'}</div>
          <div style={{ padding: '8px 6px' }}>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 8 }}>
              {lang === 'zh' ? '单价上限 (¥/㎡)' : 'Max price (¥/㎡)'}
            </div>
            <input
              type="range" min={30000} max={160000} value={price}
              onChange={(e) => setPrice(+e.target.value)}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div className="mono" style={{ fontSize: 12, color: 'var(--secondary)', marginTop: 4 }}>
              ≤ ¥{price.toLocaleString()}
            </div>
          </div>

          {/* district list */}
          <div className="nav-group-label" style={{ marginTop: 8 }}>
            {lang === 'zh' ? '区域列表' : 'Districts'}
          </div>
          {DISTRICTS.map((d) => (
            <div
              key={d.id}
              onClick={() => setActive(d)}
              className="row gap-2"
              style={{ padding: '8px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer', marginBottom: 2, background: active.id === d.id ? 'var(--surface-2)' : 'transparent' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: priceColor(d.price), flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: active.id === d.id ? 700 : 500 }}>
                {lang === 'zh' ? d.zh : d.en}
              </span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                ¥{d.price}k
              </span>
            </div>
          ))}
        </aside>

        {/* ── Center: real Leaflet map ─────────────────────── */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {/* floating search bar */}
          <div
            className="card"
            style={{ position: 'absolute', left: 16, top: 16, zIndex: 800, display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 14px', minWidth: 260 }}
          >
            <SearchIcon size={17} color="var(--sub)" />
            <input
              placeholder={lang === 'zh' ? '搜索区域、楼盘或地铁站…' : 'Search district, estate or metro…'}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, width: '100%' }}
            />
          </div>

          {/* price legend */}
          <div className="card" style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 800, padding: '12px 14px' }}>
            <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {lang === 'zh' ? '价格热力' : 'Price Heatmap'}
            </div>
            <div style={{ width: 160, height: 8, borderRadius: 999, background: 'linear-gradient(90deg, #10B981, #F59E0B, #F43F5E)' }} />
            <div className="row mono" style={{ justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
              <span>¥40k</span><span>¥100k</span><span>¥160k+</span>
            </div>
          </div>

          <BeijingMap
            districts={DISTRICTS}
            layers={layers}
            activeId={active.id}
            onSelect={onSelect}
            lang={lang}
            priceMax={price}
          />
        </div>

        {/* ── Right: district analysis ─────────────────────── */}
        <aside style={{ borderLeft: '1px solid var(--glass-border)', padding: '18px 14px', overflowY: 'auto' }}>
          <div className="nav-group-label">{lang === 'zh' ? '区域分析' : 'District Analysis'}</div>

          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{lang === 'zh' ? active.zh : active.en}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--secondary)' }}>district · 北京</div>
          </div>

          <div className="grid-base grid-2" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: priceColor(active.price) }}>
                ¥{active.price}k
              </div>
              <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
                {lang === 'zh' ? '均价 / ㎡' : 'avg / ㎡'}
              </div>
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>
                +{active.growth}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
                {lang === 'zh' ? '同比涨幅' : 'YoY growth'}
              </div>
            </div>
          </div>

          <div className="nav-group-label" style={{ paddingTop: 4 }}>
            {lang === 'zh' ? '投资信号' : 'Investment Signals'}
          </div>

          {([
            [{ en: 'ROI Potential',  zh: '投资潜力' }, active.roi,     '#10B981'],
            [{ en: 'School Score',   zh: '学区评分' }, active.school,  '#F59E0B'],
            [{ en: 'Transit Access', zh: '交通便利' }, active.transit, '#00D4FF'],
          ] as [Bi, number, string][]).map(([label, v, c]) => (
            <div key={label.en} style={{ marginBottom: 13 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span>{b(label)}</span>
                <b className="mono">{v}</b>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${v}%`, background: c, borderRadius: 999 }} />
              </div>
            </div>
          ))}

          <div className="card" style={{ marginTop: 8, padding: 14, background: 'rgba(79,124,255,0.08)', border: '1px solid rgba(79,124,255,0.25)' }}>
            <div className="row gap-2" style={{ fontWeight: 650, marginBottom: 7, color: 'var(--secondary)', fontSize: 12.5 }}>
              <Sparkle size={15} />
              {lang === 'zh' ? '智能体建议' : 'Agent Recommendation'}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)' }}>
              {active.roi > 82
                ? lang === 'zh'
                  ? '强烈看多 —— 交通可达性提升、投资回报跑赢房价涨幅。'
                  : 'Strong buy signal — rising transit access and ROI outpace price growth.'
                : lang === 'zh'
                  ? '建议持有 —— 优质学区支撑高房价，回调时入手更佳。'
                  : 'Hold — premium 学区 keeps prices high; enter on dips.'}
            </div>
          </div>

          {/* OSM credit note */}
          <div style={{ marginTop: 18, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            {lang === 'zh'
              ? '地图底图 © OpenStreetMap 贡献者 · CartoDB。区域边界为近似值。'
              : 'Map tiles © OpenStreetMap contributors · CartoDB. District boundaries are approximate.'}
          </div>
        </aside>

      </div>
    </AppShell>
  );
}
