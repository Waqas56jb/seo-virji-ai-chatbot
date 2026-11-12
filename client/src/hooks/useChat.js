import { useCallback, useEffect, useRef, useState } from 'react';
import { isSessionError, markHandoffOpened, requestHandoff, resetConversation, sendMessage, startConversation } from '../services/chatService.js';
import { getVisitorId, loadLocal, saveLocal } from '../services/storage.js';
import { createId } from '../utils/id.js';

/**
 * Conversation state for one bot, backed by the SEO Virji API.
 * Messages live in Supabase; the browser only keeps the visitor id and the session token
 * so a returning visitor can resume their conversation.
 */
export function useChat(botId) {
  const sessionKey = `session:${botId}`;
  const visitorId = useRef(null);
  if (!visitorId.current) visitorId.current = getVisitorId();

  const [state, setState] = useState({ status: 'welcome', conversationId: null, sessionToken: null, messages: [], lead: {} });
  const [isTyping, setTyping] = useState(false);
  const [isStarting, setStarting] = useState(false);
  const [isRestoring, setRestoring] = useState(() => Boolean(loadLocal(sessionKey)?.conversationId));
  const [error, setError] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);

  const applyConversation = useCallback(
    (data) => {
      saveLocal(sessionKey, { conversationId: data.conversationId, sessionToken: data.sessionToken });
      setState({ status: 'active', conversationId: data.conversationId, sessionToken: data.sessionToken, messages: data.messages || [], lead: data.lead || {} });
    },
    [sessionKey],
  );

  const forget = useCallback(() => {
    saveLocal(sessionKey, null);
    setState({ status: 'welcome', conversationId: null, sessionToken: null, messages: [], lead: {} });
  }, [sessionKey]);

  // Resume a previous conversation on load (never creates a new one by itself).
  useEffect(() => {
    const saved = loadLocal(sessionKey);
    if (!saved?.conversationId || !saved?.sessionToken) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    startConversation({ visitorId: visitorId.current, resume: saved, resumeOnly: true })
      .then((data) => {
        if (cancelled) return;
        if (data.resumed) applyConversation(data);
        else saveLocal(sessionKey, null);
      })
      .catch(() => {
        /* offline or server down: stay on the welcome screen */
      })
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, [sessionKey, applyConversation]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      applyConversation(await startConversation({ visitorId: visitorId.current, pageUrl: window.location.href.split('#')[0] }));
    } catch (err) {
      setError({ type: 'start', message: err.message });
    } finally {
      setStarting(false);
    }
  }, [applyConversation]);

  const deliver = useCallback(
    async (text, clientMessageId) => {
      const { conversationId, sessionToken } = stateRef.current;
      inFlight.current = true;
      setTyping(true);
      setError(null);
      try {
        const data = await sendMessage({ conversationId, visitorId: visitorId.current, sessionToken, text, clientMessageId });
        setState((s) => ({
          ...s,
          lead: data.lead || s.lead,
          messages: [...s.messages.map((m) => (m.id === clientMessageId ? { ...m, failed: false } : m)), data.message],
        }));
      } catch (err) {
        setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === clientMessageId ? { ...m, failed: true } : m)) }));
        setError({ type: isSessionError(err) ? 'session' : 'send', message: err.message, text, messageId: clientMessageId });
      } finally {
        inFlight.current = false;
        setTyping(false);
      }
    },
    [],
  );

  const send = useCallback(
    (raw) => {
      const text = String(raw || '').trim();
      if (!text || inFlight.current || stateRef.current.status !== 'active') return false;
      const id = createId('m');
      setState((s) => ({ ...s, messages: [...s.messages, { id, role: 'user', content: text, createdAt: new Date().toISOString() }] }));
      deliver(text, id);
      return true;
    },
    [deliver],
  );

  /** Retries the failed message with the same id — the server de-duplicates it. */
  const retry = useCallback(() => {
    if (!error) return;
    if (error.type === 'start') start();
    else if (error.type === 'session') {
      forget();
      start();
    } else deliver(error.text, error.messageId);
  }, [error, start, deliver, forget]);

  const reset = useCallback(async () => {
    const { conversationId, sessionToken } = stateRef.current;
    setError(null);
    setTyping(false);
    if (!conversationId) return forget();
    setStarting(true);
    try {
      applyConversation(await resetConversation({ conversationId, visitorId: visitorId.current, sessionToken }));
    } catch {
      forget();
    } finally {
      setStarting(false);
    }
    return undefined;
  }, [applyConversation, forget]);

  /** Records the handoff on the server and returns { url, message }. */
  const handoff = useCallback(async (name) => {
    const { conversationId, sessionToken } = stateRef.current;
    const data = await requestHandoff({ conversationId, visitorId: visitorId.current, sessionToken, name });
    if (name) setState((s) => ({ ...s, lead: { ...s.lead, name } }));
    return {
      ...data,
      markOpened: () => data.handoffId && markHandoffOpened({ conversationId, visitorId: visitorId.current, sessionToken, handoffId: data.handoffId }),
    };
  }, []);

  return {
    ...state,
    isTyping,
    isStarting,
    isRestoring,
    error,
    start,
    send,
    retry,
    reset,
    handoff,
    dismissError: () => setError(null),
  };
}
