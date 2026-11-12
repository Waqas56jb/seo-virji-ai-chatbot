import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAdmin, requireEditor } from '../middleware/admin-auth.middleware.js';
import * as v from '../validators/leads.validator.js';
import * as c from '../controllers/leads.controller.js';

const r = Router();
r.use(requireAdmin);
r.get('/', validate({ query: v.listLeads }), h(c.list));
r.get('/stats', h(c.stats));
r.get('/export', validate({ query: v.exportLeads }), h(c.exportCsv));
r.post('/', requireEditor, validate({ body: v.createLead }), h(c.create));
r.get('/:id', validate({ params: v.uuidParam }), h(c.get));
r.patch('/:id', requireEditor, validate({ params: v.uuidParam, body: v.updateLead }), h(c.update));
r.delete('/:id', requireEditor, validate({ params: v.uuidParam }), h(c.remove));
export default r;
