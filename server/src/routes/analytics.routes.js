import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { requireAdmin } from '../middleware/admin-auth.middleware.js';
import * as c from '../controllers/analytics.controller.js';

const r = Router();
r.use(requireAdmin);
r.get('/overview', h(c.overview));
r.get('/conversations', h(c.conversations));
r.get('/leads', h(c.leads));
r.get('/handoffs', h(c.handoffs));
r.get('/usage', h(c.usage));
export default r;
