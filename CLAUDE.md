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

## What We're Working On

**Status: STABLE** — All major features completed. Project is in production-ready state pending new feature requests.

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
