import cors from 'cors';
import { env } from './env.js';

/** Allowlist CORS. Requests without an Origin header (curl, server-to-server) are allowed. */
export const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    return cb(null, env.allowedOrigins.includes(origin.replace(/\/$/, '')));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Chat-Session', 'X-Request-Id'],
  maxAge: 600,
});
