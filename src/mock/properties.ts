import type { Property } from '@/types';

/* ============================================================
   20 mock listings across Beijing districts, China market.
   Prices in CNY; unit prices in ¥/㎡.
   ============================================================ */

const districts = [
  { en: 'Haidian · Zhongguancun', zh: '海淀 · 中关村', unit: 118000 },
  { en: 'Xicheng · Financial St.', zh: '西城 · 金融街', unit: 152000 },
  { en: 'Chaoyang · Wangjing', zh: '朝阳 · 望京', unit: 72000 },
  { en: 'Dongcheng · Dongsi', zh: '东城 · 东四', unit: 145000 },
  { en: 'Fengtai · Lize', zh: '丰台 · 丽泽', unit: 64000 },
  { en: 'Shijingshan · Bajiao', zh: '石景山 · 八角', unit: 58000 },
  { en: 'Tongzhou · Beiyuan', zh: '通州 · 北苑', unit: 48000 },
];

const titles: { en: string; zh: string }[] = [
  { en: 'Bright south-facing 3-bed', zh: '南向通透三居室' },
  { en: 'Renovated metro-side flat', zh: '精装地铁旁高层' },
  { en: 'School-district 2-bed', zh: '学区两居室' },
  { en: 'High-floor city view', zh: '高层城市景观房' },
  { en: 'Quiet courtyard duplex', zh: '静谧庭院复式' },
  { en: 'New-build smart home', zh: '新建智能精装' },
  { en: 'Riverside garden unit', zh: '河景花园洋房' },
  { en: 'Compact starter home', zh: '紧凑刚需小户' },
  { en: 'Premium corner suite', zh: '高端转角套房' },
  { en: 'Loft with terrace', zh: '带露台 Loft' },
];

const allTags: Property['tags'] = ['school', 'metro', 'hot', 'new', 'investment'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export const PROPERTIES: Property[] = Array.from({ length: 20 }, (_, i) => {
  const d = pick(districts, i);
  const area = 58 + ((i * 13) % 96); // 58 - 153 ㎡
  const unitPrice = d.unit + ((i % 5) - 2) * 3000;
  const totalPrice = Math.round((unitPrice * area) / 1000) * 1000;
  const t = pick(titles, i);
  const tagCount = 2 + (i % 3);
  const tags: Property['tags'] = [];
  for (let k = 0; k < tagCount; k++) tags.push(pick(allTags, i + k));
  const roiScore = 62 + ((i * 7) % 34); // 62 - 95
  const riskScore = 18 + ((i * 11) % 46); // 18 - 63
  const hue = (200 + i * 24) % 360;

  return {
    id: `prop-${String(i + 1).padStart(2, '0')}`,
    title: { en: `${t.en} · ${d.en.split('·')[1]?.trim() ?? ''}`.trim(), zh: t.zh },
    district: { en: d.en, zh: d.zh },
    area,
    totalPrice,
    unitPrice,
    bedrooms: 1 + (i % 4),
    bathrooms: 1 + (i % 2),
    cover: `hsl(${hue}, 60%, 42%)`,
    tags: [...new Set(tags)],
    roiScore,
    riskScore,
    favorite: i % 7 === 0,
  };
});

/* ============================================================
   Large synthetic dataset for the virtual-scroll demo.
   Generated lazily & deterministically (no per-render cost).
   ============================================================ */

export interface ListingRow {
  id: number;
  code: string;
  district: string;
  area: number;
  totalPrice: number;
  unitPrice: number;
  status: 'on' | 'pending' | 'sold';
}

const DISTRICT_NAMES = ['海淀', '西城', '朝阳', '东城', '丰台', '石景山', '通州', '昌平', '大兴', '顺义'];

export function generateListings(count: number): ListingRow[] {
  const rows: ListingRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const district = DISTRICT_NAMES[i % DISTRICT_NAMES.length];
    const area = 50 + ((i * 7) % 140);
    const unitPrice = 40000 + ((i * 1370) % 110000);
    const totalPrice = Math.round((area * unitPrice) / 10000) * 10000;
    const status: ListingRow['status'] = i % 9 === 0 ? 'sold' : i % 4 === 0 ? 'pending' : 'on';
    rows[i] = {
      id: i + 1,
      code: `BJ-${String(i + 1).padStart(6, '0')}`,
      district,
      area,
      totalPrice,
      unitPrice,
      status,
    };
  }
  return rows;
}
