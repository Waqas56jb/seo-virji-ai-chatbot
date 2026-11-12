import { TrendingDown, TrendingUp } from 'lucide-react';
import { Skeleton } from '../shared/ui.jsx';
import styles from './dashboard.module.css';

/** A tiny 7-day sparkline — enough context without a heavy chart. */
function Sparkline({ points = [] }) {
  if (points.length < 2) return null;
  const w = 88;
  const h = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => [(i / (points.length - 1)) * w, h - 3 - ((p - min) / range) * (h - 6)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg className={styles.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} className={styles.sparkArea} />
      <path d={line} className={styles.sparkLine} />
      <circle cx={lx} cy={ly} r="3" className={styles.sparkDot} />
    </svg>
  );
}

export default function StatCard({ icon: Icon, label, stat, loading }) {
  if (loading || !stat) {
    return (
      <div className={`card ${styles.stat}`}>
        <Skeleton width={36} height={36} radius={10} />
        <Skeleton width="55%" height={12} style={{ marginTop: 18 }} />
        <Skeleton width="40%" height={28} style={{ marginTop: 10 }} />
      </div>
    );
  }

  const positive = stat.change >= 0;
  return (
    <div className={`card ${styles.stat}`}>
      <div className={styles.statTop}>
        <span className={styles.statIcon}>
          <Icon size={18} />
        </span>
        <Sparkline points={stat.trend} />
      </div>
      <p className={styles.statLabel}>{label}</p>
      <div className={styles.statRow}>
        <p className={styles.statValue}>
          {stat.value.toLocaleString()}
          {stat.suffix && <span>{stat.suffix}</span>}
        </p>
        <span className={`${styles.trend} ${positive ? styles.trendUp : styles.trendDown}`}>
          {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {positive ? '+' : ''}
          {stat.change}%
        </span>
      </div>
      <p className={styles.statFoot}>vs. previous 30 days</p>
    </div>
  );
}
