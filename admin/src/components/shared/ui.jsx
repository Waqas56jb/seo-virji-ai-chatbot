/**
 * Small presentational building blocks shared across pages.
 * Kept together on purpose — each is only a few lines and they share one stylesheet.
 */
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import styles from './ui.module.css';

export function PageHeader({ title, description, actions }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description && <p className={styles.pageDescription}>{description}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </div>
  );
}

export function StatusBadge({ tone = 'gray', children, dot = true }) {
  return (
    <span className={`${styles.badge} ${styles[`tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`] || ''}`}>
      {dot && <span className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact }) {
  return (
    <div className={`${styles.empty} ${compact ? styles.emptyCompact : ''}`}>
      {Icon && (
        <span className={styles.emptyIcon}>
          <Icon size={22} />
        </span>
      )}
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <label className={styles.search}>
      <span className="sr-only">{label}</span>
      <Search size={16} className={styles.searchIcon} aria-hidden="true" />
      <input
        type="search"
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className={styles.searchClear} onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function FilterTabs({ options, value, onChange, counts, label = 'Filter', wrap }) {
  return (
    <div className={`${styles.tabs} ${wrap ? styles.tabsWrap : ''}`} role="tablist" aria-label={label}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {counts && counts[opt.value] !== undefined && <span className={styles.tabCount}>{counts[opt.value]}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label className={styles.toggleRow} htmlFor={id}>
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {description && <span className={styles.toggleDescription}>{description}</span>}
      </span>
      <span className={styles.toggle}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.toggleTrack} aria-hidden="true">
          <span className={styles.toggleThumb} />
        </span>
      </span>
    </label>
  );
}

export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <span className="skeleton" style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}

export function Avatar({ name, size = 36 }) {
  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';
  return (
    <span className={`${styles.avatar} ${!name ? styles.avatarAnon : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Error panel with a retry action — used wherever a view fails to load. */
export function ErrorState({ title = "Couldn't load this", error, onRetry, compact }) {
  return (
    <div role="alert">
      <EmptyState
        compact={compact}
        icon={AlertTriangle}
        title={title}
        description={error?.message || 'Something went wrong. Please try again.'}
        action={
          onRetry && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
              <RotateCcw size={15} /> Try again
            </button>
          )
        }
      />
    </div>
  );
}

/** Prev / Next pager with "Page X of Y". Hidden when everything fits on one page. */
export function Pagination({ page, pages, total, onChange, disabled, label = 'Pagination', unit = 'results' }) {
  if (!pages || pages <= 1) {
    return total ? <p className={styles.pagerSummary}>{`${total.toLocaleString()} ${unit}`}</p> : null;
  }
  return (
    <nav className={styles.pager} aria-label={label}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">
        <ChevronLeft size={15} /> Prev
      </button>
      <span className={styles.pagerText} aria-live="polite">
        Page {page} of {pages}
        {total !== undefined && <small>{` · ${total.toLocaleString()} ${unit}`}</small>}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(page + 1)} disabled={disabled || page >= pages} aria-label="Next page">
        Next <ChevronRight size={15} />
      </button>
    </nav>
  );
}

/** From / To date inputs (YYYY-MM-DD) with a clear button. */
export function DateRange({ from, to, onChange, idPrefix = 'range', compact }) {
  const invalid = from && to && from > to;
  return (
    <div className={`${styles.dateRange} ${compact ? styles.dateRangeCompact : ''}`} role="group" aria-label="Date range">
      <label className={styles.dateField} htmlFor={`${idPrefix}-from`}>
        <span>From</span>
        <input id={`${idPrefix}-from`} type="date" className="input" value={from || ''} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} aria-invalid={Boolean(invalid)} />
      </label>
      <label className={styles.dateField} htmlFor={`${idPrefix}-to`}>
        <span>To</span>
        <input id={`${idPrefix}-to`} type="date" className="input" value={to || ''} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} aria-invalid={Boolean(invalid)} />
      </label>
      {(from || to) && (
        <button type="button" className={`btn btn-ghost btn-sm ${styles.dateClear}`} onClick={() => onChange({ from: '', to: '' })}>
          <X size={14} /> Clear dates
        </button>
      )}
    </div>
  );
}
