# SEO Virji — AI Chatbot Platform

An AI business consultant for [seovirji.com](https://seovirji.com/).
- It answers visitors from SEO Virji's real website and owner-written knowledge, using RAG over Supabase + pgvector.
- It remembers the conversation.
- It qualifies visitors gently and hands warm leads to the owner on WhatsApp.
- A simple admin panel manages knowledge, conversations, leads, website sync and settings.

## Production

| | URL |
| --- | --- |
| Chatbot (standalone) | https://seo-virji-chat.vercel.app |
| Widget script | https://seo-virji-chat.vercel.app/widget.js |
| Widget isolation test page | https://seo-virji-chat.vercel.app/embed-test.html |
| Admin | https://seo-virji-admin.vercel.app |
| API | https://seo-virji-api.vercel.app |
| Health check | https://seo-virji-api.vercel.app/api/health |

**Embed on seovirji.com.** Paste this one line before `</body>`, or into the theme's footer scripts:

```html
<script src="https://seo-virji-chat.vercel.app/widget.js" data-api-url="https://seo-virji-api.vercel.app" async></script>
```

## Repository layout

```
seo-virji-ai-chatbot/
├── client/   Chatbot: standalone mobile-style page + embeddable widget.js (Shadow DOM)   React + Vite
├── admin/    Admin panel (login, dashboard, knowledge, website sync, conversations, leads, settings)
├── server/   API: Express + OpenAI + Supabase/pgvector RAG + resumable crawler   → server/README.md
└── e2e/      Playwright end-to-end, widget-embed and responsive tests (run against production)
```

## Architecture

```
seovirji.com ──<script widget.js>──┐
seo-virji-chat.vercel.app ─────────┼──► seo-virji-api.vercel.app (Express on Vercel Functions, hnd1)
seo-virji-admin.vercel.app ─/api proxy┘        │  OpenAI: gpt-4o-mini (structured replies) + text-embedding-3-small
                                               │  Supabase Postgres: seo_virji_* tables, pgvector HNSW + full-text
                                               └─ Vercel Cron: daily website sync + cleanup
```

**Prefix.** Every database object is prefixed `seo_virji_`, because the Supabase project is shared with other apps.

**Secrets.** They live only in `server/.env` locally and in the API project's Vercel environment variables. The client and admin get public build-time values only.

## Local development

You need Node 18.17+ (the deployment uses Node 22), a Supabase project and an OpenAI key.

```bash
# 1. API → http://localhost:4100
cd server && npm install
cp .env.example .env               # fill in Supabase + OpenAI values
npm run db:migrate && npm run db:verify
npm run admin:create -- --email you@example.com --name "Your Name"   # prompts for a password
npm run crawl                      # teach the AI the website
npm run dev

# 2. Chatbot → http://localhost:5173
cd client && npm install && npm run dev

# 3. Admin → http://localhost:5174 (sign in with the account created above)
cd admin && npm install && npm run dev
```

The frontends' dev servers proxy `/api` to `http://localhost:4100`; change this with `VITE_API_PROXY_TARGET`.

## Features

**Website knowledge**
- The crawler finds pages through robots.txt, sitemaps and sitemap indexes, the WordPress REST API, recursive internal links and pagination.
- It respects canonical URLs and detects duplicate URLs and duplicate content.
- It never crawls private or checkout pages, and records every skipped URL with its reason.
- Syncs are incremental, full, retry-failed or single-page, and run manually or on a schedule.
- They are resumable, so they work within serverless time limits.

**RAG**
- Search is hybrid: vector, keyword and an owner-priority boost, with source attribution.
- Knowledge is never hard-coded in prompts.
- Every edit re-embeds only the changed chunks.

**Conversations**
- The AI uses the last 20 messages, a persistent summary, grounded visitor facts and recall of relevant older messages.
- Conversations survive refreshes and are resumed by returning visitors.
- Replies use the visitor's language.

**WhatsApp handoff**
- The lead is saved and the conversation marked transferred.
- The pre-filled `wa.me` message includes the visitor's question, the details they shared and a chat reference.
- The admin sees "link generated" and "opened", never "delivered".

**Admin**
- **Dashboard:** visitors, conversations, active/resolved, leads, handoffs, knowledge and crawl status.
- **Knowledge records:** search, view, edit, activate/deactivate, re-crawl, regenerate embeddings, delete.
- **Business information:** nine sections.
- **FAQs.**
- **Website sync:** progress, crawl logs, failed URLs, retry and full re-crawl.
- **Conversations:** filters, date range, resolve/reopen, delete, CSV export.
- **Leads:** six statuses, notes, filters, delete, CSV export.
- **Settings:** chatbot on/off, personality, AI model, temperature, length, retrieval and memory, WhatsApp, appearance.

## Tests

| Command | Covers |
| --- | --- |
| `cd server && npm test` | Unit, API and security tests: validation, SSRF, extraction, CSV injection, auth and authorisation, CORS, rate-limit store, DB lock, memory recall, disabled bot |
| `cd server && npm run test:crawler` | Website sync state machine against the real DB with a mocked website: discovery channels, robots, redirects, canonical/duplicate detection, pagination, retries, crawl delay, incremental/full/retry/single modes, admin edits, removed pages, resumability, leases, cancellation |
| `cd server && npm run test:integration` | Real Supabase + OpenAI: RAG answers, idempotency, 20+ message memory, handoff, RLS, refresh-token rotation |
| `cd server && npm run db:verify` / `npm run health` / `npm run lint` | Schema and RLS, live connections, syntax check + secret scan of all apps and bundles |
| `cd e2e && npm test` | Playwright against production: the full visitor and admin journey, the widget on an external site, and responsive checks at 360–1920px |

E2E credentials: set `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` (or `E2E_ENV_FILE`) to an admin account created for testing. The tests delete every record they create.

## Design system

| Token | Value | Used for |
| --- | --- | --- |
| Navy | `#0B1050` | Headers, navigation, user messages, primary buttons |
| Gold | `#C9A132` | Primary CTAs, active indicators, accents |
| Cream | `#FBF5EC` | Welcome screen, summaries, soft highlights |
| Yellow | `#FFC400` | Qualified-lead badges, unsaved-changes indicator |
| White / Black | `#FFFFFF` / `#0A0A0A` | Surfaces / text |

Fonts: Manrope for headings, Inter for interface text.
