import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Launcher icon (original artwork): a soft white chat bubble with live "typing" dots and a
 * gold AI sparkle — friendly and premium, in the SEO Virji navy/gold theme.
 */
function LauncherGlyph() {
  return (
    <svg className="sv-glyph" viewBox="0 0 32 32" width="35" height="35" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sv-glyph-bubble" x1="6" y1="6" x2="26" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E9ECFF" />
        </linearGradient>
      </defs>
      <path
        d="M15.5 6C9.15 6 4 10.3 4 15.6c0 2.9 1.53 5.5 3.95 7.26-.2 1.6-.93 3.05-2.08 4.17 2.24-.06 4.27-.86 5.73-2.06 1.22.33 2.53.5 3.9.5C21.85 25.47 27 21.17 27 15.86 27 10.3 21.85 6 15.5 6Z"
        fill="url(#sv-glyph-bubble)"
      />
      <circle className="sv-glyph-dot" cx="10.6" cy="15.9" r="1.75" fill="var(--sv-primary)" />
      <circle className="sv-glyph-dot" cx="15.5" cy="15.9" r="1.75" fill="var(--sv-primary)" />
      <circle className="sv-glyph-dot" cx="20.4" cy="15.9" r="1.75" fill="var(--sv-primary)" />
      <path className="sv-glyph-spark" d="M26 1.6l1.05 2.9 2.9 1.05-2.9 1.05L26 9.5l-1.05-2.9-2.9-1.05 2.9-1.05z" fill="var(--sv-accent)" />
    </svg>
  );
}

export default function ChatLauncher({ isOpen, hasUnread, showTeaser, onClick, onDismissTeaser }) {
  const [teaserVisible, setTeaserVisible] = useState(false);

  // A gentle, one-time nudge a few seconds after page load.
  useEffect(() => {
    if (!showTeaser) {
      setTeaserVisible(false);
      return undefined;
    }
    const t = setTimeout(() => setTeaserVisible(true), 3500);
    return () => clearTimeout(t);
  }, [showTeaser]);

  return (
    <div className="sv-launcher-wrap">
      <AnimatePresence>
        {teaserVisible && (
          <motion.div
            className="sv-teaser"
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button type="button" className="sv-teaser-body" onClick={onClick}>
              <span className="sv-teaser-title">Hi there 👋</span>
              <span className="sv-teaser-text">Looking to grow your business? I'm here to help.</span>
            </button>
            <button type="button" className="sv-teaser-close" aria-label="Dismiss message" onClick={onDismissTeaser}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className={`sv-launcher ${isOpen ? 'is-open' : ''}`}
        onClick={onClick}
        aria-label={isOpen ? 'Close SEO Virji AI Consultant' : 'Chat with SEO Virji AI Consultant'}
        aria-expanded={isOpen}
      >
        {!isOpen && <span className="sv-launcher-halo" aria-hidden="true" />}
        <span className="sv-launcher-icon">
          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                <X size={24} strokeWidth={2} />
              </motion.span>
            ) : (
              <motion.span key="open" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.18 }}>
                <LauncherGlyph />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {hasUnread && !isOpen && <span className="sv-launcher-dot" aria-hidden="true" />}
      </button>
    </div>
  );
}
