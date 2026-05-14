# ARIA — Architecture & UI / IHM Reference

> Project: **ARIA — AI Readiness & Intelligence Audit Tool** (internal name `ia-audit-tool`, see [package.json](package.json)).
> Goal of this document: provide a factual snapshot of backend, frontend, design system and interaction patterns to be cross-compared with other internal solutions and to extract organisation-wide standards.
> Each section ends with an **Open questions** block. Within sections, content is organised as **Current state / Rationale / Open questions** so that comparable items can be aligned across projects.

---

## 1. Overview

ARIA is a Next.js 16 (App Router) / React 18 web application backing AI readiness audits in regulated industries (defence, aerospace, naval, railway). The same Node.js process serves both UI pages and REST API routes; persistence is on MongoDB via Mongoose. AI features call Mistral (`lib/llm.ts`); Anthropic SDK is installed but not active. Authentication is JWT in httpOnly cookies, enforced by Next.js middleware ([middleware.ts](middleware.ts)).

```
                          +-------------------------------+
                          |      Browser (desktop)        |
                          |  React 18 + Next.js App Router|
                          |  Tailwind / Radix / Sonner    |
                          +---------------+---------------+
                                          |
                                          | HTTPS, httpOnly cookies
                                          v
+---------------------+        +----------------------------+
|  IIS / iisnode      |  -->   |  server.js (Next runtime)  |
|  basePath           |        |  middleware.ts (JWT)       |
|  /Customizations/   |        |  app/(app)/...  pages      |
|  Aria               |        |  app/api/.../route.ts      |
+---------------------+        +-------+--------------------+
                                       |
                          +------------+----------------+
                          |                             |
                          v                             v
                +-------------------+        +-------------------------+
                |   MongoDB 6+      |        |  Mistral API            |
                |   via Mongoose 8  |        |  (api.*.dc.mistral.ai)  |
                |   single DB       |        |  model: mistral-medium  |
                +-------------------+        +-------------------------+
```

### Open questions
- Is the production target IIS-only (basePath `/Customizations/Aria` in [next.config.js](next.config.js)) or also containerised via the [Dockerfile](Dockerfile) / [docker-compose.yml](docker-compose.yml)?
- Is the Mistral DC endpoint a managed/sovereign instance? Is it the canonical LLM provider for ATEXIS?
- Why two parallel route trees `app/(app)/audits/.../*` and `app/audits/.../*`? Are the latter dead/legacy?

---

## 2. Backend architecture

### 2.1 Stack

| Layer            | Choice                                           | Version     |
|------------------|--------------------------------------------------|-------------|
| Runtime          | Node.js                                          | 20 (Alpine, [Dockerfile](Dockerfile)) |
| Framework        | Next.js App Router (route handlers)              | ^16.2.4     |
| Language         | TypeScript                                       | ^5          |
| ORM/ODM          | Mongoose                                         | ^8.0.0      |
| Database         | MongoDB                                          | 6+ (per [spec.md](spec.md)) |
| Auth             | `jose` (JWT HS256) + `bcryptjs`                  | jose ^6.2.2 / bcryptjs ^3.0.3 |
| Validation       | `zod`                                            | ^4.3.6 ([lib/validators/index.ts](lib/validators/index.ts)) |
| LLM client       | Custom fetch wrapper to Mistral; `@mistralai/mistralai` and `@anthropic-ai/sdk` deps installed | mistralai ^2.1.2 / anthropic ^0.80.0 |
| Rate limiting    | In-process Map ([lib/rateLimit.ts](lib/rateLimit.ts)) | n/a (custom) |
| Hosting adapter  | `server.js` for IIS / iisnode + Docker           | n/a         |
| Tests            | Vitest 2.1 + mongodb-memory-server; Playwright 1.48 | see [vitest.config.ts](vitest.config.ts), [playwright.config.ts](playwright.config.ts) |

**Rationale.** Single-process Next.js avoids a separate API service; `jose` is used both in middleware (Edge runtime) and lib code. Mongoose chosen over Prisma due to nested embedded documents (B1–B7 blocks live inside `Process`).

### 2.2 Module organization

```
.
├── app/
│   ├── (app)/                       # protected route group (sidebar layout)
│   │   ├── layout.tsx               # Sidebar + TopBar shell
│   │   ├── dashboard/               # audit list + KPI overview
│   │   ├── audits/[auditId]/
│   │   │   ├── page.tsx             # audit detail
│   │   │   ├── processes/[procId]/
│   │   │   │   ├── layout.tsx       # block tabs
│   │   │   │   ├── b1|b2|b3|b5/page.tsx
│   │   │   ├── pocs/                # POC tracker per audit
│   │   │   ├── usecases/            # use cases per audit
│   │   │   ├── scoring/             # B6 scoring matrix
│   │   │   ├── roadmap/             # B7 roadmap
│   │   │   ├── report/              # AI report generation
│   │   │   └── export/              # exports
│   │   ├── usecases|pocs|roadmap/   # cross-audit views
│   │   ├── admin/users/             # admin only
│   │   └── settings/
│   ├── audits/.../                  # parallel/legacy route tree (no group)
│   ├── auth/login/                  # public login
│   └── api/                         # REST handlers (route.ts)
├── components/
│   ├── layout/                      # AppProviders, Sidebar, TopBar, BlockProgressBar
│   └── ui/                          # Badge, Button, Modal, ConfirmModal,
│                                    # Select, TagInput, Spinner, SaveIndicator,
│                                    # Toaster (sonner), Tooltip
├── context/                         # BreadcrumbContext, PageCodeContext
├── lib/
│   ├── api.ts                       # client fetch wrapper (basePath aware)
│   ├── auth.ts                      # JWT sign/verify, requireRole helper
│   ├── calculations.ts              # sovereignty index, ROI, scoring
│   ├── llm.ts                       # Mistral wrapper + JSON repair
│   ├── mongodb.ts                   # connection singleton
│   ├── rateLimit.ts                 # in-memory bucket
│   ├── store/authStore.ts           # Zustand auth slice (persist)
│   ├── types.ts                     # domain types + scoring rubric
│   ├── utils.ts                     # cn(), apiUrl() with IIS basePath
│   ├── validators/index.ts          # Zod schemas
│   └── models/                      # Mongoose schemas
├── middleware.ts                    # JWT cookie verification + header injection
├── server.js                        # custom HTTP server for iisnode
├── next.config.js                   # basePath /Customizations/Aria in prod
├── tailwind.config.ts               # design tokens
├── docs/, REVIEW.md, spec.md        # documentation
├── migrate_mongo_to_postgres.py     # one-shot Python migration helper (not active)
└── docker-compose.yml, Dockerfile, web.config
```

### 2.3 Data model

Mongoose schemas under [lib/models/](lib/models/): `User`, `Audit`, `Process`, `UseCase`, `POC`, `Roadmap`, `Implementation`, `Counter` (sequence generator).

```
+-------+        +----------+ 1     N +-----------+ 1   N +---------+
| User  |<-------+  Audit   +---------+  Process  +-------+ UseCase |
|  _id  |  ref   |  _id     |         |  _id      |       |  _id    |
|  role |        |  client  |         |  procId   |       |  cuId   |
+-------+        |  sector  |         |  b1{}     |       |  score{}|
                 |  status  |         |  b2{axes} |       |  ...    |
                 |  classif.|         |  b3{acts} |       +----+----+
                 |  isArch. |         |  b4{}     |            | 1
                 |  report{}|         +-----------+            |
                 +-----+----+                                  |
                       | 1                                     | N
                       | N                                     |
                 +-----+--------+                              |
                 |   POC        +<-----------------------------+
                 |  _id, pocId  |
                 |  phase       |   (POC.useCaseId references UseCase._id)
                 |  design{}    |
                 |  execution{} |
                 |  evaluation{}|
                 |  decision{}  |
                 +--------------+

                 +--------------+        +------------------+
                 |  Roadmap     |        | Implementation   |
                 |  auditId 1-1 |        | (audit-level     |
                 |  horizons{}  |        |  production track|
                 |  nextSteps[] |        |  ing — minimal)  |
                 +--------------+        +------------------+
```

Key embedded structures inside `Process` (see [lib/types.ts](lib/types.ts)):
- `b1` — context, stakeholders[], profiles[]
- `b2.axes` — five sovereignty axes (axis1–axis5), each `{status, findings, implications, ...}`
- `b3.activities` — ordered activities with tools, inputs, outputs, profileHours
- `b4` — deprecated (see [REVIEW.md](REVIEW.md) item #11)
- `score` is **embedded inside `UseCase`** (not a separate collection), with 6 dimensions D1–D6.

Sequencing: `Counter` collection drives `auditCode = AUD-NNN` ([lib/models/Counter.ts](lib/models/Counter.ts), called from [app/api/audits/route.ts](app/api/audits/route.ts)).

### 2.4 REST API surface

All endpoints live under `app/api/.../route.ts`. The deployment basePath `/Customizations/Aria` is prefixed in production by [next.config.js](next.config.js) and resolved client-side in [lib/utils.ts](lib/utils.ts).

| Resource                    | Endpoints (verbs)                                                                                     | Notes |
|-----------------------------|-------------------------------------------------------------------------------------------------------|-------|
| Auth                        | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`                                  | Sets `access_token` (8h) + `refresh_token` (7d) cookies; rate-limited 5/15min in [app/api/auth/login/route.ts](app/api/auth/login/route.ts) |
| Health                      | `GET /api/health`                                                                                    | Public |
| Users                       | `GET /api/users`, `POST /api/users`, `PATCH /api/users/[userId]`, `DELETE /api/users/[userId]`        | Admin only via `x-user-role` header |
| Audits                      | `GET /api/audits`, `POST /api/audits`, `GET/PATCH/DELETE /api/audits/[auditId]`                       | List supports `?archived=true`, `?page`, `?limit≤100` ([app/api/audits/route.ts](app/api/audits/route.ts)) |
| Processes                   | `GET/POST /api/audits/[auditId]/processes`, `GET/PATCH/DELETE /api/audits/[auditId]/processes/[procId]` | PATCH used for B1/B3/B4 partial updates |
| B2 sovereignty              | `PATCH /api/audits/[auditId]/processes/[procId]/b2`                                                  | Dedicated endpoint (the only one) — others go through process PATCH |
| Use cases                   | `GET/POST /api/audits/[auditId]/usecases`, `GET/PATCH/DELETE /api/audits/[auditId]/usecases/[cuId]`   | List filterable by `?processId` |
| POCs                        | `GET/POST /api/audits/[auditId]/pocs`, `GET/PATCH/DELETE /api/audits/[auditId]/pocs/[pocId]`          | Phase transitions via PATCH |
| Roadmap                     | `GET /api/audits/[auditId]/roadmap`, `PUT /api/audits/[auditId]/roadmap`                              | One roadmap per audit; full PUT replace |
| Report                      | `GET /api/audits/[auditId]/report`, `POST /api/audits/[auditId]/report`                              | POST regenerates via Mistral |
| Cross-audit lists           | `GET /api/usecases`, `GET /api/pocs`, `GET /api/roadmap`, `GET /api/implementations`                 | No filters/pagination |
| AI suggestions / fills      | `POST /api/audits/[auditId]/ai/suggest-usecases`                                                     | Mistral call |
|                             | `POST /api/audits/[auditId]/processes/[procId]/ai/process-report`                                    | |
|                             | `POST /api/audits/[auditId]/processes/[procId]/ai/sovereignty-analysis`                              | |
|                             | `POST /api/audits/[auditId]/pocs/[pocId]/ai/fill-design`                                             | |
|                             | `POST /api/ai/refresh-compute-estimates`                                                             | Bulk LLM refresh |
| Exports                     | `GET /api/audits/[auditId]/export/pocs`, `.../export/processes`, `.../export/usecases`               | Excel / JSON streamed |
| Migration / seed            | `POST /api/migrate`, `POST /api/seed`                                                                | Seed publicly accessible (REVIEW.md #1, used by login demo button) |
| Implementations             | `GET/POST /api/implementations`                                                                      | Production tracking, minimal |

**Conventions.**
- Prefix: `/api/...`, nested under `audits/[auditId]/...` for audit-scoped resources.
- IDs: MongoDB `_id` for primary, plus human-readable codes (`AUD-NNN`, `PROC-0X`, `CU-0X`, `POC-…`) — see [spec.md](spec.md) §4.2.
- Pagination: implemented only on `GET /api/audits` (`page`, `limit`); cross-audit list endpoints have no pagination.
- Versioning: **none** (no `/v1/`).
- Streaming: **none** (LLM responses are awaited fully and returned as JSON).
- Error format: `{ error: string }` (sometimes `{ error, issues: [{path, message}] }` from Zod, see [lib/validators/index.ts](lib/validators/index.ts)).

### 2.5 File storage

No object storage. The `B3 ProcessActivity` model has `inputFiles[]` / `outputFiles[]` of `{id, name, url?}`, where `url` is a free-text reference, not an upload target. There is **no upload endpoint** in the API.

### 2.6 Security / non-functional concerns

| Concern        | Implementation |
|----------------|----------------|
| AuthN          | JWT HS256 in httpOnly `access_token` cookie (8h) + `refresh_token` (7d, but no refresh route in tree); verified in [middleware.ts](middleware.ts), throws if `JWT_SECRET` missing |
| AuthZ          | Role injected as `x-user-role` header; `requireRole()` in [lib/auth.ts](lib/auth.ts) returns 403; `viewer` role exists in types but enforcement is only in admin-scoped routes (REVIEW.md #1, partially fixed for login rate-limit) |
| Password       | `bcryptjs` 10 rounds ([app/api/auth/login/route.ts](app/api/auth/login/route.ts)) |
| Rate limit     | In-memory bucket on `login` (5 / 15 min) ([lib/rateLimit.ts](lib/rateLimit.ts)) |
| CORS           | Not configured (same-origin) |
| CSRF           | No protection (`sameSite: lax` cookies only); REVIEW.md item planned |
| Secrets        | `.env.local`: `MONGODB_URI`, `JWT_SECRET`, `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY?`, `NEXT_PUBLIC_APP_URL?` |
| HTTPS          | Delegated to reverse proxy (IIS / nginx); cookie `secure` flag set when `NODE_ENV=production` |
| Logging        | `console.error("[API]", err)` on catches; no structured logger, no telemetry |
| Cache          | Mongo `.lean()` for read paths; `Promise.all` parallel queries; no HTTP cache headers |
| Validation     | Zod on selected POSTs (`createAuditSchema`, `createProcessSchema`, `createUseCaseSchema`); not exhaustive (REVIEW.md #6) |

### Open questions
- Should `/api/seed` and `/api/migrate` be removed in production builds or guarded by a `NODE_ENV` check?
- Refresh-token route is missing — is the 8h access token effectively the session length, with a forced re-login afterwards?
- Is the in-memory rate limiter acceptable behind multi-instance IIS, or do we need Redis?
- Should errors expose Zod issue paths to clients, or only generic messages?

---

## 3. Frontend architecture

### 3.1 Stack

| Aspect          | Choice                                                                                          |
|-----------------|-------------------------------------------------------------------------------------------------|
| Framework       | Next.js App Router (React Server Components opt-in; most pages are `'use client'`)              |
| Language        | TypeScript ^5 (`ignoreBuildErrors: true` in [next.config.js](next.config.js))                   |
| Styling         | Tailwind CSS 3.3, `@tailwindcss/typography`, custom utility components in [app/globals.css](app/globals.css) |
| UI primitives   | Radix UI (`@radix-ui/react-select`, `react-slot`, `react-tooltip`)                              |
| Component lib   | Custom (no shadcn/MUI/Mantine). `class-variance-authority` + `tailwind-merge` for variants ([components/ui/button.tsx](components/ui/button.tsx)) |
| Icons           | `lucide-react` ^1.7                                                                             |
| Charts          | `recharts` ^3.8 + custom inline SVG donut ([app/(app)/dashboard/page.tsx](app/(app)/dashboard/page.tsx)) |
| Toasts          | `sonner` ^2.0 ([components/ui/sonner.tsx](components/ui/sonner.tsx))                            |
| Routing         | Next.js file-based routing                                                                      |
| i18n            | None. UI strings hard-coded in English; some legacy strings in Spanish (e.g. README.md, llm.ts error string) |
| Client state    | Zustand (auth), TanStack React Query (cache w/ 1-min staleTime) ([components/layout/AppProviders.tsx](components/layout/AppProviders.tsx)) |
| Markdown        | `react-markdown` + `marked` for AI report rendering                                             |
| Forms           | Native React state, no react-hook-form / formik                                                 |
| Dark mode       | Not implemented                                                                                 |
| Mobile          | Explicitly unsupported below 1024px (sticky banner from [app/globals.css](app/globals.css))     |

**Rationale.** The app is internal, desktop-only, dense UI; the team chose Tailwind + Radix primitives instead of an opinionated component library to keep visual control while avoiding accessibility re-implementation.

### 3.2 Logical structure + routes

| Route                                              | Purpose                                                  |
|----------------------------------------------------|----------------------------------------------------------|
| `/auth/login`                                      | Public login + demo seed button                          |
| `/dashboard`                                       | Audit list + KPI cards + savings donut                   |
| `/audits/new`                                      | Create audit form                                        |
| `/audits/[auditId]`                                | Audit detail (status, processes, KPIs)                   |
| `/audits/[auditId]/processes/new`                  | Create process                                           |
| `/audits/[auditId]/processes/[procId]`             | Process overview                                         |
| `/audits/[auditId]/processes/[procId]/b1`          | Block 1 — context & stakeholders                         |
| `.../b2`                                           | Block 2 — sovereignty (5-axis traffic light)             |
| `.../b3`                                           | Block 3 — process map (activity grid)                    |
| `.../b5`                                           | Block "B4" in nav, Block 5 in code — use cases           |
| `/audits/[auditId]/usecases`                       | Per-audit use case list                                  |
| `/audits/[auditId]/scoring`                        | B6 scoring matrix                                        |
| `/audits/[auditId]/roadmap`                        | B7 roadmap (3 horizons)                                  |
| `/audits/[auditId]/pocs[, /new, /[pocId]]`         | POC tracker                                              |
| `/audits/[auditId]/report`                         | AI-generated report                                      |
| `/audits/[auditId]/export`                         | Excel / JSON export                                      |
| `/usecases`, `/pocs`, `/roadmap`                   | Cross-audit aggregations                                 |
| `/admin/users`                                     | Admin user CRUD                                          |
| `/settings`                                        | User profile                                             |

The wrapper `app/(app)/layout.tsx` injects sidebar + topbar; `app/auth/login/` lives outside the group and renders standalone.

### Open questions
- The duplicated tree under `app/audits/...` (no group, no sidebar) — is it intended for an embed/iframe mode or is it dead code?
- Should `b4` and the visible label "B4 Use Cases" be reconciled with the underlying `b5` route to avoid confusion?
- Should React Query replace the manual `useEffect`+`fetch` patterns still present in the Sidebar and pages?

---

## 4. Design system (de facto)

Tokens live in [tailwind.config.ts](tailwind.config.ts) and [app/globals.css](app/globals.css). No design-tokens JSON, no Storybook.

### 4.1 Color tokens

| Token              | Hex      | Role |
|--------------------|----------|------|
| `navy`             | #0B1929  | Sidebar background |
| `blue-aria`        | #1B6CA8  | Primary brand, primary buttons, active states |
| `blue-light`       | #5AABF5  | Logo, active sidebar link text |
| `blue-pale`        | #D6EEFF  | Brand-tinted backgrounds, B6/B7 blocks |
| `green-sov`        | #166534  | Sovereignty `green`, success, save indicator |
| `green-sov-light`  | #DCFCE7  | Success bg, quick-win category |
| `amber-sov`        | #D97706  | Sovereignty `amber`, warnings, unsaved indicator |
| `amber-sov-light`  | #FEF3C7  | Warning bg, mobile banner |
| `red-sov`          | #B91C1C  | Sovereignty `red`, danger button, B2 block |
| `red-sov-light`    | #FEE2E2  | Danger/critical bg |
| `teal-poc`         | #0F766E  | POC accent, B8 block |
| `teal-poc-light`   | #CCFBF1  | POC bg |
| `purple-aria`      | #5B21B6  | B3/B5 accent, strategic category |
| `purple-aria-light`| #EDE9FE  | Purple bg |
| `smoke`            | #F1F5F9  | App body bg |
| `muted`            | #64748B  | Secondary text |
| `border`           | #CBD5E1  | Borders |
| `text`             | #0F172A  | Primary text |

Sovereignty traffic light is the single most reused semantic palette (axes, badges, sidebar block colours).

### 4.2 Typography tokens

| Token           | Value                                  | Used for |
|-----------------|----------------------------------------|----------|
| `font-sans`     | Inter, system-ui, sans-serif           | Body, UI |
| `font-display`  | Syne (700/800), system-ui              | h1/h2/h3, "ARIA" wordmark in [Sidebar.tsx](components/layout/Sidebar.tsx#L181) |
| `font-mono`     | DM Mono, monospace                     | Entity codes (PROC-01, CU-01) ([TopBar.tsx](components/layout/TopBar.tsx#L98)) |
| Base size       | 14px (`body { font-size:14px }`)       | [app/globals.css](app/globals.css#L14) |
| Line height     | 1.5                                    | global |

Fonts are loaded from Google Fonts at runtime via `@import` in [globals.css](app/globals.css#L1) (no `next/font` optimisation).

### 4.3 Dimension / shadow / radius tokens

| Token            | Value         |
|------------------|---------------|
| `rounded-sm`     | 6px           |
| `rounded-md`     | 10px          |
| `rounded-lg`     | 12px          |
| `shadow-card`    | `0 1px 3px rgba(0,0,0,0.08)` |
| `shadow-panel`   | `0 2px 8px rgba(0,0,0,0.08)` |
| Sidebar width    | 240px (inline style, [Sidebar.tsx](components/layout/Sidebar.tsx#L176)) |
| TopBar height    | 48px (inline style, [TopBar.tsx](components/layout/TopBar.tsx#L66)) |
| Min viewport     | 1024px (mobile banner trigger) |

### 4.4 Atomic components

Located under [components/ui/](components/ui/).

| Component / class           | Role |
|-----------------------------|------|
| `Button` (cva variants: primary/secondary/danger/ghost/link, sizes sm/md/lg/icon) | Primary action element ([button.tsx](components/ui/button.tsx)) |
| `Badge` (variants: green/amber/red/blue/purple/teal/slate/default) | Status / classification chip ([Badge.tsx](components/ui/Badge.tsx)) |
| `Modal` + `ConfirmModal` (sm/md/lg/xl) | Dialogs via `createPortal` ([Modal.tsx](components/ui/Modal.tsx)) |
| `Select`                    | Radix-based dropdown ([select.tsx](components/ui/select.tsx)) |
| `TagInput`                  | Free-typed tag chips ([TagInput.tsx](components/ui/TagInput.tsx)) |
| `Spinner` (sm/md/lg)        | Inline loading indicator |
| `SaveIndicator` (saved/saving/unsaved) | TopBar autosave feedback ([SaveIndicator.tsx](components/ui/SaveIndicator.tsx)) |
| `Toaster`                   | Sonner-based notifications ([sonner.tsx](components/ui/sonner.tsx)) |
| `Tooltip`                   | Radix tooltip primitive |
| `.btn-primary/.btn-secondary/.btn-danger` (Tailwind component classes) | Older button style still co-existing with `Button` ([globals.css](app/globals.css#L25)) |
| `.card` / `.form-input` / `.form-textarea` / `.form-label` | Common form/card classes |
| `.sovereignty-{green,amber,red}` | Traffic-light cells |
| `.block-b{1,2,3,5,6,7,8}`   | Block-coloured pills |
| `.score-{quick-win,mid-term,strategic}` | Scoring badges |

### 4.5 Reused business components

| Component                    | Consumers |
|------------------------------|-----------|
| `Sidebar`                    | [app/(app)/layout.tsx](app/(app)/layout.tsx) |
| `TopBar`                     | same |
| `BlockProgressBar`           | Process detail / dashboard cards ([BlockProgressBar.tsx](components/layout/BlockProgressBar.tsx)) |
| `SaveIndicator`              | TopBar (autosave on B1–B5 pages) |
| `BreadcrumbContext`/`PageCodeContext` | Used by TopBar to render breadcrumbs and entity code (PROC-01, CU-01) |
| `SavingsDonut` (inline SVG)  | Dashboard ([app/(app)/dashboard/page.tsx](app/(app)/dashboard/page.tsx#L81)) — not extracted |
| `Badge` with `SECTOR_VARIANTS`/`STATUS_VARIANTS` mappings | Dashboard, audit pages |

### Open questions
- Two button styles co-exist (Tailwind `.btn-*` classes in [globals.css](app/globals.css) vs `Button` cva component in [button.tsx](components/ui/button.tsx)) — should `.btn-*` be retired?
- No `next/font` for Inter/Syne/DM Mono — acceptable on intranet with Google Fonts CDN access?
- Is `SavingsDonut` re-used elsewhere or should it be extracted into `components/charts/`?
- Should `block-b4` be removed alongside REVIEW.md #11?

---

## 5. Information architecture & navigation

```
+-------------------------------------------------------------------------+
| html lang="en"                                                          |
| body                                                                    |
|  +---------------------------------------------------------------------+|
|  | mobile-unsupported-banner (shown <1024px only)                      ||
|  +---------------------------------------------------------------------+|
|  | AppProviders                                                        ||
|  |   QueryClientProvider                                               ||
|  |     BreadcrumbProvider                                              ||
|  |       TooltipProvider                                               ||
|  |         (app)/layout.tsx ----------------------------------------+  ||
|  |         | PageCodeProvider                                       |  ||
|  |         |  +------------+   +-----------------------------------+|  ||
|  |         |  |  Sidebar   |   | TopBar (breadcrumb, code, classif)||  ||
|  |         |  | 240px      |   |-----------------------------------+|  ||
|  |         |  | navy bg    |   | <main> overflow-y-auto p-6        ||  ||
|  |         |  |  - Audits  |   |   page content                    ||  ||
|  |         |  |  - UseCases|   |                                   ||  ||
|  |         |  |  - POCs    |   |                                   ||  ||
|  |         |  |  - Roadmap |   |                                   ||  ||
|  |         |  |  -- Current Audit ---                              ||  ||
|  |         |  |  - Dashboard                                       ||  ||
|  |         |  |  - Processes (collapsible)                         ||  ||
|  |         |  |     - PROC-0X                                      ||  ||
|  |         |  |        - B1 / B2 / B3 / B4 (=b5 route)             ||  ||
|  |         |  |          - CU-0X (under B4 expand)                 ||  ||
|  |         |  |  - Use Cases / POCs / Roadmap / AI Report / Export ||  ||
|  |         |  |  - (Admin) Users                                   ||  ||
|  |         |  |  - Settings   - Logout                             ||  ||
|  |         |  +------------+   +-----------------------------------+|  ||
|  +---------------------------------------------------------------------+|
|  | Toaster (sonner, bottom-right)                                      ||
|  +---------------------------------------------------------------------+|
+-------------------------------------------------------------------------+
```

- **Selectors / role.** No language selector. Role-conditional UI only on the "Users" sidebar entry (admin only) — see [Sidebar.tsx](components/layout/Sidebar.tsx#L373).
- **i18n.** Not implemented. UI is English; demo seed and a few backend strings are still Spanish.
- **Breadcrumbs.** Either pushed via `useBreadcrumb()` from a page or fallback to URL segment labels (`SEGMENT_LABELS` in [TopBar.tsx](components/layout/TopBar.tsx#L19)).
- **Entity code.** A monospaced badge (`PROC-01`, `CU-03`) injected via `usePageCode()` in pages — visual anchor between URL and domain.

### Open questions
- Is i18n on the roadmap? If so, the existing English-mostly strings would need consolidation.
- Should the "B4" label vs `/b5` route inconsistency be resolved before exporting design standards?
- Sidebar is hard-coded to navy (#0B1929 inline) — should this become a `navy` token reference for consistency?

---

## 6. Interaction patterns

### 6.1 CRUD lists (audits, use cases, POCs)
- Pattern: full-page table (or card grid for dashboard), top-bar `Search` input, status `Badge` chips, action buttons in the header (`Plus` icon for create, `Archive` for filter).
- Source: [app/(app)/dashboard/page.tsx](app/(app)/dashboard/page.tsx), [app/(app)/usecases/page.tsx](app/(app)/usecases/page.tsx), [app/(app)/pocs/page.tsx](app/(app)/pocs/page.tsx).
- Pagination: only on `/api/audits` (page/limit query); UI does not yet expose pagination controls.

### 6.2 Create / edit forms
- Inline forms with native `useState` + `fetch`; no react-hook-form. Submit button shows `Spinner`. Validation surfaces via `toast.error()` from Sonner.
- Create flows route through `app/(app)/.../new/page.tsx`.

### 6.3 Block editors with autosave (B1–B5)
- Pages such as [app/(app)/audits/[auditId]/processes/[procId]/b1/page.tsx](app/(app)/audits/[auditId]/processes/[procId]/b1/page.tsx) drive `SaveIndicator` via debounced PATCH calls.
- Status flow:

```
   user edits        500ms idle / blur            success
[ unsaved ] ----------------> [ saving ] ----------------> [ saved ]
     ^                                                       |
     |                              error                    |
     +--------------------- toast.error  <-------------------+
```

### 6.4 Sovereignty traffic light (B2)
- 5 axes × 3 colour states (`green` / `amber` / `red`). Selecting a status persists via `PATCH /api/audits/.../b2`.
- Aggregated `sovereigntyIndex` recomputed in [lib/calculations.ts](lib/calculations.ts) and surfaced as a level: `full_autonomy / managed / conditioned / restricted / critical`.

### 6.5 Use case scoring (B6, embedded in UseCase)
- 6 dimensions D1–D6 each 1–5; `D5` is auto-filled from B2 (`autoFilled` flag in `score.dimensions`). Total threshold drives `quick_win | mid_term | strategic` ([lib/types.ts](lib/types.ts#L411)).

### 6.6 POC lifecycle (state workflow)

```
 +---------+   +-----------+   +------------+   +--------+
 | design  |-->| execution |-->| evaluation |-->| closed |
 +---------+   +-----------+   +------------+   +---+----+
                                                    |
                                                    v
                                            +----------------+
                                            | decision:      |
                                            |  go            |
                                            |  go_conditional|
                                            |  no_go_redesign|
                                            |  no_go_discard |
                                            |  paused        |
                                            |  pending       |
                                            +----------------+
```
Phases are stored on `POC.phase` ([lib/types.ts](lib/types.ts#L306)); transitions are user-driven via PATCH; UI gates next steps by phase.

### 6.7 LLM-assisted actions (one-shot, non-streaming)
- Buttons such as "Suggest with AI" / "Analyze" / "Fill with AI" call POST endpoints under `.../ai/...`, which `await callMistral(...)` and return parsed JSON. No streaming or partial rendering.
- Failure surface: `toast.error` with the API `error` string.

### 6.8 Reports
- `POST /api/audits/[auditId]/report` regenerates a markdown report; rendered with `react-markdown` on `report` page; persisted on `Audit.report`.

### 6.9 Exports
- Direct `GET` to export endpoints; browser handles file download. No modal — link/button per export type.

### 6.10 Modals & toasts
- `Modal` (portal) for forms/details, `ConfirmModal` for destructive confirms.
- Sonner `Toaster` configured globally with brand-coloured borders ([sonner.tsx](components/ui/sonner.tsx)).

### 6.11 RAG / agentic features
- Not applicable. LLM calls are stateless prompt → JSON, no retrieval, no tool-use.

### Open questions
- Should LLM endpoints stream (SSE) for long completions, or stay one-shot for predictability?
- Is autosave debounce/throttle behaviour consistent across B1/B2/B3/B5 — or does each page reimplement it?
- Is the `pending` POC decision a true initial state or an "uncategorised" placeholder?

---

## 7. Observability & errors

| Area              | Current state |
|-------------------|---------------|
| Server logs       | `console.error("[API]", err)` ad-hoc; no structured logger (pino/winston). |
| Telemetry         | None (no Sentry, no OTEL, no Application Insights). |
| Health probe      | `GET /api/health` returns `{ status: 'ok', version, timestamp }`. |
| Client errors     | No `ErrorBoundary` component shipped; no `app/error.tsx` global boundary. |
| Error pages       | No custom `not-found.tsx` / `error.tsx` at root. Default Next.js fallbacks apply. |
| API error format  | `{ error: string }` plus optional `issues[]` from Zod validators. |
| Build safety      | `typescript.ignoreBuildErrors: true` ([next.config.js](next.config.js)) — TS errors do not fail builds. |

### Open questions
- Add `app/error.tsx` and `app/not-found.tsx` to align with other internal Next.js apps?
- Replace `console.error` with a structured logger and ship to a central sink (Datadog / Application Insights / ELK)?
- Should `ignoreBuildErrors` be turned off as part of standardisation?

---

## 8. Comparison summary table

(Two cross-project comparison columns left blank — to be filled by the reviewer when aggregating.)

| Dimension              | ARIA (this project)                                     | Solution B | Solution C | Proposed standard |
|------------------------|----------------------------------------------------------|-----------|-----------|-------------------|
| Backend framework      | Next.js 16 App Router (route handlers), single-process |           |           |                   |
| Database               | MongoDB 6+ via Mongoose 8                                |           |           |                   |
| File / object storage  | None (URLs stored as text in B3 activities)             |           |           |                   |
| Authentication         | JWT HS256 in httpOnly cookie, 8h access + 7d refresh, bcrypt |       |           |                   |
| API versioning         | None                                                     |           |           |                   |
| Frontend framework     | Next.js / React 18                                       |           |           |                   |
| Language               | TypeScript (`ignoreBuildErrors: true`)                   |           |           |                   |
| Styling                | Tailwind CSS 3.3 + custom utility classes in globals.css |           |           |                   |
| Component library      | Custom (Radix primitives, cva variants)                  |           |           |                   |
| Charts                 | Recharts + inline SVG donut                              |           |           |                   |
| Icons                  | lucide-react                                             |           |           |                   |
| Routing                | Next.js file-based App Router                            |           |           |                   |
| i18n                   | None (English UI, residual Spanish strings)              |           |           |                   |
| Dark mode              | None                                                     |           |           |                   |
| WCAG accessibility     | Modal `aria-*` attrs, Spinner `role=status`; no audit    |           |           |                   |
| UI tests               | Vitest + Testing Library + Playwright (e2e config present) |         |           |                   |
| LLM streaming          | None (non-streaming Mistral)                             |           |           |                   |
| RAG                    | Not applicable                                           |           |           |                   |
| Exports                | Excel + JSON via dedicated `/export/*` endpoints, AI markdown report |  |       |                   |
| Layout                 | Fixed sidebar 240px navy + topbar 48px; desktop ≥1024px  |           |           |                   |
| Design tokens          | Tailwind `theme.extend` (colors, fonts, radii, shadows)  |           |           |                   |
| Shared components      | components/ui (~12) + components/layout (4)              |           |           |                   |
| Modal / toast pattern  | Portal-based `Modal`/`ConfirmModal` + Sonner toasts      |           |           |                   |
| Telemetry              | None (console.error only); `/api/health` ping            |           |           |                   |
| Packaging / deployment | Docker (Alpine Node 20) and IIS via `server.js` + `web.config` |     |           |                   |

---

## 9. Synthesis

### Strengths
- Clear domain modelling: 7-block methodology mapped to concrete embedded schemas with human-readable IDs (`AUD-NNN`, `PROC-0X`, `CU-0X`, `POC-…`).
- Cohesive design tokens for sovereignty (`green/amber/red`) and audit blocks (B1…B8) reused consistently across badges, sidebar and progress bar.
- Single-process Next.js: low operational footprint; the same artefact runs in Docker and on IIS.
- Strong type coverage in [lib/types.ts](lib/types.ts) with shared rubric (`SCORING_RUBRIC`, `AI_TYPE_LABELS`).
- AppProviders wires React Query, Tooltip and Breadcrumb providers in one place; sidebar/topbar layout is a single shell with autosave indicator built-in.

### Structural limitations
- Two parallel route trees (`app/(app)/audits/...` and `app/audits/...`) — risk of drift.
- Two parallel button systems (`.btn-*` Tailwind classes vs `Button` cva component).
- Naming mismatch between code (`b5`) and UI label ("B4"); deprecated `b4` block still in models and types.
- No streaming, no central error boundary, no structured logger; `ignoreBuildErrors: true` masks TS regressions.
- Validation only on a subset of endpoints; `computeCost: any` weakens typing on UseCase/POC.
- Pagination implemented only on `/api/audits`; cross-audit list endpoints unscoped.
- LLM coupling to a specific Mistral DC URL hard-coded in [lib/llm.ts](lib/llm.ts).
- In-memory rate limiter is per-instance — incompatible with multi-replica deployments.
- No i18n abstraction; mixed English/Spanish strings.
- No file upload / object storage despite domain references to documents and "input/output files".

### Priority topics to standardize (numbered)
1. **API versioning & error envelope.** Adopt `/api/v1/...`, standard error shape `{ code, message, issues? }`, and exhaustive Zod validation on all POST/PATCH/PUT.
2. **Authentication & authorization.** Centralise role enforcement (decorator/util) and define a refresh-token endpoint; align session lifetimes across solutions.
3. **Pagination convention.** `page`/`limit` (capped) on every list endpoint, with a typed `{items, total, page, limit}` envelope.
4. **Telemetry & logging.** Pino/Winston + central sink, plus `app/error.tsx` and `app/not-found.tsx`; require `ignoreBuildErrors: false` in CI.
5. **Component library.** One canonical `Button`/`Badge`/`Modal` set (cva-based), retire legacy `.btn-*`, add Storybook for design tokens.
6. **Design tokens.** Promote sovereignty traffic-light, block colours, brand palette, radii and shadows to a shared tokens package consumable by Tailwind and any non-Next surface.
7. **Charts & visual primitives.** Decide between Recharts and a shared SVG primitives library; extract `SavingsDonut`-style components to a chart kit.
8. **LLM integration.** Standardise streaming (SSE), provider abstraction (Mistral/Anthropic/OpenAI behind one interface), prompt repository, and JSON-repair parsing.
9. **i18n.** Pick one library (next-intl) and a key convention; remove residual Spanish strings.
10. **Accessibility baseline.** Define a WCAG-AA minimum (focus rings, ARIA on Modals/Tooltips/Selects already partial), with automated checks in CI.
11. **Packaging.** One reference deployment recipe (Docker behind reverse proxy) plus an IIS adapter when needed; remove `/api/seed` and `/api/migrate` from production builds.
12. **Observability hooks.** Standard `/api/health` shape, basic metrics (latency, LLM cost), and a uniform request-id header propagated through routes.
