/**
 * SEO Virji monogram placeholder. Swap the <text> for the real logo SVG path when supplied.
 */
export function BrandMark({ size = 40, className = '', ring = true }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="14" fill="var(--sv-primary)" />
      {ring && <circle cx="24" cy="24" r="16.5" fill="none" stroke="var(--sv-accent)" strokeOpacity=".55" strokeWidth="1" />}
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontFamily="Manrope, Inter, system-ui, sans-serif"
        fontSize="14.5"
        fontWeight="800"
        letterSpacing="-0.3"
        fill="var(--sv-accent)"
      >
        SV
      </text>
    </svg>
  );
}

export function AssistantAvatar({ size = 28 }) {
  return (
    <span className="sv-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <circle cx="16" cy="16" r="16" fill="var(--sv-primary)" />
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--sv-accent)" strokeOpacity=".6" strokeWidth="1" />
        <path d="M16 9.6l1.7 4.7 4.7 1.7-4.7 1.7-1.7 4.7-1.7-4.7-4.7-1.7 4.7-1.7z" fill="var(--sv-accent)" />
      </svg>
    </span>
  );
}
