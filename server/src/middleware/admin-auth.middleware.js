import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one } from '../config/supabase.js';
import { forbidden, unauthorized } from '../utils/errors.js';

/**
 * Requires a valid admin access token (Authorization: Bearer <jwt>).
 * Identity and role are re-read from the database — never trusted from the browser.
 */
export async function requireAdmin(req, res, next) {
  try {
    const header = req.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.ADMIN_JWT_SECRET, { algorithms: ['HS256'], audience: 'seo-virji-admin' });
    } catch (err) {
      throw unauthorized(err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid session', err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED');
    }

    const admin = await one(
      'select id, email, full_name, role, is_active from public.seo_virji_admin_users where id = $1',
      [payload.sub],
    );
    if (!admin || !admin.is_active) throw unauthorized('Account is not active');
    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/** Blocks read-only accounts from mutating data. */
export function requireEditor(req, res, next) {
  if (req.admin?.role === 'viewer') return next(forbidden('Your account is read-only.'));
  return next();
}
