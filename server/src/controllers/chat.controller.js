import { ok } from '../utils/response.js';
import { publicConfig } from '../services/settings.service.js';
import {
  addFeedback,
  assertChatbotEnabled,
  authorizeConversation,
  endConversation,
  getConversationForVisitor,
  handleMessage,
  startOrResume,
} from '../services/ai/conversation.service.js';
import { createHandoff, markHandoffOpened } from '../services/whatsapp/handoff.service.js';

const session = (req) => req.get('X-Chat-Session');

export const config = async (req, res) => ok(res, await publicConfig());

export const start = async (req, res) => {
  const { visitorId, resume, resumeOnly, source, pageUrl } = req.body;
  await assertChatbotEnabled();
  ok(res, { ...(await startOrResume({ visitorId, resume, resumeOnly, source, websiteUrl: pageUrl })), config: await publicConfig() }, 'Conversation ready');
};

export const message = async (req, res) => {
  const { conversationId, visitorId, message: text, clientMessageId } = req.body;
  const conv = await authorizeConversation(conversationId, visitorId, session(req));
  const result = await handleMessage({ conv, text, clientMessageId });
  ok(res, { conversationId, ...result });
};

export const get = async (req, res) => {
  ok(res, await getConversationForVisitor(req.params.conversationId, req.validatedQuery.visitorId, session(req)));
};

export const end = async (req, res) => {
  const conv = await authorizeConversation(req.params.conversationId, req.body.visitorId, session(req));
  await endConversation(conv);
  ok(res, { conversationId: conv.conversation_uuid, status: 'completed' }, 'Conversation ended');
};

/** Closes the current conversation and starts a fresh one for the same visitor. */
export const reset = async (req, res) => {
  const conv = await authorizeConversation(req.params.conversationId, req.body.visitorId, session(req));
  await endConversation(conv);
  ok(res, { ...(await startOrResume({ visitorId: req.body.visitorId, source: conv.source })), config: await publicConfig() }, 'New conversation started');
};

export const handoff = async (req, res) => {
  const conv = await authorizeConversation(req.params.conversationId, req.body.visitorId, session(req));
  ok(res, await createHandoff(conv, { name: req.body.name }), 'WhatsApp link generated');
};

/** The visitor's browser opened WhatsApp. (Whether they then pressed Send cannot be known without the WhatsApp Business API.) */
export const handoffOpened = async (req, res) => {
  const conv = await authorizeConversation(req.params.conversationId, req.body.visitorId, session(req));
  ok(res, await markHandoffOpened(conv, req.params.handoffId), 'Recorded');
};

export const feedback = async (req, res) => {
  const conv = await authorizeConversation(req.params.conversationId, req.body.visitorId, session(req));
  await addFeedback(conv, req.body);
  ok(res, {}, 'Thanks for your feedback');
};
