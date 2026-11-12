import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyRemoteConfig } from '../../widget/config.js';
import { fetchBotConfig } from '../../services/chatService.js';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import ChatLauncher from './ChatLauncher.jsx';
import ChatWindow from '../chatbot/ChatWindow.jsx';
import { useChat } from '../../hooks/useChat.js';
import { loadSession, saveSession } from '../../services/storage.js';

/**
 * Root of the embeddable widget. Rendered inside a Shadow DOM by widget/mount.jsx,
 * so nothing here can leak styles into — or inherit styles from — the host website.
 */
export default function WidgetApp({ config: baseConfig, bus, standalone = false }) {
  // Settings saved in the admin panel (colours, name, WhatsApp, online status).
  const [remote, setRemote] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchBotConfig()
      .then((r) => !cancelled && setRemote(r))
      .catch(() => {
        /* keep defaults if the API is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const config = useMemo(() => applyRemoteConfig(baseConfig, remote), [baseConfig, remote]);

  const uiKey = `ui:${config.botId}`;
  const savedUi = loadSession(uiKey) || {};

  const [isOpen, setOpen] = useState(Boolean(config.openOnLoad || savedUi.isOpen));
  const [isExpanded, setExpanded] = useState(Boolean(savedUi.isExpanded));
  const [hasUnread, setUnread] = useState(config.showNotificationDot && !savedUi.seen);
  const [pendingAsk, setPendingAsk] = useState(null);
  const chat = useChat(config.botId);

  const open = useCallback(() => {
    setOpen(true);
    setUnread(false);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    saveSession(uiKey, { isOpen, isExpanded, seen: !hasUnread });
  }, [uiKey, isOpen, isExpanded, hasUnread]);

  // Host page API: window.SEOVirjiChat.open() / close() / toggle() / reset()
  useEffect(() => {
    if (!bus) return undefined;
    return bus.subscribe((type, payload) => {
      if (type === 'open') open();
      if (type === 'close') close();
      if (type === 'toggle') (isOpen ? close : open)();
      if (type === 'reset') chat.reset();
      if (type === 'ask' && payload) {
        open();
        setPendingAsk(payload);
      }
    });
  }, [bus, open, close, isOpen, chat]);

  // Deliver a host-page "ask" once the conversation is ready (starting it if needed).
  const { status, isTyping, isStarting, start, send } = chat;
  useEffect(() => {
    if (!pendingAsk) return;
    if (status === 'welcome') {
      if (!isStarting) start();
      return;
    }
    if (!isTyping && send(pendingAsk)) setPendingAsk(null);
  }, [pendingAsk, status, isTyping, isStarting, start, send]);

  const style = {
    '--sv-primary': config.primaryColor,
    '--sv-accent': config.accentColor,
  };

  // Disabled in the admin panel: the embedded widget disappears from the host website entirely.
  if (config.enabled === false) {
    if (!standalone) return null;
    return (
      <div className="sv-app sv-standalone" data-open="true" style={style}>
        <div className="sv-disabled" role="status">
          <strong>{config.assistantName}</strong>
          <p>The assistant is currently unavailable. Please use the contact details on our website.</p>
        </div>
      </div>
    );
  }

  // Standalone: the chatbot is the whole page (phone-style frame), always open, no launcher.
  if (standalone) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="sv-app sv-standalone" data-open="true" style={style}>
          <ChatWindow config={config} chat={chat} standalone />
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`sv-app sv-pos-${config.position}`}
        data-open={isOpen ? 'true' : 'false'}
        style={style}
      >
        <AnimatePresence>
          {isOpen && (
            <ChatWindow
              key="window"
              config={config}
              chat={chat}
              isExpanded={isExpanded}
              onToggleExpand={() => setExpanded((v) => !v)}
              onClose={close}
            />
          )}
        </AnimatePresence>

        <ChatLauncher
          isOpen={isOpen}
          hasUnread={hasUnread}
          showTeaser={!isOpen && chat.status === 'welcome' && hasUnread}
          onClick={isOpen ? close : open}
          onDismissTeaser={() => setUnread(false)}
        />
      </div>
    </MotionConfig>
  );
}
