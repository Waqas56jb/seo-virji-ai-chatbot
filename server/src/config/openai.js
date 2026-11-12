import OpenAI from 'openai';
import { env } from './env.js';

/** Single shared client; null when OPENAI_API_KEY is not configured. */
export const openai = env.openaiConfigured
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.OPENAI_TIMEOUT_MS, maxRetries: env.OPENAI_MAX_RETRIES })
  : null;
