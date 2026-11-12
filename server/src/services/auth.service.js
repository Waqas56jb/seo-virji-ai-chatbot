/**
 * Admin authentication.
 *  - Passwords: bcrypt (cost 12). No default accounts — provision with `npm run admin:create`.
 *  - Access token: short-lived HS256 JWT (ADMIN_JWT_EXPIRES_IN, default 15m), sent as Bearer.
 *  - Refresh token: random 256-bit value in an HttpOnly cookie; only its SHA-256 is stored;
 *    rotated on every refresh and revocable on logout.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one, query } from '../config/supabase.js';
import { unauthorized } from '../utils/errors.js';
import { randomToken, sha256 } from '../utils/text-utils.js';

export const REFRESH_COOKIE = 'sv_admin_rt';
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const publicAdmin = (a) => ({ id: a.id, email: a.email, fullName: a.full_name, role: a.role, lastLoginAt: a.last_login_at });

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/admin/auth',
    maxAge: env.ADMIN_REFRESH_EXPIRES_DAYS * 86_400_000,
  };
}

async function issueTokens(admin) {
  const accessToken = jwt.sign({ sub: admin.id, role: admin.role }, env.ADMIN_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ADMIN_JWT_EXPIRES_IN,
    audience: 'seo-virji-admin',
  });
  const refreshToken = randomToken(32);
  await query(
    `insert into public.seo_virji_admin_refresh_tokens (admin_user_id, token_hash, expires_at) values ($1,$2, now() + make_interval(days => $3))`,
    [admin.id, sha256(refreshToken), env.ADMIN_REFRESH_EXPIRES_DAYS],
  );
  return { accessToken, refreshToken, expiresIn: env.ADMIN_JWT_EXPIRES_IN };
}

export async function login(email, password) {
  const admin = await one('select * from public.seo_virji_admin_users where lower(email) = lower($1)', [email]);
  // Always run bcrypt so response time does not reveal whether the email exists.
  const valid = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH);
  if (!admin || !valid || !admin.is_active) throw unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
  await query('update public.seo_virji_admin_users set last_login_at = now() where id = $1', [admin.id]);
  return { admin: publicAdmin(admin), ...(await issueTokens(admin)) };
}

export async function refresh(refreshToken) {
  if (!refreshToken) throw unauthorized('Session expired', 'REFRESH_INVALID');
  // Atomically revoke the presented token (rotation) and load its active owner.
  const admin = await one(
    `with revoked as (
       update public.seo_virji_admin_refresh_tokens set revoked_at = now()
       where token_hash = $1 and revoked_at is null and expires_at > now()
       returning admin_user_id)
     select a.* from revoked r join public.seo_virji_admin_users a on a.id = r.admin_user_id where a.is_active`,
    [sha256(refreshToken)],
  );
  if (!admin) throw unauthorized('Session expired', 'REFRESH_INVALID');
  return { admin: publicAdmin(admin), ...(await issueTokens(admin)) };
}

export async function logout(refreshToken) {
  if (refreshToken) await query('update public.seo_virji_admin_refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [sha256(refreshToken)]);
}

export async function createAdmin({ email, password, fullName = '', role = 'owner' }) {
  const hash = await hashPassword(password);
  return one(
    `insert into public.seo_virji_admin_users (email, password_hash, full_name, role) values (lower($1),$2,$3,$4)
     returning id, email, full_name, role`,
    [email, hash, fullName, role],
  );
}
