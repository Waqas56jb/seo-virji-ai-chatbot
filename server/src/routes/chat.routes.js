import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { chatLimiter, startLimiter } from '../middleware/rate-limit.middleware.js';
import * as v from '../validators/chat.validator.js';
import * as c from '../controllers/chat.controller.js';

/** Public chatbot API — a visitor can only reach their own conversation (uuid + visitorId + session token). */
const r = Router();
r.get('/config', h(c.config));
r.post('/start', startLimiter, validate({ body: v.startChat }), h(c.start));
r.post('/message', chatLimiter, validate({ body: v.sendMessage }), h(c.message));
r.get('/:conversationId', chatLimiter, validate({ params: v.conversationParams, query: v.visitorQuery }), h(c.get));
r.post('/:conversationId/end', chatLimiter, validate({ params: v.conversationParams, body: v.visitorBody }), h(c.end));
r.post('/:conversationId/reset', startLimiter, validate({ params: v.conversationParams, body: v.visitorBody }), h(c.reset));
r.post('/:conversationId/handoff', chatLimiter, validate({ params: v.conversationParams, body: v.handoff }), h(c.handoff));
r.post('/:conversationId/handoff/:handoffId/opened', chatLimiter, validate({ params: v.handoffParams, body: v.visitorBody }), h(c.handoffOpened));
r.post('/:conversationId/feedback', chatLimiter, validate({ params: v.conversationParams, body: v.feedback }), h(c.feedback));
export default r;
