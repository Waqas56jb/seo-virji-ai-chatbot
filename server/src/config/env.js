/**
 * Environment configuration with startup validation.
 * Missing/invalid values are reported by NAME only — secret values are never printed.
 */
import 'dotenv/config';
import { z } from 'zod';

const bool = (d) => z.enum(['true', 'false']).default(d).transform((v) => v === 'true');
const int = (d) => z.coerce.number().int().default(d);
const num = (d) => z.coerce.number().default(d);

const schema = z.object({
  PORT: int(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5174'),
  ALLOWED_ORIGINS: z.string().default(''),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith('postgres'),
  DATABASE_POOL_MAX: int(8),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: int(1536),
  OPENAI_TEMPERATURE: num(0.6),
  OPENAI_MAX_OUTPUT_TOKENS: int(700),
  OPENAI_TIMEOUT_MS: int(30000),
  OPENAI_MAX_RETRIES: int(2),
  // Optional pricing (USD per 1M tokens) for cost estimates. Empty → cost is not estimated.
  OPENAI_PRICE_INPUT_PER_1M: z.string().default(''),
  OPENAI_PRICE_OUTPUT_PER_1M: z.string().default(''),
  OPENAI_PRICE_EMBEDDING_PER_1M: z.string().default(''),

  SEO_VIRJI_WEBSITE_URL: z.string().url().default('https://seovirji.com/'),
  SEO_VIRJI_BUSINESS_NAME: z.string().default('SEO Virji'),
  SEO_VIRJI_WHATSAPP_NUMBER: z.string().default(''),

  ADMIN_JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('15m'),
  ADMIN_REFRESH_EXPIRES_DAYS: int(7),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  CRAWLER_MAX_PAGES: int(60),
  CRAWLER_MAX_DEPTH: int(3),
  CRAWLER_REQUEST_DELAY_MS: int(800),
  CRAWLER_TIMEOUT_MS: int(15000),
  CRAWLER_MAX_BYTES: int(3_000_000),
  CRAWLER_ALLOWED_HOSTS: z.string().default(''),
  CRAWLER_SCHEDULE: z.string().default('0 3 * * *'),
  CRAWLER_SCHEDULE_ENABLED: bool('true'),
  // Serverless: how long one function invocation may advance a sync before handing over.
  CRAWLER_STEP_BUDGET_MS: int(240_000),
  // Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`.
  CRON_SECRET: z.string().default(''),
  RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('postgres'),

  CHAT_MEMORY_LIMIT: int(20),
  CHAT_SESSION_DAYS: int(30),
  RAG_TOP_K: int(6),
  RAG_SIMILARITY_THRESHOLD: num(0.3),
  MAX_MESSAGE_LENGTH: int(1000),
  RATE_LIMIT_WINDOW_MS: int(60000),
  RATE_LIMIT_MAX_REQUESTS: int(30),
  DATA_RETENTION_DAYS: int(0), // 0 = keep forever
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Names only — never values.
  console.error(`\n[config] Invalid or missing environment variables:\n${problems}\n\nSee server/.env.example.\n`);
  process.exit(1);
}

const e = parsed.data;
const hostOf = (u) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const websiteHost = hostOf(e.SEO_VIRJI_WEBSITE_URL);
const altHost = websiteHost.startsWith('www.') ? websiteHost.slice(4) : `www.${websiteHost}`;

export const env = {
  ...e,
  isProduction: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  openaiConfigured: Boolean(e.OPENAI_API_KEY),
  allowedOrigins: [e.CLIENT_URL, e.ADMIN_URL, ...e.ALLOWED_ORIGINS.split(',')]
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  crawlerAllowedHosts: Array.from(
    new Set([websiteHost, altHost, ...e.CRAWLER_ALLOWED_HOSTS.split(',')].map((s) => s.trim().toLowerCase()).filter(Boolean)),
  ),
  pricing: {
    input: e.OPENAI_PRICE_INPUT_PER_1M ? Number(e.OPENAI_PRICE_INPUT_PER_1M) : null,
    output: e.OPENAI_PRICE_OUTPUT_PER_1M ? Number(e.OPENAI_PRICE_OUTPUT_PER_1M) : null,
    embedding: e.OPENAI_PRICE_EMBEDDING_PER_1M ? Number(e.OPENAI_PRICE_EMBEDDING_PER_1M) : null,
  },
};
