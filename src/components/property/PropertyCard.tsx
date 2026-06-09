import { motion } from 'framer-motion';
import { getIcon } from '@/lib/icons';
import { useT } from '@/lib/useT';
import { fmtCny, fmtUnitPrice, cn } from '@/lib/format';
import type { Property, PropertyTag, Bi } from '@/types';

const TAG_LABEL: Record<PropertyTag, Bi> = {
  school: { en: 'School', zh: '学区' },
  metro: { en: 'Metro', zh: '地铁' },
  hot: { en: 'Hot', zh: '热门' },
  new: { en: 'New', zh: '新盘' },
  investment: { en: 'Investment', zh: '投资' },
};
const TAG_COLOR: Record<PropertyTag, string> = {
  school: '#F59E0B',
  metro: '#00D4FF',
  hot: '#F43F5E',
  new: '#10B981',
  investment: '#7C3AED',
};

export default function PropertyCard({
  property,
  index,
  onToggleFavorite,
}: {
  property: Property;
  index: number;
  onToggleFavorite: (id: string) => void;
}) {
  const { b, lang } = useT();
  const Heart = getIcon('heart');
  const Bed = getIcon('bed');
  const Bath = getIcon('bath');
  const Area = getIcon('area');

  return (
    <motion.div
      className="card card-hover"
      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Cover — striped placeholder per design guidance */}
      <div
        style={{
          height: 150,
          position: 'relative',
          background: `repeating-linear-gradient(135deg, ${property.cover}, ${property.cover} 12px, ${property.cover}cc 12px, ${property.cover}cc 24px)`,
        }}
      >
        <div
          className="mono"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 11,
            letterSpacing: '0.08em',
          }}
        >
          property photo
        </div>
        <button
          aria-label="favorite"
          onClick={() => onToggleFavorite(property.id)}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 34,
            height: 34,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(11,16,32,0.5)',
            backdropFilter: 'blur(8px)',
            color: property.favorite ? '#F43F5E' : '#fff',
          }}
        >
          <Heart size={17} fill={property.favorite ? '#F43F5E' : 'none'} />
        </button>
        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {property.tags.map((tag) => (
            <span
              key={tag}
              className="badge"
              style={{
                color: TAG_COLOR[tag],
                background: `${TAG_COLOR[tag]}22`,
                borderColor: `${TAG_COLOR[tag]}55`,
                fontSize: 10,
              }}
            >
              {b(TAG_LABEL[tag])}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div>
          <div style={{ fontWeight: 650, fontSize: 14.5, letterSpacing: '-0.01em' }}>
            {b(property.title)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 2 }}>
            {b(property.district)}
          </div>
        </div>

        <div className="row gap-4" style={{ fontSize: 12, color: 'var(--sub)' }}>
          <span className="row gap-2">
            <Bed size={14} /> {property.bedrooms}
          </span>
          <span className="row gap-2">
            <Bath size={14} /> {property.bathrooms}
          </span>
          <span className="row gap-2">
            <Area size={14} /> {property.area}㎡
          </span>
        </div>

        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 'auto',
            paddingTop: 10,
            borderTop: '1px solid var(--glass-border)',
          }}
        >
          <div>
            <div className="mono" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>
              {fmtCny(property.totalPrice, lang)}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
              {fmtUnitPrice(property.unitPrice, lang)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={cn('mono')} style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>
              ROI {property.roiScore}
            </div>
            <div
              className="mono"
              style={{ fontSize: 11, color: property.riskScore > 45 ? '#F59E0B' : 'var(--muted)' }}
            >
              {lang === 'zh' ? '风险' : 'Risk'} {property.riskScore}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
