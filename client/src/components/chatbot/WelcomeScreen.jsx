import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Clock, Lock } from 'lucide-react';
import { AssistantOrb } from '../shared/AssistantOrb.jsx';

const item = {
  hidden: { opacity: 0, y: 10 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.06 + i * 0.06, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] } }),
};

export default function WelcomeScreen({ config, onStart, isStarting, error, onRetry }) {
  return (
    <div className="sv-welcome">
      <div className="sv-welcome-inner">
        <motion.div custom={0} variants={item} initial="hidden" animate="show">
          <AssistantOrb size={124} />
        </motion.div>

        <motion.p className="sv-welcome-brand" custom={1} variants={item} initial="hidden" animate="show">
          {config.brandName}
        </motion.p>

        <motion.h1 className="sv-welcome-title" custom={2} variants={item} initial="hidden" animate="show">
          Welcome to SEO Virji
        </motion.h1>
        <motion.p className="sv-welcome-subtitle" custom={3} variants={item} initial="hidden" animate="show">
          Your Personal AI Business Consultant
        </motion.p>
        <motion.p className="sv-welcome-text" custom={4} variants={item} initial="hidden" animate="show">
          Tell me about your business, your challenges, or your growth goals. I'm here to understand your situation
          and help you explore the right solutions.
        </motion.p>

        <motion.div className="sv-welcome-cta" custom={5} variants={item} initial="hidden" animate="show">
          {error ? (
            <div className="sv-inline-error" role="alert">
              <AlertCircle size={16} />
              <span>{error.message}</span>
              <button type="button" className="sv-link-btn" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : (
            <button type="button" className="sv-btn sv-btn--gold sv-btn--lg" onClick={onStart} disabled={isStarting} autoFocus>
              {isStarting ? (
                <>
                  <span className="sv-spinner" aria-hidden="true" />
                  Connecting…
                </>
              ) : (
                <>
                  Start Conversation
                  <ArrowRight size={18} strokeWidth={2.2} />
                </>
              )}
            </button>
          )}
          <p className="sv-welcome-meta">
            <span><Clock size={13} /> Available 24/7</span>
            <span className="sv-dot-sep" aria-hidden="true" />
            <span><Lock size={13} /> Private Conversations</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
