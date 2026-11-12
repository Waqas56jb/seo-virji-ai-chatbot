import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowDown, RotateCw } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import QuickReplies from './QuickReplies.jsx';
import { isNearBottom } from '../../utils/format.js';

export default function MessageList({ messages, isTyping, error, onRetry, onQuickReply, onOpenHandoff, whatsapp }) {
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Jump to the end instantly when the list first renders (e.g. restoring a session).
  useLayoutEffect(() => {
    scrollToBottom('auto');
  }, [scrollToBottom]);

  // Follow new messages if the visitor is at the bottom, or if they just sent something.
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (stickToBottom.current || last?.role === 'user') {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [messages.length, isTyping, error, last?.role, scrollToBottom]);

  const handleScroll = () => {
    const near = isNearBottom(scrollRef.current);
    stickToBottom.current = near;
    setShowJump(!near);
  };

  const quickReplies = !isTyping && !error && last?.role === 'assistant' ? last.quickReplies : null;

  return (
    <div className="sv-messages-wrap">
      <div
        ref={scrollRef}
        className="sv-messages"
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        tabIndex={0}
      >
        <div className="sv-conversation-start">
          <span>Today</span>
        </div>

        {messages.map((message, i) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAvatar={message.role === 'assistant' && messages[i - 1]?.role !== 'assistant'}
            onOpenHandoff={onOpenHandoff}
            whatsapp={whatsapp}
          />
        ))}

        <AnimatePresence>{isTyping && <TypingIndicator key="typing" />}</AnimatePresence>

        {error && (
          <motion.div className="sv-send-error" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <AlertCircle size={16} />
            <span>{error.message}</span>
            <button type="button" className="sv-link-btn" onClick={onRetry}>
              <RotateCw size={13} /> {error.type === 'session' ? 'Start a new conversation' : 'Retry'}
            </button>
          </motion.div>
        )}

        {quickReplies && <QuickReplies key={last.id} options={quickReplies} onSelect={onQuickReply} disabled={isTyping} />}
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.button
            type="button"
            className="sv-jump"
            aria-label="Scroll to latest message"
            onClick={() => scrollToBottom()}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.18 }}
          >
            <ArrowDown size={17} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
