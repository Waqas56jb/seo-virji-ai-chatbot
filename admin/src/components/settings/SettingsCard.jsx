import styles from './settings.module.css';

export default function SettingsCard({ icon: Icon, title, description, children, aside, id }) {
  return (
    <section className={`card ${styles.card}`} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className={styles.cardHead}>
        {Icon && (
          <span className={styles.cardIcon}>
            <Icon size={18} />
          </span>
        )}
        <div className={styles.cardHeadText}>
          <h2 className="card-title" id={id ? `${id}-title` : undefined}>
            {title}
          </h2>
          {description && <p className="card-sub">{description}</p>}
        </div>
        {aside}
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

/** Labelled form row with optional hint + error. */
export function Field({ label, htmlFor, hint, error, children, optional }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/** Selectable cards / pills (single choice). */
export function OptionGroup({ name, options, value, onChange, variant = 'cards', label }) {
  return (
    <div className={variant === 'cards' ? styles.optionCards : styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <label key={opt.value} className={`${styles.option} ${active ? styles.optionActive : ''}`}>
            <input type="radio" name={name} value={opt.value} checked={active} onChange={() => onChange(opt.value)} className="sr-only" />
            {variant === 'cards' ? (
              <>
                <span className={styles.optionTop}>
                  {Icon && <Icon size={17} />}
                  <span className={styles.optionLabel}>{opt.label}</span>
                  <span className={styles.radio} aria-hidden="true" />
                </span>
                {opt.description && <span className={styles.optionDescription}>{opt.description}</span>}
              </>
            ) : (
              <span className={styles.optionLabel}>{opt.label}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Multi-select check chips. */
export function CheckChips({ options, values, onChange, label }) {
  return (
    <div className={styles.checkChips} role="group" aria-label={label}>
      {options.map((opt) => {
        const checked = Boolean(values[opt.value]);
        return (
          <label key={opt.value} className={`${styles.checkChip} ${checked ? styles.checkChipOn : ''}`}>
            <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange({ ...values, [opt.value]: e.target.checked })} />
            <span className={styles.checkBox} aria-hidden="true">
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
