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

## Recently Completed Features

### Edit Use Case Modal — Two-Phase Design (B5)
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

### AI Use Case Suggestions — Grader Recommendations (suggest-usecases/route.ts)
- **Grader Types** included in SYSTEM_PROMPT (lines 38-48):
  - Exact Match Grader (deterministic text comparison)
  - Regex Grader (format/pattern validation)
  - Semantic Similarity Grader (vectors & semantics)
  - LLM-as-a-Judge (global response quality)
  - Groundedness Grader (RAG vs retrieved context, hallucination detection)
  - Citation Grader (source & citation verification)
  - Hallucination Grader (unsupported claims, critical for RAG)

- **Expected output**: `requiredPreconditions.text` should include:
  ```
  ## Recommended Graders
  - [Grader Type]: justification based on AI types and architecture
  ```

## Current Issues Being Debugged

### FIX 1 — Target Steps Checkboxes Not Pre-Checking
- **Symptom**: When opening an existing use case in the modal, Target Steps checkboxes are not pre-checked
- **Hypothesis**: Saved `targetActivities` array contains activity **names** instead of activity **IDs**
- **Debug added**: Console log in SlideOver component shows:
  - `form.targetActivities` (what's loaded from DB)
  - B3 activities list with IDs
  - Mismatch will reveal if names ≠ IDs
- **Location**: `app/(app)/audits/[auditId]/processes/[procId]/b5/page.tsx` line ~188
- **Status**: Awaiting console log output to confirm hypothesis

### FIX 3 — Grader Recommendations Not Always Appearing
- **Symptom**: LLM output for `requiredPreconditions.text` may not include `## Recommended Graders` section
- **Root cause**: SYSTEM_PROMPT mentions Graders but instruction is vague; doesn't explicitly require inclusion for every UC
- **Fix needed**: Strengthen SYSTEM_PROMPT to explicitly state:
  ```
  "For EACH use case, based on its AI types and architecture,
   recommend 1-3 appropriate Grader(s) and include in requiredPreconditions.text"
  ```
- **Location**: `app/api/audits/[auditId]/ai/suggest-usecases/route.ts` lines 38-48
- **Status**: Awaiting feedback on LLM output quality before implementing

## Pending Refactor (IN PROGRESS)
A major refactor moving `projectType` from Audit to Process is pending with **16 files affected**:
- **Schemas**: Remove `projectType` from Audit; add `department` enum to Process
- **Validators**: Update audit/process validators; add `DEPARTMENT_TYPES` constant
- **API endpoints** (6): Update all TechPubs checks to use `process.department`
- **UI forms** (5): Remove projectType dropdowns; convert department field to enum dropdown
- **Seed data**: Remove projectType from audits; ensure processes have department set
- **Migration**: Create `scripts/fix-process-departments.ts` to set default department='Other' for existing processes

See git log for full analysis summary.

## Reference Files
- `/references/state-of-the-art.md` — TechPubs AI tools & infrastructure knowledge base
- `/references/techpubs-use-cases.md` — TechPubs use cases catalogue
- **NEVER auto-generate or overwrite these files** — human review only
