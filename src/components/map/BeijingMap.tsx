import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  CircleMarker,
  Tooltip,
  ZoomControl,
} from 'react-leaflet';
import { useUiStore } from '@/store/uiStore';

/* ============================================================
   BeijingMap — Leaflet + CartoDB tiles with district overlays.

   Tiles: CartoDB Dark Matter (dark) / CartoDB Positron (light).
   No API key required.

   District polygons use approximate real lat/lng boundaries
   for Beijing's 7 core urban districts.
   ============================================================ */

type LatLon = [number, number];

/* ── Approximate real district boundaries (lat, lng) ─────── */

const DISTRICT_GEO: Record<string, LatLon[]> = {
  haidian: [
    [40.090, 116.175], [40.088, 116.313], [40.062, 116.396],
    [40.020, 116.432], [39.970, 116.418], [39.948, 116.368],
    [39.940, 116.282], [39.952, 116.175],
  ],
  xicheng: [
    [39.958, 116.330], [39.958, 116.418], [39.888, 116.418],
    [39.886, 116.356], [39.906, 116.330],
  ],
  dongcheng: [
    [39.958, 116.418], [39.958, 116.452], [39.888, 116.452],
    [39.888, 116.418],
  ],
  chaoyang: [
    [40.066, 116.432], [40.062, 116.625], [40.012, 116.688],
    [39.910, 116.668], [39.878, 116.562], [39.884, 116.452],
    [39.958, 116.452], [39.958, 116.420], [40.020, 116.432],
  ],
  fengtai: [
    [39.952, 116.175], [39.960, 116.338], [39.886, 116.356],
    [39.888, 116.418], [39.884, 116.452], [39.848, 116.508],
    [39.782, 116.462], [39.772, 116.282], [39.846, 116.175],
  ],
  shijingshan: [
    [39.972, 116.174], [39.972, 116.285], [39.952, 116.280],
    [39.940, 116.200], [39.960, 116.162],
  ],
  tongzhou: [
    [40.026, 116.688], [40.028, 116.896], [39.790, 116.896],
    [39.778, 116.688], [39.910, 116.668],
  ],
};

/* ── Metro lines (approximate Beijing line geometry) ────── */

const METRO_LINES: { positions: LatLon[]; color: string }[] = [
  { /* Line 1 / East-West */
    color: '#4F7CFF',
    positions: [
      [39.916, 116.240], [39.929, 116.332], [39.930, 116.392],
      [39.912, 116.454], [39.914, 116.568],
    ],
  },
  { /* Line 4 / NW-SE */
    color: '#00D4FF',
    positions: [
      [40.058, 116.328], [40.024, 116.333], [39.958, 116.340],
      [39.922, 116.400], [39.886, 116.418],
    ],
  },
  { /* Line 6 extension */
    color: '#10B981',
    positions: [
      [39.885, 116.390], [39.912, 116.462], [39.915, 116.542],
      [39.918, 116.628],
    ],
  },
];

/* ── Helpers ─────────────────────────────────────────────── */

function centroid(pts: LatLon[]): LatLon {
  const sum = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as LatLon, [0, 0] as LatLon);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

function priceColor(price: number, opacity: number): string {
  const t = Math.max(0, Math.min(1, (price - 40) / 120));
  return `hsla(${(1 - t) * 145}, 70%, 50%, ${opacity})`;
}

/* ── Props ───────────────────────────────────────────────── */

export interface MapDistrict {
  id: string;
  en: string;
  zh: string;
  price: number;
  growth: number;
  school: number;
}

interface Props {
  districts: MapDistrict[];
  layers:    Record<string, boolean>;
  activeId:  string;
  onSelect:  (id: string) => void;
  lang:      string;
  priceMax:  number;
}

/* ── Component ───────────────────────────────────────────── */

export default function BeijingMap({ districts, layers, activeId, onSelect, lang, priceMax }: Props) {
  const theme = useUiStore((s) => s.theme);

  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
    ' &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <MapContainer
      center={[39.96, 116.43]}
      zoom={11}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer key={tileUrl} url={tileUrl} attribution={attribution} maxZoom={19} />
      <ZoomControl position="bottomright" />

      {/* District polygons */}
      {districts.map((d) => {
        const geo = DISTRICT_GEO[d.id];
        if (!geo) return null;
        const hidden = d.price * 1000 > priceMax;
        const isActive = d.id === activeId;

        return (
          <Polygon
            key={d.id}
            positions={geo}
            pathOptions={{
              fillColor: priceColor(d.price, hidden ? 0 : layers.heat ? 0.55 : 0.12),
              fillOpacity: 1,
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.28)',
              weight: isActive ? 2.5 : 1.2,
            }}
            eventHandlers={{ click: () => !hidden && onSelect(d.id) }}
          >
            {!hidden && (
              <Tooltip permanent interactive={false} direction="center" className="atlas-map-tip">
                <span className="atlas-map-label">
                  {lang === 'zh' ? d.zh : d.en}
                  <br />
                  <span style={{ opacity: 0.75, fontSize: 10 }}>
                    ¥{d.price}k · +{d.growth}%
                  </span>
                </span>
              </Tooltip>
            )}
          </Polygon>
        );
      })}

      {/* Metro lines */}
      {layers.transit && METRO_LINES.map((m, i) => (
        <Polyline
          key={i}
          positions={m.positions}
          pathOptions={{ color: m.color, weight: 3.5, opacity: 0.88 }}
        />
      ))}

      {/* School dots */}
      {layers.school && districts.flatMap((d) => {
        const geo = DISTRICT_GEO[d.id];
        if (!geo) return [];
        const [clat, clng] = centroid(geo);
        return Array.from({ length: Math.round(d.school / 22) }, (_, i) => (
          <CircleMarker
            key={`${d.id}-s${i}`}
            center={[clat + ((i * 0.014) % 0.080) - 0.040, clng + ((i * 0.017) % 0.090) - 0.045]}
            radius={5}
            pathOptions={{ fillColor: '#F59E0B', fillOpacity: 0.72, color: '#F59E0B', weight: 0 }}
          />
        ));
      })}
    </MapContainer>
  );
}
