import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAdmin, requireEditor } from '../middleware/admin-auth.middleware.js';
import * as v from '../validators/knowledge.validator.js';
import * as c from '../controllers/crawler.controller.js';

const r = Router();
r.use(requireAdmin);
r.post('/start', requireEditor, validate({ body: v.crawlStart }), h(c.start)); // incremental (default), or { mode }, or { url, singlePage }
r.post('/recrawl', requireEditor, h(c.recrawl)); // full re-crawl
r.post('/retry-failed', requireEditor, h(c.retryFailed));
r.get('/status', h(c.status));
r.get('/jobs', h(c.jobs));
r.get('/jobs/:id', validate({ params: v.idParam }), h(c.job));
r.post('/cancel/:id', requireEditor, validate({ params: v.idParam }), h(c.cancel));
export default r;
