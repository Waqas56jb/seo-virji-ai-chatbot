import { motion } from 'framer-motion';
import { WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';

export default function QuickReplies({ options = [], onSelect, disabled }) {
  if (!options.length) return null;
  return (
    <div className="sv-quick" role="group" aria-label="Suggested replies">
      {options.map((option, i) => {
        const isWhatsApp = /whatsapp/i.test(option);
        return (
          <motion.button
            key={option}
            type="button"
            className={`sv-chip ${isWhatsApp ? 'sv-chip--whatsapp' : ''}`}
            onClick={() => onSelect(option)}
            disabled={disabled}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.24 }}
          >
            {isWhatsApp && <WhatsAppIcon size={15} />}
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
