import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, ChevronDown, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import { leadSummaryRows, previewWhatsAppMessage } from '../../utils/whatsapp.js';

/** Inline CTA rendered under an assistant message. */
export function WhatsAppCta({ label = 'Continue on WhatsApp', onClick }) {
  return (
    <button type="button" className="sv-wa-cta" onClick={onClick}>
      <span className="sv-wa-cta-icon"><WhatsAppIcon size={18} /></span>
      <span className="sv-wa-cta-text">
        <strong>{label}</strong>
        <small>Chat directly with our team</small>
      </span>
      <ExternalLink size={15} className="sv-wa-cta-arrow" />
    </button>
  );
}

/**
 * Handoff confirmation. On "Continue to WhatsApp" the server records the handoff (lead,
 * conversation status, generated message) and returns the wa.me link. The visitor reviews
 * and sends the pre-filled message themselves — nothing is sent automatically.
 */
export default function WhatsAppHandoff({ lead = {}, onRequestHandoff, onClose }) {
  const [name, setName] = useState(lead.name || '');
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { url, message }
  const closeRef = useRef(null);

  useEffect(() => closeRef.current?.focus(), []);

  const effectiveLead = useMemo(() => ({ ...lead, name: name.trim() || lead.name }), [lead, name]);
  const rows = leadSummaryRows(effectiveLead);

  const handleOpen = async () => {
    setBusy(true);
    setError('');
    // Open the tab synchronously (inside the click) so pop-up blockers allow it.
    const win = window.open('', '_blank');
    try {
      const data = await onRequestHandoff(name.trim() && name.trim() !== lead.name ? name.trim() : undefined);
      if (win) {
        win.opener = null;
        win.location.href = data.url;
        data.markOpened?.();
      } else {
        data.markOpened?.();
        window.location.href = data.url;
      }
      setResult(data);
    } catch (err) {
      win?.close();
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="sv-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="sv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-handoff-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className="sv-sheet-grip" aria-hidden="true" />
        <button ref={closeRef} type="button" className="sv-sheet-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {result ? (
          <div className="sv-handoff-done">
            <span className="sv-handoff-badge sv-handoff-badge--done"><Check size={26} strokeWidth={2.6} /></span>
            <h3 id="sv-handoff-title" className="sv-sheet-title">WhatsApp is opening…</h3>
            <p className="sv-sheet-text">Just press send in WhatsApp and the SEO Virji team will pick up the conversation from there.</p>
            <a className="sv-link-btn sv-handoff-fallback" href={result.url} target="_blank" rel="noopener noreferrer">
              Didn't open? Open WhatsApp <ExternalLink size={13} />
            </a>
            <button type="button" className="sv-btn sv-btn--ghost sv-btn--block" onClick={onClose}>
              <ArrowLeft size={16} /> Back to conversation
            </button>
          </div>
        ) : (
          <>
            <span className="sv-handoff-badge"><WhatsAppIcon size={28} /></span>
            <h3 id="sv-handoff-title" className="sv-sheet-title">Continue Your Conversation on WhatsApp</h3>
            <p className="sv-sheet-text">
              You're about to connect directly with SEO Virji. Your business requirements can help us continue the conversation
              smoothly.
            </p>

            {!lead.name && (
              <label className="sv-field">
                <span className="sv-field-label">
                  Your name <em>(optional)</em>
                </span>
                <input
                  type="text"
                  value={name}
                  maxLength={60}
                  autoComplete="name"
                  placeholder="So our team knows who they're speaking with"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}

            {rows.length > 0 && (
              <div className="sv-handoff-summary">
                <p className="sv-handoff-summary-title">We'll include a short summary</p>
                <ul>
                  {rows.slice(0, 4).map((row) => (
                    <li key={row.key}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="button" className="sv-preview-toggle" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
              Preview message <ChevronDown size={15} className={showPreview ? 'is-flipped' : ''} />
            </button>
            {showPreview && <pre className="sv-message-preview">{previewWhatsAppMessage(effectiveLead)}</pre>}

            {error && (
              <p className="sv-inline-error sv-handoff-error" role="alert">
                <AlertCircle size={15} /> {error}
              </p>
            )}

            <button type="button" className="sv-btn sv-btn--whatsapp sv-btn--block sv-btn--lg" onClick={handleOpen} disabled={busy}>
              {busy ? <span className="sv-spinner sv-spinner--light" aria-hidden="true" /> : <WhatsAppIcon size={20} />}
              {busy ? 'Preparing…' : 'Continue to WhatsApp'}
            </button>
            <p className="sv-handoff-note">
              <ShieldCheck size={13} />
              You can review and edit the message before sending.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
