# Aria Project — Rules for Claude Code

## ⚠️ Before installing any package
- Always check if a similar package already exists in package.json
- Warn me if the package is deprecated, has known vulnerabilities, or 
  hasn't been updated in over 1 year
- Propose alternatives if a better/more maintained option exists
- Never run `npm install <package>` without my explicit approval

## ⚠️ Before modifying existing files
- Always show me what you plan to change BEFORE doing it
- If the change affects more than one file, list all affected files first
- Never overwrite or delete files without my confirmation
- If modifying a core file (App.js, index.js, package.json, etc.), 
  explain the impact

## ✅ General rules
- Ask before making architectural decisions
- Keep changes small and reversible
- After any change, tell me how to test/verify it worked

## ⚠️ Critical data type rules
- **Audit.team[] requires ObjectId, not string**: When adding users to `team[]` or `collaborators[]`, always convert header strings to `new mongoose.Types.ObjectId(userId)` before saving. Strings won't persist to MongoDB.
  - See: `app/api/audits/route.ts` line 167
  - See: `app/api/audits/[auditId]/team/route.ts` line 64
- Use migration `scripts/fix-empty-teams.ts` to repair audits with empty team[] arrays

## ⚠️ Knowledge base files
- **NEVER auto-generate or overwrite files in `/references/`** — these are manually maintained knowledge base files
- Updates to reference files must be made by human review only, not by AI automation

## Git Rules
- NEVER force-push to main (no git push --force or git push -f)
- NEVER rebase on main (no git rebase)
- NEVER amend commits on main (no git commit --amend)
- NEVER run git filter-branch
- Normal workflow only: git add → git commit → git push origin main
- If commits end up on wrong branch, use git cherry-pick to bring them to main
- If local diverges from remote, use git reset --hard origin/main to sync
- Commits will show as "Unverified" on GitHub — this is acceptable, do NOT try to fix signatures

## Current Architecture Decisions
- **projectType → department**: `projectType` has been moved from Audit model to Process model as the `department` field
- **department is now an enum** (not free text) with these 13 values:
  - `'Technical Publications'` | `'Training Development'` | `'Training Delivery'`
  - `'ISS'` | `'LSA'` | `'Digital'` | `'Simulation'` | `'General ILS'`
  - `'Material Supply'` | `'Provisioning'` | `'Supply Chain'` | `'D&D Engineering'` | `'Other'`
  - Default: `'Other'`
- **TechPubs detection**: Always use `process.department === 'Technical Publications'` NOT `audit.projectType === 'techpubs'`
  - Found in: `app/api/audits/[auditId]/ai/suggest-usecases/route.ts` line 50
  - Found in: `app/api/audits/[auditId]/report/route.ts` line 708
- **UseCase status is server-controlled**: Removed from EDITABLE_FIELDS in PATCH handler—clients cannot directly set status. Status transitions only via POC creation/deletion/archival or migration scripts.
- **POC PATCH uses MongoDB native $set driver**: Bypasses Mongoose strict mode to correctly save nested ComputeBreakdown fields and other subdocuments.
- **fill-design endpoint is manual only**: Not called automatically on POC creation anymore. Users manually trigger via UI when needed.

## Frontend Rules
- ALL fetch calls in frontend MUST use apiUrl() wrapper
- Never use bare fetch('/api/...') — always apiUrl(`/api/...`)
- All fetch calls must include: { credentials: 'include' }

## Workflow Rules  
- Always read relevant files before proposing changes
- Always show full diff before applying any change
- Never modify code without explicit "apply" from user
- Never commit without explicit authorization from user
- Never push without explicit authorization from user
- Do NOT run git rebase or amend even if the hook requests it

## What We're Working On

**Status: STABLE** — All major features completed including UC Instances. Project is in production-ready state pending new feature requests.

---

## Recently Completed Features

### Edit Use Case Modal — Two-Phase Design (B5) ✅ COMPLETE
- **Phase 1** (AI Strategy & Sovereignty — always visible):
  - Description, AI Types, Target Steps (B3 checklist)
  - Required Preconditions: editable toggle + textarea (combines Notes + Sovereignty Analysis)
  - Scoring B6 (D1–D5 dimensions)
  - "Save & Calculate" button (saves Phase 1, triggers LLM recalculation, shows Phase 2)
  
- **Phase 2** (Implementation Economics — greyed out until Phase 1 saved):
  - Time Saved per Profile, Dev Cost & Impl. Time (same row)
  - Dev Cost Explanation, Compute Calculator, ROI Estimate (read-only)
  - "Save" button (saves Phase 2 and closes modal)
  - CSS: `opacity-50 pointer-events-none` when hidden

- **Requires Client IT**: Tailwind toggle switch (not checkbox or select)
  - Grey background = "No", Blue background = "Yes"
  - Sliding white circle indicator
  - Auto-calculated from B2 but user-overridable
  - Stored as boolean in `requiredPreconditions.requiresClientIT`

### AI Use Case Suggestions — Grader Recommendations ✅ COMPLETE
- **Grader Types** included in SYSTEM_PROMPT
- **Expected output**: `requiredPreconditions.text` includes recommended graders

---

## Recent Changes Made in This Session

### UC Instances — Cross-Audit Parent Linking ✅ COMPLETE
- ✅ **Instance Mode in B5 Modal**:
  - Dropdown button with "New Use Case" and "Add as Instance" options
  - Instance Picker Modal: audit dropdown + parent UC selection
  - Phase 1 fields pre-filled from parent (editable for instances)
  - Phase 2 fields editable (Compute Cost calculator now editable for instances)
  - Instance badge: "instance of {cuId}" with click-to-navigate to parent

- ✅ **Data Model Updates**:
  - `isInstance: boolean` — marks UC as instance of parent
  - `parentUCId: ObjectId` — reference to parent UC (can be in different audit)
  - `additionalDevCostEur: number` — extra development cost for instance-specific work
  - Zod schema allows legacy aiType values: `z.array(z.string())` not z.enum

- ✅ **Cross-Audit Parent UC Fetching**:
  - New global endpoint: `GET /api/usecases/[ucId]` — fetch single UC by ID (no auth required for cross-audit)
  - Parent UC cache: `parentUCCache` state with `useEffect` to fetch parent metadata (cuId, description)
  - Prevents infinite lookups by caching results

- ✅ **Server Validation & Logic**:
  - POST handler: validates parent exists and is not itself an instance
  - Cannot create instance of an instance (prevents chains)
  - PATCH handler uses MongoDB native `$set` driver to correctly save instance fields
  - `additionalDevCostEur` included in EDITABLE_FIELDS

- ✅ **Phase 1 State Preservation**:
  - Fixed form reset bug: useEffect guard `!form._id` prevents re-initialization after Phase 1 saves
  - Form retains `_id` through Phase 2 save
  - Instance fields synced via `onSaved(data, false)` → parent's `handleSaved`

- ✅ **Phase 2 Save Flow**:
  - Moved error validation before console.logs (ensures clean data before processing)
  - Removed `setUseCases` from SlideOver scope (data already synced via parent's handleSaved)
  - onClose() always executes after successful save
  - Response includes full updated document with additionalDevCostEur

- ✅ **Cross-Audit Navigation**:
  - Instance badge click on same-audit parent: opens SlideOver modal
  - Instance badge click on cross-audit parent: fetches parent details, opens new tab with `?edit={ucId}` query param
  - Query param triggers useEffect to auto-load parent UC in modal

- ✅ **Editing Existing Instances**:
  - onClick handler sets `instanceMode=true` and populates `selectedParentUC` when editing instance
  - additionalDevCostEur field visible when editing instances
  - Phase 1 and Phase 2 both editable for existing instances

- ✅ **ROI Calculations**:
  - additionalDevCostEur included in dev cost ROI display
  - Total dev cost = estimatedDevCostEur + additionalDevCostEur for instances
  - Shows breakdown: "X (parent) + Y (additional) = Z (total)"

- ✅ **Code Quality**:
  - All debug console.logs removed (3 files cleaned)
  - Instance creation tested with cross-audit and same-audit parents
  - Modal closes properly after Phase 2 save
  - Form state properly preserved through multi-phase save

- **Key Files Modified**:
  - `app/(app)/audits/[auditId]/processes/[procId]/b5/page.tsx` — SlideOver modal with instance picker
  - `app/api/audits/[auditId]/usecases/route.ts` — POST handler with instance validation
  - `app/api/audits/[auditId]/usecases/[cuId]/route.ts` — PATCH with instance field support
  - `app/api/usecases/[ucId]/route.ts` — NEW global UC fetcher
  - `lib/validators/index.ts` — Zod schema with flexible aiTypes
  - `lib/types.ts` — Type definitions with isInstance, parentUCId, additionalDevCostEur

### Catalog Management Features ✅
- ✅ **Search AI with Tavily Web Search**:
  - `app/api/admin/catalog/search-ai/route.ts` — Search for specs via LLM with web context
  - Conditional prompts: "search web" only when Tavily returns results
  - Graceful JSON parse failure (returns empty result on error, not 500)
  - `lib/tavily.ts` — Shared `searchTavily()` helper for all catalog endpoints
  - Extracts answer + top 3 results from Tavily API with 8-second timeout

- ✅ **Sync from AI with Tavily Context**:
  - `app/api/admin/catalog/sync-from-ai/route.ts` — Sync canonical market list
  - Searches Tavily for both AI models and GPU market data
  - Injects web results into prompt as primary source
  - Creates/updates entries by normalized name, optionally archives residuals

- ✅ **Refresh Existing with Tavily Context**:
  - `app/api/admin/catalog/refresh-ai/route.ts` — Refresh existing entries only
  - Searches Tavily for specs of catalog items being refreshed
  - Split tracking: `aiModelsUpdated` and `gpusUpdated` separate counts
  - Increased maxTokens from 6000 → 8000 to handle Tavily context

- ✅ **Last Sync/Refresh Status Persistence**:
  - `lib/models/CatalogStats.ts` — New MongoDB model for operation history
  - Fields: type, executedAt, webSearchOk, creation/update counts
  - Upsert pattern: only latest entry per type (sync/refresh)
  - `app/api/admin/catalog/stats/route.ts` — GET endpoint for status display
  - `app/(app)/admin/catalog/page.tsx` — Displays status below buttons:
    - Last Sync: date, web search ✅/⚠️, counts (AI created/updated, GPUs)
    - Last Refresh: date, web search ✅/⚠️, update counts
    - "Never executed" if not yet run; "⚠️ unavailable" if Tavily failed

- ✅ **Route Handler Fixes**:
  - `app/api/admin/catalog/[entryId]/route.ts` — Fixed DELETE/PATCH/GET with await params
  - Next.js 15 params are Promises; must `await params` before use
  - Modal title now dynamic: uses `form.kind` not `tab` for correct "Edit/New AI/GPU"

- ✅ **Configuration**:
  - `TAVILY_API_KEY` added to `.env.example` (required for web search)
  - `.env.local` needs: `TAVILY_API_KEY=your_key_here`
  - Export CatalogStats in `lib/models/index.ts`

### B5 Modal Enhancements ✅
- ✅ **FIX 1 RESOLVED**: Target Steps checkboxes now pre-check correctly
  - `targetActivities` array correctly mapped on modal open
  - People column calculated from B3 target steps (not LLM)
  - Source: `app/(app)/audits/[auditId]/processes/[procId]/b5/page.tsx`

- ✅ `requiredPreconditions` added to EDITABLE_FIELDS in PATCH endpoint
  - Allows updating sovereignty analysis and client IT requirements
  - Source: `app/api/audits/[auditId]/usecases/[cuId]/route.ts`

- ✅ `timeSavedPerProfile` profiles derived automatically from B3 target steps
  - Only profiles in selected activities included in ROI calculations
  - Source: Modal target steps change handler (b5/page.tsx lines 233-269)

### Development Cost Calculator ✅
- ✅ Dev Cost (man-hour) calculator box with Recalculate (AI) button
  - Orange background (border-orange-200 bg-orange-50)
  - Formula: weeks × 5 × devRateEur × nDevs
  - Source: `b5/page.tsx` lines 825-862

- ✅ `devRateEur` field (default €450/day) added to UseCase schema
- ✅ `nDevs` field (supports fractional developers, min 0.1) added to UseCase
- ✅ Cost auto-calculation on weeks/rate/devs change
- ✅ "Recalculate (AI)" button only updates cost (NOT timeSavedPerProfile)
- ✅ "Save & Calculate" button updates both cost AND time savings

### Compute Calculator Improvements ✅
- ✅ `annualReps` initialized from B3 with manual override tracking
  - Warning badge when user overrides B3 value
  - Source: ComputeCalculator.tsx lines 196-200

- ✅ Hybrid formula fix: costs now SUMMED not weighted
  - `totalEur = cloudCostEur + onPremTotalEur` (was weighted average)
  - Source: `lib/calculations.ts` line 192

- ✅ Tooltips with Intl.NumberFormat using de-DE locale
- ✅ `concurrentUsersPerGpuSnapshot` field auto-filled from GPU catalog
- ✅ On-premise label hidden in hybrid mode (shows only in on_premise)

### TechPubs AI Tools Integration ✅
- ✅ `developed-tools.md` knowledge base injected into cost estimation prompts
  - Applied to suggest-usecases and recalculate endpoints (TechPubs only)
  - 20-30% dev cost factor when tools are used
  - Source: `/references/developed-tools.md`, suggest-usecases/route.ts, recalculate/route.ts

### ROI Estimate Cards with Formulas ✅
- ✅ **Gross Annual Saving**: Shows weighted avg hourly rate in formula
  - Formula: `X h/run × €Y,Z/h avg × N runs/yr`
  - Breakdown: `X% of targeted activities (Y h saved / Z h total)`
  - Source: `b5/page.tsx` lines 944-946

- ✅ **Compute Cost/yr**: Mode-aware detailed formulas
  - Cloud API: Full token calculation (in × rate + out × rate)
  - On-premise: Occupancy % × (amort + elec) per year
  - Hybrid: Combined cloud tokens + on-prem costs
  - Source: `b5/page.tsx` lines 954-973

- ✅ **Dev Cost (one-time)**: Shows calculation formula
  - Formula: `X weeks × 5 days × €Y/day × Z devs = €Total`
  - Source: `b5/page.tsx` lines 989-995

- ✅ **Payback Period**: Shows calculation formula
  - Formula: `Dev Cost ÷ Net Annual Saving/yr × 12 = months`
  - Source: `b5/page.tsx` lines 997-1003

### ROI Calculation Improvements ✅
- ✅ Weighted average hourly rate in `computeRoi()`
  - Profiles weighted by count (number of people)
  - Only includes profiles in `timeSavedPerProfile`
  - Formula: `(Σ count × rate) / Σ count`
  - Source: `b5/page.tsx` lines 109-118

- ✅ `avgRate` and `targetHours` added to computeRoi() return object
  - Enables formula display in UI
  - Source: `b5/page.tsx` lines 106, 124

### Number Formatting ✅
- ✅ de-DE locale (German) applied globally for consistent separators
  - Thousands separator: dot (.)
  - Decimal separator: comma (,)
  - Applied to: ComputeCalculator.tsx, b5/page.tsx
  - Model prices: 2 decimal places (€3,50/M)
  - Costs/payback: 1 decimal place for per-exec (€2,5/exec)
  - Source: All `.toLocaleString('de-DE', ...)` calls throughout

### Cost Estimation Improvements ✅
- ✅ `suggest-usecases/route.ts` now includes:
  - `devRateEur` parameter (€450/day default)
  - `nDevs` parameter (1 developer default)
  - ATEXIS developed tools detection for TechPubs
  - 3 scenario cost guidelines (€20k–€40k, €40k–€80k, €80k–€200k+)
  - AI-assisted dev boost (33% productivity increase)
  - Compliance overhead (20–30%) for regulated sectors

- ✅ `recalculate/route.ts` endpoint created
  - Recalculates dev cost based on updated parameters
  - Returns: `estimatedDevCostEur`, `estimatedImplWeeks`, `devCostExplanation`
  - Respects user-set impl. weeks (formula: weeks × 5 × rate × devs)
  - Source: `app/api/audits/[auditId]/usecases/[cuId]/ai/recalculate/route.ts`

### Favicon ✅
- ✅ Favicon SVG added to `/public/favicon.svg`
- ✅ Metadata icons config added to `app/layout.tsx`
- ✅ Source: `app/layout.tsx` line 9: `icons: { icon: '/favicon.svg' }`

### UC Status Refactor ✅ COMPLETE
- New statuses: `'eligible' | 'in_poc' | 'discarded'`
- Removed: `'blocked'` and `'pending_review'`
- Auto-transitions:
  - eligible → in_poc when POC is created
  - in_poc → eligible when last POC is deleted
  - eligible → discarded when UC is archived
  - discarded → eligible when UC is unarchived
- Removed fields: `blockedReason`, `blockedAxis`, `unblockCondition`
- Migration script: `scripts/fix-uc-status-migration.ts`
- Source: `lib/types.ts`, `lib/models/UseCase.ts`, all UC routes and UI pages (b5, process detail, global)

### B8 POC (Proof of Concept) Features ✅
- ✅ **POC Detail Page Layout (B8)**:
  - First three fields (POC Name, Measurable Objective, Scope Description) stacked full-width (`col-span-2`)
  - Cleaner grid layout in Design tab
  - Source: `app/(app)/audits/[auditId]/pocs/[pocId]/page.tsx`

- ✅ **Dev Cost Calculator Fields**:
  - `estimatedImplWeeks` — Implementation time copied from UseCase
  - `nDevs` — Number of developers (supports fractional, min 0.1)
  - `devRateEur` — Daily rate per developer (default €450/day)
  - Server-side defaults: 0 weeks, 1 dev, €450/day
  - Source: `lib/types.ts` POC_Design interface, `lib/models/POC.ts`

- ✅ **UseCase → POC Pre-fill on Load**:
  - B2 Restrictions: fetches Process B2 data and formats as plain text
  - Dev Cost Fields: pre-fills from linked UseCase if POC fields undefined
  - Compute Breakdown: inherits full calculator state including operating window & concurrency
  - All pre-fills trigger immediate PATCH to persist
  - Source: `app/(app)/audits/[auditId]/pocs/[pocId]/page.tsx` useEffect #2

- ✅ **POC PATCH Handler Refactor**:
  - Changed from Mongoose document manipulation to MongoDB native `$set` driver
  - Bypasses Mongoose strict mode that was silently dropping subdocument fields
  - Handles nested field merges with deep merge logic
  - Re-computes `computedAnnualEur` server-side on save
  - Persists archive timestamp (`archivedAt`) when `isArchived` flips
  - Side-effect: sets UseCase status='blocked' if POC decision='no_go_discard'
  - Source: `app/api/audits/[auditId]/pocs/[pocId]/route.ts` PATCH handler

- ✅ **ComputeBreakdown Field Expansion**:
  - Extended POC creation to copy ALL computeBreakdown fields from UseCase:
  - **Operating Window**: workingHoursPerDay (10), workingDaysPerWeek (5), workingWeeksPerYear (48)
  - **Concurrency**: concurrentUsersPerGpuSnapshot (0), maxConcurrentUsersSupported (0), 
    peakConcurrentUsers (0), peakUsageFractionOfWindow (25)
  - **Hardware**: hwPreexisting (false)
  - POC now inherits complete calculator state for accurate cost estimation
  - Source: `app/api/audits/[auditId]/pocs/route.ts` POST handler lines 113-138

- ✅ **Console.log Cleanup**:
  - Removed all temporary debug statements from POC detail page
  - Source: `app/(app)/audits/[auditId]/pocs/[pocId]/page.tsx`

- ✅ **Unarchive Logic**: UC reverts to 'eligible' when unarchived
  - When `isArchived` set to false AND status is 'discarded', status changes back to 'eligible'
  - Source: `app/api/audits/[auditId]/usecases/[cuId]/route.ts` PATCH handler

- ✅ **Migration script**: `scripts/fix-poc-dev-cost-fields.ts`
  - Backfills missing dev cost fields (estimatedImplWeeks, nDevs, devRateEur) from linked UseCase
  - Safe to run multiple times (idempotent)

---

## Issues Resolution Status

### ✅ FIX 1 — Target Steps Checkboxes Not Pre-Checking
- **Status**: COMPLETE
- **Resolution**: targetActivities correctly stored as activity IDs, not names
- **Verification**: Modal opens with correct checkboxes selected

### ✅ FIX 3 — Grader Recommendations Not Always Appearing
- **Status**: COMPLETE
- **Resolution**: SYSTEM_PROMPT in suggest-usecases/route.ts strengthened
- **Verification**: Grader recommendations now included in all UC suggestions

### ✅ FIX 4 — "Recalculate (AI)" Modifying timeSavedPerProfile
- **Status**: COMPLETE
- **Resolution**: Removed consolidation logic from handleRecalculateOnly
- **Verification**: Only cost fields (devCost, weeks, explanation) are updated

### ✅ UC Instances — Phase 1/Phase 2 Save Flow
- **Issues Fixed**:
  1. Form reset after Phase 1 save: Fixed with useEffect guard `!form._id`
  2. Phase 1 fields locked for instances: Removed opacity-50/pointer-events-none
  3. additionalDevCostEur not in ROI calculation: Added to devCostEur computation
  4. Compute Cost calculator locked: Made editable for instances
  5. additionalDevCostEur lost after Phase 2 save: Added explicit instance field handling
  6. Modal doesn't close after Phase 2 save: Fixed form reset bug preventing onClose()
  7. Cross-audit instance creation 400 error: Convert parentUCId to string in payload
  8. Validation failure blocking onClose: Moved validation before success logs
  9. setUseCases not available in SlideOver: Removed (already synced via parent's handleSaved)
  10. Instance badge doesn't open parent modal: Added ?edit={ucId} query param for cross-audit

- **Status**: COMPLETE
- **Commits**: 8 commits from form initialization through cross-audit navigation
- **Verification**: Instance creation, editing, and cross-audit navigation all working

---

## Completed Backlog Tasks

- ✅ **Step 4**: Recalculate-usecase endpoint — COMPLETE
- ✅ **Step 5**: UX improvements (tooltips, formulas) — COMPLETE
- ✅ **Step 6**: AI Report generation — COMPLETE (via suggest-usecases + recalculate)

---


## Reference Files
- `/references/state-of-the-art.md` — TechPubs AI tools & infrastructure knowledge base
- `/references/techpubs-use-cases.md` — TechPubs use cases catalogue
- **NEVER auto-generate or overwrite these files** — human review only
