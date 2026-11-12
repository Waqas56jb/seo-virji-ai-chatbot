/**
 * Vercel serverless entry point. Every request is rewritten here (see vercel.json) and handled
 * by the same Express app used locally — no routes differ between environments.
 * Background work uses waitUntil (src/utils/background.js); scheduled work uses Vercel Cron.
 */
import { createApp } from '../src/app.js';

const app = createApp();
export default app;
