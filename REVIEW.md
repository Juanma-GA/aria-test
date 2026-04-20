# ARIA — Deep System Review
## Architecture · Code Quality · Security · UX/UI

> Reviewed: 2026-04-16 · Reviewer: Claude Code (automated deep review)

---

## Executive Summary

ARIA is a well-structured, domain-rich application with a clear methodology baked into the code. The core architecture (Next.js App Router + Mongoose + Zustand) is appropriate for the team size and use case. However, there are **two critical security issues** that must be fixed before any production deployment, several medium-severity code-quality issues that will accumulate debt, and a handful of UX patterns that reduce usability for consultants in the field.

---

## 1. Security Review

### CRITICAL-1 — `/api/seed` is publicly accessible

**File:** [middleware.ts:15](middleware.ts#L15)

```typescript
const PUBLIC_PATHS = ['/auth/login', '/api/auth/login', '/api/health', '/api/seed'];
```

`/api/seed` is in `PUBLIC_PATHS` — any unauthenticated user can POST to it and create demo data in the database. In production this would pollute the database with Airbus/Maritime/Railway demo records without any login.

**Fix:**

```typescript
const PUBLIC_PATHS = ['/auth/login', '/api/auth/login', '/api/health'];
// Remove /api/seed — it should require admin auth
```

Then in `app/api/seed/route.ts`, add a role guard:

```typescript
const role = req.headers.get('x-user-role');
if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

---

### CRITICAL-2 — `JWT_SECRET` has an insecure hardcoded default

**File:** [middleware.ts:4-6](middleware.ts#L4-L6)

```typescript
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'aria-secret-key-change-in-production-2025'
);
```

If `JWT_SECRET` is not set in the environment (forgotten `.env.local`), the app silently uses a predictable secret that anyone can find in this repository. An attacker could forge valid JWTs and impersonate any user.

**Fix:** Fail fast at startup rather than silently fall back:

```typescript
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
const SECRET = new TextEncoder().encode(jwtSecret);
```

---

### HIGH-1 — Raw error strings exposed in API responses

**File:** Every API route (e.g., [app/api/audits/route.ts:122](app/api/audits/route.ts#L122))

```typescript
} catch (err) {
  return NextResponse.json({ error: String(err) }, { status: 500 });
}
```

`String(err)` can expose stack traces, MongoDB connection strings, or internal structure details to the client. This appears in every single API route.

**Fix:** Log the full error server-side, return a generic message:

```typescript
} catch (err) {
  console.error('[API Error]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

---

### MEDIUM-1 — No rate limiting on authentication endpoint

`POST /api/auth/login` has no rate limiting. An attacker can brute-force credentials without restriction.

**Fix:** Add rate limiting middleware (e.g., `upstash/ratelimit`, or `next-rate-limit`). At minimum, add exponential backoff after 5 failed attempts per IP.

---

### MEDIUM-2 — No CSRF protection

The app uses cookie-based authentication but has no CSRF tokens. Any malicious site could trigger state-changing requests (PATCH, POST, DELETE) if the user is logged in.

**Fix:** Use the `SameSite=Lax` (or `Strict`) cookie attribute. Verify it is being set in `app/api/auth/login/route.ts`.

---

### LOW-1 — Viewer role not enforced in API routes

The `viewer` role is defined in the User model and stored in JWT, but no API route checks `if (role === 'viewer') return 403`. Viewers currently have full write access to all entities.

---

## 2. Architecture Review

### STRENGTH — Clean separation of concerns

The layering is correct: pages → API routes → Mongoose models → MongoDB. The middleware correctly decouples auth from business logic by injecting user metadata as headers. `lib/calculations.ts` centralizes core business math. `lib/types.ts` is the single source of truth for domain types.

---

### ARCH-1 — Score classification logic is duplicated

**Files:** [lib/calculations.ts:31-40](lib/calculations.ts#L31-L40) and [app/api/audits/route.ts:99-102](app/api/audits/route.ts#L99-L102)

The `calculateScore()` function exists in `calculations.ts`, but the audit list route re-implements the same threshold logic inline:

```typescript
// In api/audits/route.ts (duplicate of calculateScore())
const scoreTotal: number = Object.values(dims).reduce((s: number, d: any) => s + (d?.value ?? 0), 0);
const d6: number = (dims as any).d6_governanceComplexity?.value ?? 0;
if (scoreTotal >= 22 && d6 >= 4) { byCategory.quickWin++; ... }
else if (scoreTotal >= 14) { byCategory.midTerm++; ... }
```

If the scoring thresholds ever change (e.g., business rule update), they would need to change in two places, leading to inconsistency.

**Fix:** Import and use `calculateScore` from `calculations.ts`:

```typescript
import { calculateScore } from '@/lib/calculations';

// In the enrichment loop:
const dims = (uc as any).score?.dimensions;
if (dims) {
  const { category } = calculateScore(dims);
  byCategory[category === 'quick_win' ? 'quickWin' : category === 'mid_term' ? 'midTerm' : 'strategic']++;
}
```

---

### ARCH-2 — `computeCost: any` loses type safety

**File:** [lib/types.ts:221](lib/types.ts#L221) and [lib/types.ts:376](lib/types.ts#L376)

```typescript
computeCost?: any;  // UseCase
computeCost?: any;  // POC
```

The compute cost model is substantial (deployment model, GPU specs, token pricing, subscriptions). Using `any` defeats TypeScript's purpose and makes refactoring risky.

**Fix:** Extract a proper `ComputeCostConfig` interface and use it in both `UseCase` and `POC`.

---

### ARCH-3 — Race condition in `auditCode` generation

**File:** [app/api/audits/route.ts:133-134](app/api/audits/route.ts#L133-L134)

```typescript
const auditCount = await Audit.countDocuments({});
const auditCode = `AUD-${String(auditCount + 1).padStart(3, '0')}`;
```

Two concurrent `POST /api/audits` requests could read the same count and produce duplicate `AUD-001` codes. For a multi-consultant team this is a real risk.

**Fix:** Use MongoDB's `$inc` on a counter document, or use a unique sparse index on `auditCode` with retry logic. Same issue exists for `procId` generation.

---

### ARCH-4 — `GET /api/audits` loads the entire database

**File:** [app/api/audits/route.ts:14-18](app/api/audits/route.ts#L14-L18)

```typescript
const [audits, allPocs, allProcesses, allUseCases] = await Promise.all([
  Audit.find(auditFilter)...,
  POC.find({}).select('auditId phase').lean(),          // ALL pocs
  Process.find({}).select('auditId _id b1 b3').lean(),  // ALL processes
  UseCase.find({}).select(...).lean(),                   // ALL use cases
]);
```

This performs 4 full collection scans on every dashboard load. With 50+ audits this will noticeably degrade. The `POC.find({})` does not even filter by `auditFilter`, so archived audit data is always loaded.

**Fix:**
1. Filter all sub-queries to only audits matching `auditFilter`
2. Add pagination (e.g., limit 20 audits per page)
3. Consider a MongoDB aggregation pipeline to compute KPIs server-side

---

### ARCH-5 — No input validation on API routes

No API route uses a schema validation library (Zod, Joi, yup). `body.name`, `body.sector`, etc., are used directly from `await req.json()` without checking types or required fields. A malformed request can corrupt data or produce misleading validation errors from Mongoose.

**Fix:** Add Zod schemas for all POST/PATCH request bodies:

```typescript
import { z } from 'zod';
const CreateAuditSchema = z.object({
  name: z.string().min(1).max(200),
  client: z.string().min(1),
  sector: z.enum(['defence', 'aerospace', 'naval', 'railway', 'internal', 'other']),
  // ...
});
```

---

### ARCH-6 — `useEffect` + raw `fetch` instead of React Query

React Query is already installed (`@tanstack/react-query`). Most pages use raw `useEffect` + `fetch` + manual loading/error state:

```typescript
// Pattern repeated across ~15 page components
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch(`/api/audits/${auditId}/usecases`, { credentials: 'include' })
    .then(r => r.json())
    .then(setUseCases)
    .catch(...)
    .finally(() => setLoading(false));
}, [auditId]);
```

This misses caching, deduplication, background refresh, and retry that React Query provides for free.

**Fix:** Progressively migrate to `useQuery` hooks. Start with dashboard and scoring (most data-heavy pages).

---

## 3. Code Quality Review

### CODE-1 — `credentials: 'include'` scattered across all pages

The `lib/api.ts` wrapper already handles this centrally, but most pages bypass it and use raw `fetch(..., { credentials: 'include' })` directly. This is inconsistency that will bite if the auth mechanism ever changes.

**Fix:** Enforce usage of `lib/api.ts` request wrapper. The scoring page alone has 3 direct fetch calls.

---

### CODE-2 — Scoring debounce leaks timers

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:109](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L109)

```typescript
setTimeout(() => saveScore(ucId, updated.score), 1000);
```

`setTimeout` is called inside `setUseCases` on every keystroke without being cleared. If a user changes a score 10 times quickly, 10 timers are queued and 10 API calls will fire.

**Fix:** Use `useRef` + `clearTimeout` pattern, or use a debounce utility:

```typescript
const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

const updateDimension = (ucId: string, dimKey: string, value: ScoreValue) => {
  clearTimeout(timerRef.current[ucId]);
  setUseCases(prev => prev.map(u => { /* ... */ return updated; }));
  timerRef.current[ucId] = setTimeout(() => saveScore(ucId, updatedScore), 1000);
};
```

---

### CODE-3 — Score default value of 3 masks unscored state

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:200](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L200)

```typescript
value={dim?.value || 3}
```

When a dimension hasn't been scored, the select shows "3" — making it look like it was deliberately scored as "moderate". The status column partially compensates with "Incomplete" but the table total will still compute (incorrectly) as if 3 is the intended value.

**Fix:** Show a visible "–" or "?" state for unscored dimensions. Either render a different control or use `value={dim?.value ?? ''}` with a placeholder option.

---

### CODE-4 — B4 dead code throughout codebase

B4 (Friction Analysis) is marked as deprecated in the UI but the full type definitions, Mongoose schema fields, and seed data remain active. This creates confusion for new developers.

**Fix:** If B4 will never return, remove:
- `B4_Friction`, `PainPoint`, `BaseMetrics` types from `types.ts`
- `b4` field from `Process` Mongoose schema
- B4 routes and seed data
- The `b4` comment references

If B4 might return, add a `// DEPRECATED:` doc comment to make intent clear.

---

### CODE-5 — `TooltipHeader` duplicates the `Tooltip` component

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:43-62](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L43-L62)

A custom hover-based tooltip is implemented inline (`useState(show)` + absolute div) when `components/ui/tooltip.tsx` already wraps Radix's accessible tooltip. The custom one lacks keyboard focus handling and ARIA attributes.

**Fix:** Use `<Tooltip>` from `@/components/ui/tooltip` instead.

---

### CODE-6 — `procId` in UseCase is not in the type

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:186](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L186)

```typescript
<Badge variant="amber">{(uc as UseCase & { procId?: string }).procId || '—'}</Badge>
```

The `procId` field is cast via intersection type (`UseCase & { procId?: string }`) — meaning the API returns it but the type doesn't declare it. This is a TypeScript smell.

**Fix:** Add `procId?: string` to the `UseCase` interface in `types.ts`, or create a separate `UseCaseWithProcess` type for the scoring page context.

---

## 4. UX/UI Review

### UX-1 — Dashboard table has 11 columns — cognitive overload

**File:** [app/(app)/dashboard/page.tsx:437-511](app/(app)/dashboard/page.tsx#L437-L511)

The audit table renders: Audit · Client · Status · Sector · Procs · People · UCs · POCs · Annual Saving · Categories · Updated = **11 columns**. On a 1280px screen this becomes illegible. The `Categories` column uses 9px font and abbreviations (`QW ×2`, `MT ×1`) that require training to decode.

**Recommendations:**
- Collapse POC sub-phase micro-labels into the POC count cell tooltip
- Move `Categories` column into an expandable row detail
- Add a column visibility toggle so consultants can focus on what matters
- Make table rows clickable (entire row → audit detail), not just the title

---

### UX-2 — Score input is a plain `<select>` — poor interaction

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:23-36](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L23-L36)

The scoring matrix is the most critical input surface in the app. Each dimension uses a plain `<select>` (browser-native dropdown), which:
- Requires two interactions (click → select option) vs. one click on a button
- Doesn't show the rubric description inline
- Hides the justification field (exists in the model, never surfaced in the table)

**Recommendations:**
- Replace `<select>` with 5 small clickable buttons (1–5) per dimension
- Show the rubric description as a hover tooltip directly on the score button
- Add an expandable "justification" textarea per row below the score buttons
- Add a "Score all" keyboard shortcut (Tab through cells)

---

### UX-3 — No breadcrumb on B-block pages

Navigating to `/audits/abc123/processes/xyz456/b3` gives no visual context about which audit or process you're in. The sidebar shows the tree but the top bar only shows a generic title.

**Recommendation:** Use the existing `BreadcrumbContext` (already in `context/`) consistently across all B-block pages: `Dashboard > Airbus UC1 > Process: Offer Drafting > B3 Process Map`.

---

### UX-4 — Auto-save indicator is not globally consistent

Some pages have the `<SaveIndicator>` component, others save on form blur/submit with no feedback. The scoring page shows `"Saving…"` per row, B1/B2/B3 forms have their own patterns. Users can't tell if unsaved changes are at risk when navigating away.

**Recommendation:** Implement a global dirty-state guard: warn on navigation if there are unsaved changes (`useBeforeUnload` + `beforePopState`). Standardize `<SaveIndicator>` positioning across all forms.

---

### UX-5 — Score default of 3 makes "Incomplete" status ambiguous

When use cases appear in the scoring table before any score is given, they show a total of 18 (6 × 3) and category "Mid-term". Users may not notice the "Incomplete" status column and think UCs are already categorized. Related to CODE-3.

**Recommendation:** Show all unscored dimensions with a gray placeholder (`–`) and a total of `?`. Only show the category badge once all 6 dimensions have explicit values.

---

### UX-6 — New audit wizard requires a process to be created upfront

**File:** [app/(app)/audits/new/page.tsx](app/(app)/audits/new/page.tsx)

The new audit creation form requires entering a first process name immediately. This couples two distinct mental tasks (defining the audit scope vs. the first process). Some consultants may not know the process names at audit creation time.

**Recommendation:** Make the first process optional in the creation form. Allow creating an audit with 0 processes and add them later from the audit detail page.

---

### UX-7 — "Blocked" use cases disappear from scoring silently

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:79-81](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L79-L81)

```typescript
setUseCases(Array.isArray(ucs) ? ucs.filter((u: UseCase) => u.status !== 'blocked') : []);
```

Blocked use cases are silently filtered out of the scoring page with no indication of how many were excluded. A consultant reviewing scores won't know there are blocked UCs elsewhere.

**Recommendation:** Show a banner: `2 use cases are blocked and excluded from scoring. View them →`.

---

### UX-8 — Mobile is not usable

The app uses `overflow-x-auto` on tables but has no proper mobile layout. The sidebar is a fixed-width left panel, tables have 8–11 columns, and form inputs don't adapt to touch. While this may be acceptable for a desktop-only internal tool, it should be documented as a known limitation.

**Recommendation:** Either document mobile as unsupported, or add responsive card layouts below 768px breakpoint for the dashboard and scoring pages.

---

## 5. Performance Review

### PERF-1 — Dashboard full-table scan on every load

See ARCH-4. The 4-collection parallel scan is the biggest performance risk. Already flagged.

---

### PERF-2 — Scoring page fetches all use cases per load, no cache

**File:** [app/(app)/audits/[auditId]/scoring/page.tsx:76-84](app/(app)/audits/%5BauditId%5D/scoring/page.tsx#L76-L84)

Every time the scoring page mounts, it re-fetches all use cases and processes. With React Query this would be cached for 30–60 seconds and shared across components.

---

### PERF-3 — No `loading.tsx` for page transitions

Next.js App Router supports `loading.tsx` files for automatic Suspense-based loading UI. Currently pages use manual `useState(loading)` + render-blocking spinners. Adding `loading.tsx` at the route segment level would improve perceived performance.

---

## 6. Summary Table

> Status updated 2026-04-20 after executing the 4-sprint plan.
> Legend: ✅ Resolved · 🟡 Partially addressed · ⏳ Not done

| # | Finding | Severity | Category | Effort | Status |
|---|---|---|---|---|---|
| CRITICAL-1 | `/api/seed` publicly accessible | Critical | Security | 5 min | ✅ |
| CRITICAL-2 | `JWT_SECRET` insecure default | Critical | Security | 10 min | ✅ |
| HIGH-1 | Raw error strings in API responses | High | Security | 30 min | ✅ |
| ARCH-1 | Score classification duplicated | Medium | Architecture | 30 min | ✅ |
| ARCH-2 | `computeCost: any` type | Medium | TypeScript | 1h | ✅ |
| ARCH-3 | `auditCode` race condition | Medium | Data Integrity | 1h | ✅ |
| ARCH-4 | Full DB scan on dashboard load | Medium | Performance | 2h | ✅ |
| ARCH-5 | No input validation (Zod) | Medium | Robustness | 4h | ✅ |
| ARCH-6 | React Query not used | Low | DX | 4h | ⏳ |
| CODE-1 | `credentials: 'include'` scattered | Low | Code Quality | 2h | ⏳ |
| CODE-2 | Debounce timer leak in scoring | Low | Performance | 1h | ✅ |
| CODE-3 | Score defaults to 3 (misleading) | Low | UX/Logic | 30 min | ✅ |
| CODE-4 | B4 dead code remains | Low | Code Quality | 1h | ✅ |
| CODE-5 | Custom tooltip vs Radix Tooltip | Low | Code Quality | 30 min | ✅ |
| CODE-6 | `procId` missing from UseCase type | Low | TypeScript | 10 min | ✅ |
| MEDIUM-1 | No rate limiting on login | Medium | Security | 2h | ✅ |
| MEDIUM-2 | No CSRF protection | Medium | Security | 1h | 🟡 |
| UX-1 | Dashboard 11 columns = overload | Medium | UX | 2h | ✅ |
| UX-2 | Score input = plain select | Medium | UX | 3h | ✅ |
| UX-3 | No breadcrumb on B-block pages | Low | UX | 1h | ✅ |
| UX-4 | Auto-save not globally consistent | Low | UX | 2h | ✅ |
| UX-5 | Unscored UCs show fake "Mid-term" | Low | UX | 1h | ✅ |
| UX-6 | New audit requires process upfront | Low | UX | 1h | ✅ |
| UX-7 | Blocked UCs silently excluded | Low | UX | 30 min | ✅ |
| UX-8 | Mobile unusable | Low | UX | 8h | 🟡 |

**Notes on outstanding items:**
- **ARCH-6 / CODE-1**: React Query migration deferred — `@tanstack/react-query` is installed but the 18 components still call `fetch` with `credentials: 'include'`. Functional, but the DX/caching benefits remain unrealised.
- **MEDIUM-2 (CSRF)**: cookies are `httpOnly` + `sameSite: 'lax'`, which blocks the common cross-site POST vector. A dedicated CSRF-token layer was not added.
- **UX-8 (mobile)**: not fixed, but users are now warned with a sticky "desktop only" banner below 1024px; `spec.md` documents the policy.

---

## 7. Recommended Fix Order

### Sprint 1 — Must fix before production (1 day)

1. **CRITICAL-1**: Remove `/api/seed` from `PUBLIC_PATHS`, add admin guard
2. **CRITICAL-2**: Throw on missing `JWT_SECRET`
3. **HIGH-1**: Sanitize all API error responses

### Sprint 2 — Code quality stabilization (1 week)

4. **ARCH-1**: Remove duplicated scoring logic in `api/audits/route.ts`
5. **CODE-2**: Fix scoring debounce timer leak
6. **CODE-3**: Fix score default of 3 masking unscored state
7. **CODE-6**: Add `procId` to `UseCase` type
8. **ARCH-2**: Type `computeCost` properly

### Sprint 3 — UX improvements (2 weeks)

9. **UX-7**: Show blocked UC count banner on scoring page
10. **UX-3**: Add breadcrumb to all B-block pages
11. **UX-2**: Replace score selects with 1–5 button group
12. **UX-5**: Hide category badge until all dimensions are scored
13. **UX-1**: Reduce dashboard columns, add row-click navigation

### Sprint 4 — Architecture & scalability (1 month)

14. **ARCH-3**: Fix auditCode race condition
15. **ARCH-4**: Add pagination + filter sub-queries in dashboard endpoint
16. **ARCH-5**: Add Zod validation to all API routes
17. **MEDIUM-1**: Add rate limiting on auth
18. **ARCH-6**: Migrate page data fetching to React Query
