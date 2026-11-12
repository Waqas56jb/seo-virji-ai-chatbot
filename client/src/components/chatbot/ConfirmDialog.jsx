import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function ConfirmDialog({ title, description, confirmLabel = 'Confirm', onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <motion.div
      className="sv-overlay sv-overlay--center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        className="sv-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sv-confirm-title"
        aria-describedby="sv-confirm-desc"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2 }}
      >
        <h3 id="sv-confirm-title" className="sv-dialog-title">{title}</h3>
        <p id="sv-confirm-desc" className="sv-dialog-text">{description}</p>
        <div className="sv-dialog-actions">
          <button ref={cancelRef} type="button" className="sv-btn sv-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="sv-btn sv-btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
