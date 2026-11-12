# SEO Virji — AI Chatbot API

Node.js + Express backend for the SEO Virji AI business consultant: OpenAI chat with RAG over SEO Virji's own knowledge, conversational memory, lead qualification, WhatsApp handoff, website crawling, and the admin API. Data lives in Supabase (PostgreSQL + pgvector).

---

## 1. Architecture

```
 Visitor ──► client/ (React widget, Shadow DOM) ─┐
                                                 ├──► server/ (Express, this folder) ──► OpenAI (chat + embeddings)
 Owner   ──► admin/  (React control panel) ──────┘          │
                                                            └──► Supabase Postgres (pgvector, RLS on, no public access)
 seovirji.com ◄── crawler (robots.txt → sitemap → links → Cheerio → chunks → embeddings)
```

Only the server holds credentials. The browser apps call `/api/*` and never talk to OpenAI or Supabase directly.

**Message pipeline** (`services/ai/conversation.service.js`):

1. Check the session: conversation id, visitor id and session token must all match.
2. Save the visitor message. It's idempotent on `clientMessageId`, so retries never duplicate it.
3. Load the **last 20 messages**, the persistent memory (facts and summary), and the settings.
4. **Hybrid retrieval:** pgvector semantic search, plus Postgres full-text search, plus FAQ and owner-content priority.
5. Build the system prompt (`prompt-builder.service.js`). Retrieved text is wrapped as *untrusted data*.
6. Call OpenAI with a **strict JSON schema**. The response contains the reply, suggested replies, cited sources, the WhatsApp offer, lead facts and the interest level.
7. A **grounding guard** drops any "fact" the visitor never actually typed, such as a business name inferred from a domain.
8. Save the reply and usage. Update the facts and the lead. The summary refreshes in the background.

**Folders**

| Path | Contents |
| --- | --- |
| `src/config` | Env validation, pg pool + Supabase admin client, OpenAI client, CORS |
| `src/routes`, `src/controllers` | HTTP layer (one module per area) |
| `src/services/ai` | OpenAI wrapper, embeddings, RAG, prompt builder, personality, memory, conversation orchestration |
| `src/services/crawler` | Safe fetching, robots/sitemaps, extraction, cleaning, chunking, dedup, job runner |
| `src/services/knowledge` | Knowledge CRUD, indexing (chunk + embed), hybrid search |
| `src/services/leads`, `src/services/whatsapp` | Lead scoring/persistence, wa.me handoff |
| `src/middleware`, `src/validators` | Auth, rate limits, request ids, errors, Zod schemas |
| `src/jobs` | Daily re-crawl, hourly cleanup |
| `supabase/migrations`, `supabase/seed` | SQL schema (applied by `npm run db:migrate`) |
| `scripts` | migrate, verify, crawl, embeddings, admin provisioning, connection checks, lint |

## 2. Technology

Node ≥ 18.17 (ES modules) · Express 4 · OpenAI SDK · `pg` + `@supabase/supabase-js` · pgvector (HNSW) · Cheerio (+ optional Playwright for JS-rendered pages) · Zod · Helmet · express-rate-limit · bcryptjs + jsonwebtoken · node-cron · Vitest + Supertest.

## 3. Environment setup

```bash
cd server
npm install
cp .env.example .env      # then fill in the values
```

All variables are documented in [`.env.example`](.env.example). The server validates them at startup. A missing or invalid variable is reported **by name only**, never by value. `OPENAI_API_KEY` may be empty: the API still runs, but chat replies return a friendly "not configured" error and new content is stored without embeddings. Keyword search still works.

## 4. Supabase setup

1. In Supabase → **Project Settings → API**, copy the Project URL, the `anon` key and the `service_role` key.
2. In **Project Settings → Database → Connection string**, copy the **Session pooler** URI into `DATABASE_URL`, and URL-encode the password.
3. You don't need to enable anything by hand: the migration enables `vector` and `pgcrypto` itself.

> This project shares its Supabase database with other applications, so **every table, index and function is prefixed `seo_virji_`**. Nothing outside that prefix is touched.

## 5. Database migrations

```bash
npm run db:migrate   # applies supabase/migrations/*.sql once each, then idempotent seeds
npm run db:verify    # checks every table/column, pgvector, vector dimension, functions, indexes, RLS, grants
```

Tables:
- `admin_users`, `admin_refresh_tokens`
- `chatbot_settings`
- `conversations`, `messages`, `conversation_memories`
- `knowledge_sources`, `knowledge_chunks`, `faqs`
- `leads`
- `website_crawl_jobs`, `website_crawl_pages`
- `whatsapp_handoffs`
- `feedback`, `usage_logs`, `audit_logs`

All tables are prefixed `seo_virji_`. **RLS is enabled on every table and `anon`/`authenticated` have no grants**, so the public anon key can't read anything. Only this server, connected as the database owner, can.

## 6. pgvector

- `knowledge_chunks.embedding` is `vector(OPENAI_EMBEDDING_DIMENSIONS)`. That's 1536 for `text-embedding-3-small`, and the migration substitutes the value automatically.
- The index is HNSW with `vector_cosine_ops`.
- `seo_virji_match_chunks(embedding, top_k, min_similarity)` handles semantic search. It returns only active sources and only results above the threshold.
- `seo_virji_keyword_chunks(text, top_k)` handles full-text search (GIN index). It's also the fallback before embeddings exist.

**Changing the embedding model or dimensions:** create a new migration that alters the column and recreates the function. Then run `npm run embeddings:rebuild -- --full`.

## 7. OpenAI

The model names, temperature, output tokens, timeout and retries all come from env. Provider failures (invalid key, quota, rate limit, outage, context length, malformed output) are mapped to safe `503` errors with codes like `AI_RATE_LIMITED`. The visitor sees a friendly message, and **no reply is ever fabricated**. Details go to the server log only.

## 8. Website crawling

```bash
npm run crawl                                               # incremental sync of SEO_VIRJI_WEBSITE_URL, prints a per-URL report
npm run crawl -- --full                                     # full re-crawl (re-index every page, deactivate pages that disappeared)
npm run crawl -- --retry                                    # retry only the URLs that failed in the last sync
npm run crawl -- --url https://seovirji.com/page/ --single  # one page
```

In the admin, go to **Knowledge Base → Website Sync**. It has four actions:

| Action | What it does |
| --- | --- |
| **Sync Website Now** | Incremental sync |
| **Full Re-Crawl** | Re-indexes every page |
| **Retry Failed Pages** | Re-tries only the pages that failed last time |
| **View Crawl Logs** | Shows every URL with its status and reason |

The page also shows progress, discovered/processed/skipped/failed counts, the failed URLs, the last successful sync and the next scheduled one.

**How a sync runs.** A sync is a resumable state machine stored in Supabase, so it works on serverless hosts:
- **Phases:** `seo_virji_website_crawl_jobs` records the phase (`discover → fetch → index → finalize → done`), a worker lease and a heartbeat.
- **Page frontier:** `seo_virji_website_crawl_pages` holds every discovered URL (`pending → fetched → new/updated/unchanged`, or `skipped`/`failed` with a reason).
- **Who advances it:** any process can call `advanceJob(id, { budgetMs })` to push it forward for a limited time. That includes:
  - the local server
  - the CLI
  - a Vercel function via `waitUntil`
  - Vercel Cron
  - the admin's status polling
- **Locking:** only the lease holder does work. A crashed worker's lease simply expires and the next caller continues.

**Status on seovirji.com (verified on 2026-11-11):**
- **Found:** robots.txt + sitemap + the WordPress REST API list 10 URLs.
- **Indexed (4 content pages):** the home page and 3 blog posts.
- **Skipped (6), with a reason each:**
  - 4 private or transactional pages: cart, checkout, my-account and the affiliate dashboard
  - the category listing (used only to discover articles)
  - `/shop/`, which has no content

What the crawler does:
- **Discovery:**
  - robots.txt (respected)
  - sitemaps and sitemap indexes
  - the WordPress REST API (published pages and posts)
  - internal links (recursive), plus pagination (`rel=next/prev`, page-number links)
  - all within `CRAWLER_MAX_PAGES` and `CRAWLER_MAX_DEPTH`
- **Normalisation:**
  - URLs are normalised and tracking parameters stripped.
  - Canonical URLs are respected.
  - Redirects to an already-crawled URL and pages with identical content are recorded as duplicates.
- **Skipped pages (always logged with the reason):**
  - private or transactional pages (account, cart, checkout, affiliate)
  - WordPress system URLs, feeds and files
  - `noindex` pages
  - listing pages (category/tag archives, `/page/N/`), which are crawled only to discover articles
- **Extracted metadata:** title, description, headings, category, article dates and JSON-LD FAQs. Contact details published on the site (mailto/tel/WhatsApp links) are added once, to the home page document.
- **Admin edits win:** if the owner edits a crawled page in the admin, later syncs keep the edit and flag "website changed since your edit". A re-crawl with "discard edits" restores the website text.
- **Safety:**
  - http/https only, allowlisted hosts, no credentials or odd ports
  - DNS resolution is checked against private, loopback, link-local and metadata ranges, and **every redirect hop is re-validated**
  - timeouts, a response-size cap, content-type checks, limited retries and a polite delay
- **Extraction:** Cheerio removes navigation, header and footer templates, scripts, forms and cookie banners, keeps headings for context, and reads JSON-LD FAQs. Lines repeated across most pages are removed as boilerplate.
- **Change detection:** a content hash per page. Unchanged pages are skipped; changed pages are re-chunked, and only *new* chunks are embedded.
- **Removed pages:** deactivated only after a healthy full crawl. **A failed crawl never deletes existing knowledge.**
- **Concurrency:** only one crawl runs per site, enforced by a DB unique index. A job with no progress for 2 hours is marked failed.
- **Schedule:** a daily incremental re-sync.
  - Vercel: Vercel Cron calls `GET /api/cron/sync` at `0 3 * * *` UTC (see `vercel.json`), authenticated with `CRON_SECRET`.
  - Node server: node-cron uses `CRAWLER_SCHEDULE`.

## 9. Embeddings

- Knowledge is embedded automatically whenever it is created or changed.
- `npm run embeddings:rebuild` embeds every chunk that has no vector yet. Use it after adding a key or after failures.
- `npm run embeddings:rebuild -- --full` re-chunks and re-embeds everything.
- Owner-written knowledge (business sections, extra documents, FAQs) gets a ranking boost over website text.

## 10. Running

```bash
npm run dev      # watch mode
npm start        # production
npm run health   # real checks: DB, tables, pgvector, vector search, OpenAI auth + embeddings + chat, website reachability
```

The frontends' Vite dev servers proxy `/api` to `http://localhost:4100` (change it with `VITE_API_PROXY_TARGET`).

## 11. API reference

Every response uses one shape: `{ "success": true, "data": {…}, "message": "…" }`. Errors look like `{ "success": false, "error": { "code", "message", "details?", "requestId" } }`.

### Public chatbot (rate-limited)

Conversation calls require the `X-Chat-Session: <sessionToken>` header **and** the matching `visitorId`.

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET /api/health` | — | status, database, openai configured, models, version, uptime |
| `GET /api/chat/config` | — | public widget settings (name, colours, welcome, WhatsApp label…) |
| `POST /api/chat/start` | `{ visitorId, resume?: { conversationId, sessionToken }, resumeOnly?, pageUrl? }` | `{ conversationId, sessionToken, resumed, messages[], lead, config }` |
| `POST /api/chat/message` | `{ conversationId, visitorId, message, clientMessageId? }` | `{ message, suggestedReplies[], sources[], leadStatus, lead }` |
| `GET /api/chat/:conversationId?visitorId=` | — | `{ messages[], status, lead }` |
| `POST /api/chat/:id/end` | `{ visitorId }` | marks completed |
| `POST /api/chat/:id/reset` | `{ visitorId }` | closes it and returns a fresh conversation (same shape as start) |
| `POST /api/chat/:id/handoff` | `{ visitorId, name? }` | `{ handoffId, url, message }`, the wa.me link (recorded before redirect) |
| `POST /api/chat/:id/handoff/:handoffId/opened` | `{ visitorId }` | marks the handoff `opened` (the browser opened WhatsApp; sending is not verifiable) |
| `POST /api/chat/:id/feedback` | `{ visitorId, messageId?, rating: 1 \| -1, text? }` | — |

Example:

```http
POST /api/chat/message
X-Chat-Session: 0vVWFgkW4_bS…
{ "conversationId": "3e74623f-…", "visitorId": "v_1f2e…", "message": "Do you work with my competitors?", "clientMessageId": "m_abc123" }
```
```json
{ "success": true, "data": {
  "conversationId": "3e74623f-…",
  "message": { "id": "…", "role": "assistant", "content": "No — SEO Virji works with one business per niche worldwide…",
               "quickReplies": ["How does pricing work?"], "sources": [{ "title": "Seovirji", "url": "https://seovirji.com/" }] },
  "suggestedReplies": ["How does pricing work?"], "sources": [ … ], "leadStatus": "interested", "lead": { "industry": "dental clinic" } } }
```

### Admin (all require `Authorization: Bearer <accessToken>`)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/admin/auth/login` `{email,password}` → `{accessToken, admin}` and sets the HttpOnly refresh cookie · `POST /api/admin/auth/refresh` (cookie) · `POST /api/admin/auth/logout` · `GET /api/admin/auth/me` |
| Conversations | `GET /api/conversations?status=all\|new\|qualified\|handoff\|active\|resolved&search=&from=YYYY-MM-DD&to=&page=&pageSize=` (search also matches the chat reference) · `GET /api/conversations/stats` · `GET /api/conversations/export?…&include=summary\|messages` (CSV) · `GET /api/conversations/:id` (messages with sources, summary, facts, handoffs, lead) · `PATCH /api/conversations/:id/status` `{status: resolved\|active\|archived}` · `DELETE /api/conversations/:id` (messages/memory/handoffs cascade; the lead is kept, unlinked) |
| Leads | `GET /api/leads?status=new\|contacted\|interested\|qualified\|converted\|not_interested&search=&handoff=yes\|no&from=&to=&page=&pageSize=` · `GET /api/leads/export` (CSV) · `GET /api/leads/stats` · `GET/PATCH/DELETE /api/leads/:id` (`notes`, `status`, …) · `POST /api/leads` |
| Knowledge | `GET /api/knowledge?type=&status=active\|inactive\|all&embedding=failed\|…&search=&page=&pageSize=` · `POST /api/knowledge` `{title,content}` · `GET/PATCH/DELETE /api/knowledge/:id` (GET includes chunks) · `PATCH /api/knowledge/:id/status` `{status}` · `POST /api/knowledge/:id/reprocess` · `POST /api/knowledge/:id/recrawl` `{discardEdits?}` · `POST /api/knowledge/retry-embeddings` · `GET/POST /api/knowledge/faq` · `PATCH/DELETE /api/knowledge/faq/:id` · `POST /api/knowledge/reindex` `{full?}` |
| Crawler | `POST /api/crawler/start` `{mode?: incremental\|full\|retry, url?, singlePage?}` · `POST /api/crawler/recrawl` (full) · `POST /api/crawler/retry-failed` · `GET /api/crawler/status` (latest job, failed URLs, schedule, next run) · `GET /api/crawler/jobs` · `GET /api/crawler/jobs/:id` (crawl log: every URL + reason) · `POST /api/crawler/cancel/:id` |
| Settings | `GET /api/settings` · `PATCH /api/settings` `{general?, personality?, ai?, whatsapp?, appearance?}` — `general.enabled` turns the chatbot on/off, `ai` = model, temperature, max tokens, retrieval top-K/min similarity, memory messages |
| Cron (Vercel) | `GET /api/cron/sync` · `GET /api/cron/cleanup` — require `Authorization: Bearer $CRON_SECRET` |
| Analytics | `GET /api/analytics/overview\|conversations\|leads\|handoffs\|usage?days=30` (all computed from Supabase) |

## 12. Admin authentication

- **No default account exists.** Create one with:

  ```bash
  npm run admin:create -- --email owner@yourdomain.com --name "Your Name"
  ```

  It prompts for a password, hidden as you type. You can also set the `ADMIN_PASSWORD` env var. The password needs 12+ characters, with upper case, lower case and a digit.
- Add `--reset-password` to change an existing account's password. This also signs out all of that account's sessions.
- Add `--role viewer` for a read-only account.
- **Tokens:**
  - Passwords are hashed with bcrypt (cost 12).
  - Access tokens are 15-minute HS256 JWTs, held in memory by the admin app.
  - The refresh token is an HttpOnly cookie. It rotates on every use and is stored hashed.
  - Every request re-reads the account from the database, so roles are never trusted from the browser.
- **Cross-site deployments:** if the admin and the API are on different sites, set `COOKIE_SAMESITE=none` (this requires HTTPS).

## 13. Chatbot integration

- `client/` calls `/api/chat/*` through `client/src/services/chatService.js`.
- The visitor id and session token are kept in `localStorage`, so a returning visitor resumes their conversation.
- The messages themselves live only in Supabase.
- The widget loads its name, colours, welcome message and WhatsApp settings from `GET /api/chat/config`, so whatever you save in the admin takes effect without a rebuild.

## 14. Widget deployment

The widget is deployed with the client (`npm run build:deploy` puts `widget.js` and `embed-test.html` into `client/dist`). The production embed for seovirji.com is:

```html
<script src="https://seo-virji-chat.vercel.app/widget.js" data-api-url="https://seo-virji-api.vercel.app" async></script>
```

- It renders in an open Shadow DOM, so host CSS and JavaScript cannot affect it, and it doesn't touch the host page.
- `data-api-url` (or `data-api-base-url`) overrides the API baked in at build time (`VITE_API_BASE_URL`).
- The page's origin must be in `ALLOWED_ORIGINS`. `https://seovirji.com` and `https://www.seovirji.com` are already set.
- When the chatbot is disabled in the admin settings, the widget renders nothing on the host site.
- `https://seo-virji-chat.vercel.app/embed-test.html` is a hostile-CSS "external site" for checking isolation.

## 15. WhatsApp handoff

- **Number:** taken from the admin Settings, or from `SEO_VIRJI_WHATSAPP_NUMBER` if that's empty. The current default is the number published on seovirji.com.
- **When the visitor confirms**, the server, in one transaction:
  - creates or updates the lead
  - marks the conversation `transferred`
  - moves the lead to `qualified` (unless an admin has already set it further along)
  - stores the generated message
  - returns `https://wa.me/<number>?text=<encoded message>`
- **The pre-filled message contains:**
  - the admin's "WhatsApp handoff message" intro
  - the visitor's first question
  - **only details the visitor typed**
  - their requirements
  - a grounded summary
  - `Chat reference: XXXXXXXX`, which can be searched in Admin → Conversations
- **Handoff status:**
  - A `wa.me` link only *pre-fills* a message that the visitor reviews and sends, so a handoff starts as `link_generated`.
  - It becomes `opened` when the visitor's browser opens WhatsApp.
  - It is never shown as "sent" or "delivered".
- The WhatsApp Business API is not used. That would need Meta credentials.

## 16. Testing

```bash
npm test                  # 77 unit/API/security tests (no AI calls): SSRF, robots, extraction (canonical, pagination, contacts), chunking,
                          #   scoring, grounding, WhatsApp message, CSV injection, validators, auth on every new endpoint, cron auth,
                          #   CORS, Postgres rate-limit store, DB reply lock, older-message recall, disabled chatbot
npm run test:crawler      # 13 tests: website sync state machine on the real DB with a mocked site (~5 min, DB round-trips)
npm run test:integration  # 11 tests, real Supabase + OpenAI: RAG answer, idempotent retry, 20+ message memory, handoff, RLS, refresh rotation, crawler blocking
node scripts/check-test-residue.js [--delete]   # find/remove records created by tests (explicit test markers only)
npm run db:verify
npm run health
npm run lint              # syntax check + secret scan of server, client, admin and built bundles
```

The integration suite makes about 15 small model calls and deletes everything it creates.

## 17. Production deployment — Vercel (current)

| App | Vercel project | URL |
| --- | --- | --- |
| API | `seo-virji-api` (root `server/`) | https://seo-virji-api.vercel.app (health: `/api/health`) |
| Chatbot + widget | `seo-virji-chat` (root `client/`) | https://seo-virji-chat.vercel.app · `/widget.js` · `/embed-test.html` |
| Admin | `seo-virji-admin` (root `admin/`) | https://seo-virji-admin.vercel.app |

**How the API runs on Vercel**
- `server/api/index.js` exports the same Express app. `server/vercel.json` rewrites every path to it, so routes are identical to local.
- Functions run in `hnd1` (Tokyo), next to the Supabase database, with `maxDuration: 300`.
- Background work (conversation summaries, sync steps) uses `waitUntil`.
- The website sync is resumable (see §8). Vercel Cron runs `/api/cron/sync` daily at 03:00 UTC and `/api/cron/cleanup` daily at 04:30 UTC. The admin's status polling also keeps an active sync moving.
- Rate limits and the per-conversation reply lock live in Postgres (`seo_virji_rate_limits`, `processing_until`), so they hold across instances.

**Frontends**
- The admin calls `/api/*` on its own domain; `admin/vercel.json` proxies it to the API. The refresh cookie is therefore first-party (`SameSite=Lax`, `Secure`, `HttpOnly`).
- The chatbot and widget call the API directly (`VITE_API_BASE_URL`), with CORS.

**Environment variables** (Vercel → Project → Settings → Environment Variables; never in `client/` or `admin/`):
- **API:**
  - Copied from `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `OPENAI_API_KEY` and the model names.
  - Production-specific:
    - `NODE_ENV=production`, `CLIENT_URL`, `ADMIN_URL`, `ALLOWED_ORIGINS`
    - `ADMIN_JWT_SECRET` (generated for production)
    - `CRON_SECRET`
    - `DATABASE_POOL_MAX=3`, `RATE_LIMIT_STORE=postgres`
    - `CRAWLER_*`
  - `SUPABASE_DB_PASSWORD` is not needed; it is part of `DATABASE_URL`.
- **Client (public, build-time):** `VITE_API_BASE_URL=https://seo-virji-api.vercel.app`, `VITE_BOT_ID`.
- **Admin (public, build-time):** `VITE_CLIENT_URL`. The API base stays empty because the admin uses the same-origin proxy.

**Redeploy**

```bash
cd server && vercel deploy --prod      # API (run `npm run db:migrate` first when migrations change)
cd client && vercel deploy --prod      # chatbot + widget.js (build: npm run build:deploy)
cd admin  && vercel deploy --prod      # admin
```

## 17b. Other hosts (Railway, Render, VPS)

1. Create a Node service with root directory `server`, start command `npm start`, and health check `/api/health`.
2. Set every variable from `.env.example` as a service variable (`NODE_ENV=production`). The server listens on the platform's `PORT`.
3. Run `npm run db:migrate`, then `npm run db:verify`.
4. Create the owner account: `npm run admin:create -- --email … --name …`.
5. Run `npm run crawl`, or press **Sync now** in the admin.
6. Build the frontends with `VITE_API_BASE_URL` pointing at the API. Deploy `client/dist`, `admin/dist` and `dist-widget/widget.js`.
7. Set `CLIENT_URL`, `ADMIN_URL` and `ALLOWED_ORIGINS` to the real origins. Use `COOKIE_SAMESITE=none` if the admin is on a different site from the API.

**Checklist:**
- HTTPS everywhere
- secrets only in the host's variables
- `npm run health` passes
- an owner account exists
- the knowledge sync has completed
- the WhatsApp number is set
- the widget origin is in `ALLOWED_ORIGINS`

## 18. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `[config] Invalid or missing environment variables` | Set the listed variable names in `.env` |
| `DATABASE_UNAVAILABLE` / pool errors | Check `DATABASE_URL` (session pooler, URL-encoded password) and the Supabase project status |
| Chat replies "I'm having trouble thinking right now" | Check the server logs for an `AI_*` code: invalid key, quota, or rate limit. `npm run health` tests OpenAI directly |
| Answers ignore new knowledge | `npm run embeddings:rebuild`; check **Knowledge Base → knowledge chunks / embeddings** |
| "A website sync is already running" | Wait, or cancel it in the admin. A sync whose worker stopped continues when the admin status page is open or the next cron runs; a job with no progress for 2 hours is released |
| Sync stays at the same phase on Vercel | Open Admin → Knowledge Base (its polling resumes the job), or check the Vercel function logs for `crawler.step_failed` |
| Cron does nothing | `CRON_SECRET` must be set on the API project; check Vercel → Project → Cron Jobs |
| Widget does not appear on the website | The chatbot may be disabled in Settings, or the site's origin is missing from `ALLOWED_ORIGINS` |
| Admin keeps returning to login | The cookie is blocked: serve the admin from the same site as the API, or use `COOKIE_SAMESITE=none` over HTTPS |
| Widget shows "We couldn't reach the SEO Virji assistant" | Wrong `VITE_API_BASE_URL`/`data-api-base-url`, or the site's origin is missing from `ALLOWED_ORIGINS` |
| `EADDRINUSE` | Another app is using `PORT`; change it, and set the frontends' `VITE_API_PROXY_TARGET` to match |

## 19. Security

- **Secrets:** they exist only in the server environment. `npm run lint` scans the frontends and their bundles for leaked keys.
- **Database:** RLS is on with no anon or authenticated grants. All SQL is parameterised.
- **Visitors:**
  - Each one can only reach their own conversation. That requires the conversation UUID, the visitor id and a random session token stored as a SHA-256 hash.
  - The error is the same whether a conversation is missing or belongs to someone else.
  - Sessions expire after `CHAT_SESSION_DAYS`.
- **Requests:**
  - Helmet headers and a CORS allowlist.
  - JSON body limit of 400 KB.
  - Rate limits per IP: chat, start, login (brute-force protection) and the admin API.
  - Zod validation on every input.
  - Errors never include stack traces.
- **Admin:** JWT with an audience check and a DB-verified account. Refresh tokens rotate and can be revoked. Viewers are read-only. Mutations are audit-logged.
- **Crawler:** SSRF protection as described in §8.
- **AI:**
  - Retrieved content and visitor text are treated as data, never as instructions.
  - The system prompt forbids revealing instructions or any other visitor's data.
  - The live prompt-injection tests passed for both a visitor message and planted knowledge.
- **Privacy:**
  - Logs contain events, codes and ids, never conversation text.
  - Visitors are told they're talking to an AI, and contact details are only requested with permission.
  - `DATA_RETENTION_DAYS` deletes old conversations automatically, and admins can delete conversations.

## 20. Cost & usage

- Every chat, summary and embedding call is logged in `seo_virji_usage_logs` (model, input/output tokens, status). View it via `GET /api/analytics/usage`.
- Costs are estimated only when you set `OPENAI_PRICE_*`. No prices are hard-coded.
- **Cost controls:**
  - `OPENAI_MAX_OUTPUT_TOKENS`
  - the 20-message context cap
  - `RAG_TOP_K`
  - summaries only every 6 messages
  - unchanged content is never re-embedded
  - idempotent retries don't call the model again
  - per-IP rate limits
- With `gpt-4o-mini`, a typical reply uses about 2–4k input tokens and 150–300 output tokens.
