import { memo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Check } from 'lucide-react';
import FormattedText from './FormattedText.jsx';
import LeadQualification from './LeadQualification.jsx';
import { WhatsAppCta } from './WhatsAppHandoff.jsx';
import { AssistantAvatar } from '../shared/BrandMark.jsx';
import { FIELD_LABELS } from '../../utils/labels.js';
import { formatTime } from '../../utils/format.js';

function NotedChip({ field, value }) {
  return (
    <div className="sv-noted" title={`${FIELD_LABELS[field] || field}: ${value}`}>
      <span className="sv-noted-icon"><Check size={11} strokeWidth={3} /></span>
      <span className="sv-noted-label">{FIELD_LABELS[field] || field}</span>
      <span className="sv-noted-value">{value}</span>
    </div>
  );
}

/** Subtle grounding note: which SEO Virji knowledge the answer used. */
function Sources({ sources }) {
  const website = sources.filter((s) => s.url);
  return (
    <div className="sv-sources">
      <BookOpen size={12} />
      <span>Based on SEO Virji's {website.length ? 'website' : 'business information'}</span>
      {website.slice(0, 2).map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
          {new URL(s.url).pathname === '/' ? 'Home' : s.title?.slice(0, 32) || 'Source'}
        </a>
      ))}
    </div>
  );
}

function MessageBubble({ message, showAvatar, onOpenHandoff, whatsapp }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      className={`sv-msg ${isUser ? 'sv-msg--user' : 'sv-msg--assistant'} ${showAvatar ? 'is-first' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {!isUser && <div className="sv-msg-avatar">{showAvatar && <AssistantAvatar size={28} />}</div>}

      <div className="sv-msg-stack">
        {message.noted && <NotedChip field={message.noted.field} value={message.noted.value} />}

        <div className={`sv-bubble ${message.failed ? 'is-failed' : ''}`}>
          {isUser ? <p>{message.content}</p> : <FormattedText text={message.content} />}
        </div>

        {!isUser && message.sources?.length > 0 && <Sources sources={message.sources} />}

        {message.attachment?.type === 'lead-summary' && <LeadQualification lead={message.attachment.lead} />}
        {message.attachment?.type === 'whatsapp-cta' && whatsapp.enabled && (
          <WhatsAppCta label={whatsapp.label} onClick={onOpenHandoff} />
        )}

        <span className="sv-msg-meta">
          {!isUser && <span className="sv-sr-only">SEO Virji AI said at </span>}
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {message.failed && <span className="sv-msg-failed"> · Not delivered</span>}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(MessageBubble);
