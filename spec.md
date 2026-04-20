# ARIA — AI Readiness & Intelligence Audit Tool
## Product Specification & Technical Reference

> Version: 1.0 · Last updated: 2026-04-16 · Owner: ATEXIS / IA Audit Team

> **Supported platforms:** Desktop/laptop browsers only (viewport ≥ 1024px). Mobile and tablet are not supported. Viewports under 1024px display a warning banner; the UI layout (dense tables, multi-column dashboards, scoring grids) is not adapted for small screens.

---

## 1. Purpose & Problem Statement

ARIA is an internal web application developed by ATEXIS (ALTEN Group) to manage end-to-end AI readiness audits for enterprise clients in regulated industries (defence, aerospace, naval, railway). It replaces ad-hoc spreadsheets with a structured, multi-block methodology that captures context, sovereignty constraints, process maps, use cases, scoring, POC lifecycle, and ROI roadmaps in a single collaborative platform.

**Core problem:** AI adoption in regulated sectors requires assessing not just technical feasibility but also data sovereignty, governance complexity, and infrastructure constraints. Existing tools (Excel, Notion, PowerPoint) cannot enforce methodology consistency, compute ROI automatically, or track POC outcomes.

---

## 2. User Roles & Access

| Role | Description | Permissions |
|---|---|---|
| `admin` | ATEXIS platform manager | Full access: user management, all audits, seed data |
| `consultant` | Project auditor | Create/edit audits, processes, use cases, POCs |
| `viewer` | Client stakeholder / read-only observer | View audits assigned to them (planned, not yet enforced) |

Authentication: JWT tokens (8h access + 7d refresh) stored in httpOnly cookies. Role injected into all API requests via middleware headers (`x-user-role`).

---

## 3. Audit Methodology — The 7-Block Framework

Each audit is structured around 7 blocks (B1–B7), one per process, plus an audit-level POC tracker and roadmap:

| Block | Name | Purpose |
|---|---|---|
| **B1** | Context & Stakeholders | Process metadata, team profiles, stakeholder attitude map |
| **B2** | Sovereignty Assessment | 5-axis traffic-light evaluation of data/process/tool/infra sovereignty |
| **B3** | Process Map | BPMN-lite activity timeline with tools, inputs, outputs, hours |
| **B4** | Friction Analysis | Pain points & base metrics *(deprecated UI, data kept)* |
| **B5** | Use Cases | AI opportunities identified per process activity |
| **B6** | Scoring | 6-dimension weighted scoring to classify UCs (Quick Win / Mid-term / Strategic) |
| **B7** | Roadmap | 3-horizon implementation plan with ROI projections |

Additional entities (audit-level):
- **POC** — Proof of Concept lifecycle: Design → Execution → Evaluation → Decision
- **Implementation** — Production tracking post-POC

---

## 4. Domain Model

### 4.1 Entity Hierarchy

```
Audit
├── Process (1..N)
│   ├── B1: Context
│   ├── B2: Sovereignty (5 axes)
│   ├── B3: Activities (N activities per process)
│   └── B4: Pain Points (deprecated)
│
├── UseCase (1..M per process, linked via processId)
│   └── B6 Score (embedded, 6 dimensions)
│
├── POC (1..K per use case)
│   ├── Design
│   ├── Execution
│   ├── Evaluation
│   └── Decision
│
└── Roadmap (1 per audit)
    ├── H1: Quick Wins
    ├── H2: Mid-term
    └── H3: Strategic
```

### 4.2 Key Identifiers (human-readable)

| Entity | Format | Example |
|---|---|---|
| Audit code | `AUD-NNN` | `AUD-001` |
| Process ID | `{auditCode}-P{NN}` | `AUD-001-P01` |
| Use Case ID | `CU-{NN}` | `CU-03` |
| POC ID | `POC-{cuId}-{NN}` | `POC-CU-03-01` |

### 4.3 B2 Sovereignty Axes

| Axis | Evaluates |
|---|---|
| axis1_InfoClassification | Document/data classification level (NATO, PROT, etc.) |
| axis2_ProcessSovereignty | Process dependency on third-party tools/vendors |
| axis3_ToolSovereignty | AI/software toolchain nationality & licensing |
| axis4_DataSovereignty | Data residency and transfer restrictions |
| axis5_Infrastructure | Deployment model (on-site / on-premise / cloud) |

Status values: `green` (autonomous) · `amber` (managed/conditional) · `red` (restricted/critical)

### 4.4 B6 Scoring Dimensions

| Dim | Label | Range | Notes |
|---|---|---|---|
| D1 | Efficiency Impact | 1–5 | % time saved per execution |
| D2 | Quality Impact | 1–5 | Error/rework reduction |
| D3 | Tech Maturity | 1–5 | TRL 1–9 mapped to 1–5 |
| D4 | Data Readiness | 1–5 | From "doesn't exist" to "clean + voluminous" |
| D5 | Sovereignty Index | 1–5 | **Auto-filled from B2 average** |
| D6 | Governance Complexity | 1–5 | Legal/compliance blockers |

**Score thresholds:**
- **Quick Win**: total ≥ 22 **AND** D6 ≥ 4
- **Mid-term**: total ≥ 14
- **Strategic**: total < 14

---

## 5. Architecture

### 5.1 Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript 5 |
| Styling | Tailwind CSS 3.3, Radix UI primitives |
| State (client) | Zustand 5 (auth), TanStack React Query 5 (server cache) |
| Backend | Next.js API Routes (Node.js 20) |
| Database | MongoDB 6+ via Mongoose 8 |
| Auth | JWT (jose), bcryptjs, httpOnly cookies |
| AI | Mistral AI API (primary), Anthropic SDK (installed, not active) |
| Icons | Lucide React |
| Charts | Recharts 3.8, custom SVG donut |
| Notifications | Sonner toasts |
| Deployment | Docker (Alpine Node 20), Docker Compose (MongoDB + app) |

### 5.2 Directory Structure

```
├── app/
│   ├── (app)/               # Protected routes (requires auth)
│   │   ├── dashboard/       # Audit list + KPI overview
│   │   ├── audits/[id]/     # Audit detail + B1–B7 blocks
│   │   │   ├── processes/[procId]/b1-b5/
│   │   │   ├── scoring/     # B6 scoring matrix
│   │   │   ├── roadmap/     # B7 roadmap
│   │   │   ├── pocs/        # POC tracker
│   │   │   ├── report/      # Report generator
│   │   │   └── export/      # Export (Excel/PDF)
│   │   ├── pocs/            # Cross-audit POC view
│   │   ├── roadmap/         # Cross-audit roadmap
│   │   ├── usecases/        # Cross-audit use case list
│   │   ├── admin/users/     # User management (admin only)
│   │   └── settings/        # User profile settings
│   ├── api/                 # RESTful API handlers
│   ├── auth/login/          # Public login page
│   └── audits/              # Audit list root
├── components/
│   ├── layout/              # Sidebar, TopBar, BlockProgressBar
│   └── ui/                  # Button, Badge, Modal, Select, etc.
├── lib/
│   ├── calculations.ts      # Sovereignty index, score calculation
│   ├── types.ts             # TypeScript domain types + constants
│   ├── api.ts               # Client-side fetch wrapper
│   ├── auth.ts              # JWT sign/verify
│   ├── llm.ts               # Mistral API wrapper
│   ├── mongodb.ts           # Connection pooling singleton
│   └── models/              # Mongoose schemas
├── context/                 # BreadcrumbContext, PageCodeContext
├── middleware.ts            # JWT verification + header injection
└── public/                  # Static assets
```

### 5.3 API Design Principles

- RESTful, resource-nested under `/api/audits/[auditId]/...`
- PATCH for partial updates (avoids full document replacement)
- `.lean()` for read-only queries (performance)
- `Promise.all([])` for parallel DB queries
- Error responses: `{ error: string }` with appropriate HTTP status

### 5.4 Authentication Flow

```
Client login → POST /api/auth/login
  → bcrypt verify password
  → issue access_token (8h) + refresh_token (7d) as httpOnly cookies
  → redirect to /dashboard

All requests → middleware.ts
  → verify access_token JWT
  → inject x-user-id, x-user-role, x-user-email, x-user-name headers
  → API routes read user from headers (no extra DB query)
```

---

## 6. Key Calculations

### 6.1 Sovereignty Index

```
sovereigntyIndex = avg(axisValues)  // green=5, amber=3, red=1
level: full_autonomy(≥4.5) | managed(≥3.5) | conditioned(≥2.5) | restricted(≥1.5) | critical
D5 score = ceiling(sovereigntyIndex / 5 bands)
```

### 6.2 Annual Saving per Use Case

```
timeSaved = sum(timeSavedPerProfile[i].hoursPerExecution)
avgRate = avg(process.b1.profiles[].hourlyRateEur)
annualReps = process.b3.annualRepetitions
annualSavingEur = timeSaved × avgRate × annualReps
```

### 6.3 ROI Breakeven

```
roiBreakevenMonths = estimatedInvestmentEur / (annualSavingEur / 12)
```

---

## 7. AI Features

| Feature | Trigger | Model | Input |
|---|---|---|---|
| Use case suggestions | B5 "Suggest with AI" | Mistral | B3 activities + B2 sovereignty axes |
| Sovereignty analysis | B2 "Analyze" | Mistral | B2 axis findings |
| Process report | B3 "Generate Report" | Mistral | B3 activity list |
| POC design auto-fill | POC "Fill with AI" | Mistral | Use case description + B2 |
| Compute cost refresh | Admin action | Mistral | All UC compute cost parameters |

---

## 8. Data Export

| Export | Format | Scope |
|---|---|---|
| Audit export | JSON/Excel | Full audit with all blocks |
| Process export | Excel | B1–B3 per process |
| Use case list | Excel | All UCs with scores |
| POC tracker | Excel | All POCs with phases |
| Report | Markdown (AI) | Executive summary per audit |

---

## 9. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing secret (must change from default!) |
| `MISTRAL_API_KEY` | Yes | Mistral AI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic SDK (not yet active) |
| `NEXT_PUBLIC_APP_URL` | No | App base URL for links |
| `NODE_ENV` | No | `development` / `production` |

---

## 10. Known Issues & Technical Debt

See [REVIEW.md](REVIEW.md) for the full deep-dive review. Summary:

| # | Issue | Severity | Area |
|---|---|---|---|
| 1 | `/api/seed` is publicly accessible (no auth required) | **Critical** | Security |
| 2 | `JWT_SECRET` has an insecure default value in middleware | **High** | Security |
| 3 | Raw error strings exposed in API responses | **High** | Security |
| 4 | Score classification logic duplicated (calculations.ts + audits/route.ts) | Medium | Code Quality |
| 5 | `computeCost: any` loses type safety in UseCase and POC | Medium | TypeScript |
| 6 | No input validation (Zod/Joi) on API routes | Medium | Robustness |
| 7 | `auditCode` generation has race condition under concurrent creates | Medium | Data Integrity |
| 8 | No pagination on list endpoints (scaling risk) | Medium | Performance |
| 9 | Debounce on scoring uses `setTimeout` without cleanup | Low | Performance |
| 10 | Score defaults to 3 when not set, masking unscored dimensions | Low | UX |
| 11 | B4 deprecated but still in model and type definitions | Low | Code Quality |
| 12 | Dashboard table too wide (11 columns) — poor on small screens | Low | UX |

---

## 11. Deployment

### Local (Dev)

```bash
npm install
cp .env.local.example .env.local  # add your keys
npm run dev                        # http://localhost:3000
```

### Docker Compose

```bash
docker-compose up --build
```

### Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ chars random)
- [ ] Move `/api/seed` behind auth or remove from PUBLIC_PATHS
- [ ] Configure MongoDB with authentication
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (reverse proxy: nginx / Caddy)
- [ ] Add rate limiting on `/api/auth/login`
- [ ] Configure MongoDB Atlas (or secured self-hosted) for production data

---

## 12. Roadmap (Platform Development)

| Priority | Feature | Notes |
|---|---|---|
| High | Input validation with Zod | All API POST/PATCH routes |
| High | Fix /api/seed security | Move behind auth middleware |
| Medium | Pagination on list endpoints | Audits, use cases, POCs |
| Medium | Full PostgreSQL migration | Script exists (`migrate_mongo_to_postgres.py`) |
| Medium | Viewer role enforcement | Currently role is stored but not checked in API routes |
| Medium | CSRF protection | Add `csurf` or double-submit cookie |
| Low | Rate limiting | `/api/auth/login` at minimum |
| Low | React Query integration | Replace manual `useEffect` + `fetch` patterns |
| Low | B4 removal from codebase | Deprecated, cleanup needed |
| Low | Mobile-responsive tables | Use card layout below 768px |
