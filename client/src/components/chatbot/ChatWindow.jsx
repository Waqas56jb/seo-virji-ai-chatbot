import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ChatHeader from './ChatHeader.jsx';
import WelcomeScreen from './WelcomeScreen.jsx';
import MessageList from './MessageList.jsx';
import MessageComposer from './MessageComposer.jsx';
import WhatsAppHandoff from './WhatsAppHandoff.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { MOBILE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.js';

const EASE = [0.2, 0.8, 0.2, 1];

export default function ChatWindow({ config, chat, isExpanded, onToggleExpand, onClose, standalone = false }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const composerRef = useRef(null);

  const isActive = chat.status === 'active';

  // Move focus into the conversation when it becomes active.
  useEffect(() => {
    if (isActive && !isMobile) {
      const t = setTimeout(() => composerRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isActive, isMobile]);

  const handleQuickReply = useCallback(
    (text) => {
      // Only the explicit handoff action opens the sheet — "WhatsApp" as an answer is a normal reply.
      const isHandoffAction = /^continue on whatsapp$/i.test(text) || text === config.whatsappLabel;
      if (isHandoffAction && config.whatsappEnabled) {
        setHandoffOpen(true);
        return;
      }
      chat.send(text);
    },
    [chat, config.whatsappEnabled, config.whatsappLabel],
  );

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (confirmReset) setConfirmReset(false);
    else if (handoffOpen) setHandoffOpen(false);
    else if (onClose) onClose();
  };

  const motionProps = standalone
    ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE } }
    : isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: { duration: 0.34, ease: EASE } }
    : {
        initial: { opacity: 0, y: 18, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 14, scale: 0.98 },
        transition: { duration: 0.26, ease: EASE },
      };

  return (
    <motion.section
      className="sv-window"
      data-expanded={isExpanded && !isMobile ? 'true' : 'false'}
      role="dialog"
      aria-modal={isMobile ? 'true' : 'false'}
      aria-label={config.assistantName}
      onKeyDown={handleKeyDown}
      {...motionProps}
    >
      <ChatHeader
        config={config}
        isActive={isActive}
        isMobile={isMobile}
        isExpanded={isExpanded}
        standalone={standalone}
        onReset={() => setConfirmReset(true)}
        onToggleExpand={onToggleExpand}
        onClose={onClose}
      />

      <div className="sv-body">
        {isActive ? (
          <MessageList
            messages={chat.messages}
            isTyping={chat.isTyping}
            error={chat.error?.type === 'send' || chat.error?.type === 'session' ? chat.error : null}
            onRetry={chat.retry}
            onQuickReply={handleQuickReply}
            onOpenHandoff={() => setHandoffOpen(true)}
            whatsapp={{ enabled: config.whatsappEnabled, label: config.whatsappLabel }}
          />
        ) : (
          <WelcomeScreen
            config={config}
            onStart={chat.start}
            isStarting={chat.isStarting || chat.isRestoring}
            error={chat.error?.type === 'start' ? chat.error : null}
            onRetry={chat.retry}
          />
        )}
      </div>

      {isActive && (
        <MessageComposer ref={composerRef} onSend={chat.send} isBusy={chat.isTyping} showHint={!isMobile} />
      )}

      <AnimatePresence>
        {handoffOpen && (
          <WhatsAppHandoff
            key="handoff"
            lead={chat.lead}
            onRequestHandoff={chat.handoff}
            onClose={() => {
              setHandoffOpen(false);
              composerRef.current?.focus();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmReset && (
          <ConfirmDialog
            key="confirm"
            title="Start a new conversation?"
            description="This clears the current conversation from this device. You can't undo this."
            confirmLabel="Start new"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              setConfirmReset(false);
              chat.reset();
            }}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}
