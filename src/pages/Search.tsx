import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { PageHead } from '@/components/ui/Headings';
import PropertyCard from '@/components/property/PropertyCard';
import Skeleton from '@/components/ui/Skeleton';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { agentService } from '@/services/agentService';
import type { Property, PropertyTag, Bi } from '@/types';

const FILTERS: { id: PropertyTag | 'all'; label: Bi }[] = [
  { id: 'all', label: { en: 'All', zh: '全部' } },
  { id: 'school', label: { en: 'School', zh: '学区' } },
  { id: 'metro', label: { en: 'Metro', zh: '地铁' } },
  { id: 'hot', label: { en: 'Hot', zh: '热门' } },
  { id: 'new', label: { en: 'New', zh: '新盘' } },
  { id: 'investment', label: { en: 'Investment', zh: '投资' } },
];

export default function Search() {
  const { b, lang } = useT();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState<PropertyTag | 'all'>('all');
  const SearchIcon = getIcon('search');

  useEffect(() => {
    let active = true;
    setLoading(true);
    agentService.searchProperties().then((data) => {
      if (active) {
        setProperties(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleFavorite = (id: string) =>
    setProperties((prev) =>
      prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)),
    );

  const visible =
    filter === 'all' ? properties : properties.filter((p) => p.tags.includes(filter));

  return (
    <AppShell title={{ en: 'Property Search', zh: '房源搜索' }} crumb="atlas / workspace / search">
      <PageHead
        title={{ en: 'Property Search', zh: '房源搜索' }}
        desc={{
          en: 'Search Agent matches listings to your budget, district, and lifestyle filters across the China market.',
          zh: '房源搜索智能体按预算、区域与生活方式，在中国市场为您匹配房源。',
        }}
      />

      {/* search bar */}
      <div
        className="card"
        style={{ padding: '4px 6px 4px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <SearchIcon size={18} color="var(--sub)" />
        <input
          placeholder={lang === 'zh' ? '搜索区域、楼盘或户型…例如 海淀 三居' : 'Search district, estate or layout… e.g. Haidian 3-bed'}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 14,
            padding: '12px 0',
            fontFamily: 'var(--font-sans)',
          }}
        />
        <button className="btn btn-primary btn-sm">{lang === 'zh' ? '搜索' : 'Search'}</button>
      </div>

      {/* filters */}
      <div className="row gap-2" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={f.id === filter ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
            style={{ borderRadius: 'var(--r-pill)' }}
            onClick={() => setFilter(f.id)}
          >
            {b(f.label)}
          </button>
        ))}
        <span className="mono" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>
          {loading ? '…' : `${visible.length} ${lang === 'zh' ? '套房源' : 'listings'}`}
        </span>
      </div>

      {/* grid */}
      <div className="grid-base grid-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card" style={{ overflow: 'hidden' }}>
                <Skeleton rounded="0" style={{ height: 150 }} />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Skeleton style={{ height: 16, width: '70%' }} />
                  <Skeleton style={{ height: 12, width: '40%' }} />
                  <Skeleton style={{ height: 28, width: '55%', marginTop: 8 }} />
                </div>
              </div>
            ))
          : visible.map((p, i) => (
              <PropertyCard key={p.id} property={p} index={i} onToggleFavorite={toggleFavorite} />
            ))}
      </div>
    </AppShell>
  );
}
