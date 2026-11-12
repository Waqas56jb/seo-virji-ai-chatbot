import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAdmin, requireEditor } from '../middleware/admin-auth.middleware.js';
import * as v from '../validators/leads.validator.js';
import * as c from '../controllers/conversation.controller.js';

const r = Router();
r.use(requireAdmin);
r.get('/', validate({ query: v.listConversations }), h(c.list));
r.get('/stats', h(c.stats));
r.get('/export', validate({ query: v.exportConversations }), h(c.exportCsv));
r.get('/:id', validate({ params: v.uuidParam }), h(c.get));
r.get('/:id/messages', validate({ params: v.uuidParam }), h(c.messages));
r.patch('/:id/status', requireEditor, validate({ params: v.uuidParam, body: v.conversationStatus }), h(c.setStatus));
r.delete('/:id', requireEditor, validate({ params: v.uuidParam }), h(c.remove));
export default r;
