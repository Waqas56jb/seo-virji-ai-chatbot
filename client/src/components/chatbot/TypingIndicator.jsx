import { motion } from 'framer-motion';
import { AssistantAvatar } from '../shared/BrandMark.jsx';

export default function TypingIndicator() {
  return (
    <motion.div
      className="sv-msg sv-msg--assistant sv-typing"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22 }}
      role="status"
      aria-live="polite"
    >
      <div className="sv-msg-avatar">
        <AssistantAvatar size={28} />
      </div>
      <div className="sv-msg-stack">
        <div className="sv-bubble sv-typing-bubble" aria-hidden="true">
          <span className="sv-typing-dot" />
          <span className="sv-typing-dot" />
          <span className="sv-typing-dot" />
        </div>
        <span className="sv-typing-label">SEO Virji AI is thinking…</span>
      </div>
    </motion.div>
  );
}
