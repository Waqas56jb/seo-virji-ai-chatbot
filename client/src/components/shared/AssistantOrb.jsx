/**
 * Calm, abstract "presence" visual for the welcome screen — concentric orbits around a
 * gold spark. Deliberately not a robot. Pure SVG + CSS, respects reduced motion.
 */
export function AssistantOrb({ size = 132 }) {
  return (
    <div className="sv-orb" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 132 132" width={size} height={size}>
        <defs>
          <radialGradient id="sv-orb-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#1C2580" />
            <stop offset="100%" stopColor="var(--sv-primary)" />
          </radialGradient>
        </defs>
        <circle className="sv-orb-ring sv-orb-ring--outer" cx="66" cy="66" r="63" fill="none" stroke="var(--sv-royal)" strokeOpacity=".16" strokeWidth="1" />
        <circle className="sv-orb-ring sv-orb-ring--dash" cx="66" cy="66" r="53" fill="none" stroke="var(--sv-accent)" strokeOpacity=".45" strokeWidth="1" strokeDasharray="2 7" />
        <circle cx="66" cy="66" r="41" fill="url(#sv-orb-core)" />
        <circle cx="66" cy="66" r="33" fill="none" stroke="var(--sv-accent)" strokeOpacity=".35" strokeWidth="1" />
        <path d="M66 49.5l3.6 9.9 9.9 3.6-9.9 3.6L66 76.5l-3.6-9.9-9.9-3.6 9.9-3.6z" fill="var(--sv-accent)" />
        <circle cx="80" cy="52" r="2" fill="var(--sv-accent)" opacity=".7" />
        <g className="sv-orb-satellite">
          <circle cx="66" cy="13" r="3.5" fill="var(--sv-accent)" />
        </g>
      </svg>
    </div>
  );
}
