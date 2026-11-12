import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { loginLimiter, refreshLimiter } from '../middleware/rate-limit.middleware.js';
import { requireAdmin } from '../middleware/admin-auth.middleware.js';
import * as c from '../controllers/admin.controller.js';

const loginBody = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

const r = Router();
r.post('/auth/login', loginLimiter, validate({ body: loginBody }), h(c.login));
r.post('/auth/refresh', refreshLimiter, h(c.refresh));
r.post('/auth/logout', h(c.logout));
r.get('/auth/me', requireAdmin, h(c.me));
export default r;
