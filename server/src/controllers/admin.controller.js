import { ok } from '../utils/response.js';
import { unauthorized } from '../utils/errors.js';
import { cookieOptions, login as doLogin, logout as doLogout, publicAdmin, refresh as doRefresh, REFRESH_COOKIE } from '../services/auth.service.js';
import { audit } from '../services/admin.service.js';

const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, cookieOptions());

export const login = async (req, res) => {
  const result = await doLogin(req.body.email, req.body.password);
  setRefreshCookie(res, result.refreshToken);
  await audit(result.admin.id, 'auth.login', 'admin_user', result.admin.id);
  ok(res, { accessToken: result.accessToken, expiresIn: result.expiresIn, admin: result.admin }, 'Signed in');
};

export const refresh = async (req, res) => {
  try {
    const result = await doRefresh(req.cookies?.[REFRESH_COOKIE]);
    setRefreshCookie(res, result.refreshToken);
    ok(res, { accessToken: result.accessToken, expiresIn: result.expiresIn, admin: result.admin });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw err;
  }
};

export const logout = async (req, res) => {
  await doLogout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  ok(res, {}, 'Signed out');
};

export const me = async (req, res) => {
  if (!req.admin) throw unauthorized();
  ok(res, { admin: publicAdmin(req.admin) });
};
