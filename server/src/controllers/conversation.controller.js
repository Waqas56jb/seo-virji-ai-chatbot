import { ok } from '../utils/response.js';
import { sendCsv } from '../utils/csv.js';
import {
  audit,
  conversationCounts,
  deleteConversation,
  exportConversations,
  getConversationDetail,
  listConversations,
  setConversationStatus,
} from '../services/admin.service.js';

export const list = async (req, res) => ok(res, { ...(await listConversations(req.validatedQuery)), counts: await conversationCounts() });
export const stats = async (req, res) => ok(res, await conversationCounts());
export const get = async (req, res) => ok(res, await getConversationDetail(req.params.id));
export const messages = async (req, res) => ok(res, { messages: (await getConversationDetail(req.params.id)).conversation.messages });

export const setStatus = async (req, res) => {
  const result = await setConversationStatus(req.params.id, req.body.status);
  await audit(req.admin.id, 'conversation.status', 'conversation', req.params.id, { status: req.body.status });
  const label = { resolved: 'Conversation marked as resolved', active: 'Conversation reopened', archived: 'Conversation archived' }[req.body.status];
  ok(res, result, label);
};

export const remove = async (req, res) => {
  await deleteConversation(req.params.id);
  await audit(req.admin.id, 'conversation.delete', 'conversation', req.params.id);
  ok(res, {}, 'Conversation deleted');
};

export const exportCsv = async (req, res) => {
  const rows = await exportConversations(req.validatedQuery);
  await audit(req.admin.id, 'conversation.export', 'conversation', null, { rows: rows.length, include: req.validatedQuery.include });
  const date = new Date().toISOString().slice(0, 10);
  sendCsv(res, `seo-virji-conversations-${req.validatedQuery.include}-${date}.csv`, rows);
};
