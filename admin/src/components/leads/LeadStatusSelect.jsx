import { LEAD_STATUSES, LEAD_STATUS_MAP } from '../../utils/constants.js';
import styles from './leads.module.css';

/** Simple dropdown for changing a lead's status; colour-coded by status. */
export default function LeadStatusSelect({ value, onChange, label = 'Lead status', size = 'md' }) {
  const tone = LEAD_STATUS_MAP[value]?.tone || 'blue';
  return (
    <label className={`${styles.statusSelect} ${size === 'sm' ? styles.statusSelectSm : ''}`} data-tone={tone} onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">{label}</span>
      <span className={styles.statusDot} aria-hidden="true" />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {LEAD_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
