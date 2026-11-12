import { Router } from 'express';
import { asyncHandler as h } from '../utils/response.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAdmin, requireEditor } from '../middleware/admin-auth.middleware.js';
import * as v from '../validators/settings.validator.js';
import * as c from '../controllers/settings.controller.js';

const r = Router();
r.use(requireAdmin);
r.get('/', h(c.get));
r.patch('/', requireEditor, validate({ body: v.fullSettings }), h(c.update));
r.patch('/personality', requireEditor, validate({ body: v.personality }), h(c.updatePersonality));
r.patch('/whatsapp', requireEditor, validate({ body: v.whatsapp }), h(c.updateWhatsapp));
r.patch('/appearance', requireEditor, validate({ body: v.appearance }), h(c.updateAppearance));
export default r;
