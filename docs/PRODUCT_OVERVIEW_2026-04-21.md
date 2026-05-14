---
document: Product Overview
product: ARIA — IA Audit Tool
version: 0.1.0
generated: 2026-04-21T09:55+02:00
audience: stakeholders, new team members, pre-sales
---

# ARIA — IA Audit Tool · Product Overview

## What it is

**ARIA** (IA Audit Tool) is an internal web platform used by ATEXIS consultants to run end-to-end AI-opportunity audits for clients in regulated sectors (defence, aerospace, naval, railway, internal). It replaces the spreadsheet-and-slide workflow with a structured, data-backed audit trail that flows from first client interview to production roadmap.

## Who uses it

| Role         | Typical user                           | What they do                                           |
|--------------|----------------------------------------|--------------------------------------------------------|
| `admin`      | Platform owner                         | Manage users, audits, cross-client reporting.          |
| `consultant` | ATEXIS auditor / solution architect    | Run audits, score processes, design POCs and roadmap.  |
| `viewer`     | Client sponsor, reviewer               | Read-only access to assigned audits.                   |

## Why it exists

- AI-audit engagements have a repeatable structure; that structure was previously re-created in ad-hoc documents.
- Clients in defence/aerospace demand traceable, classification-aware artefacts.
- Sovereignty / compliance dimensions (data location, model control, infra mode) must be scored consistently.
- POC → production hand-off was lossy — ARIA keeps the whole chain in one system.

## What an audit looks like

1. **Create audit** — name, client, project, sector, classification, lead consultant and collaborators, start / target dates.
2. **Add processes** — each business process the client wants audited becomes a record with department, responsible, norms, certifications, digital-maturity level and priority.
3. **Block-by-block analysis** for every process:
   - **B1 · Context** — formal scope, stakeholder map, profile mix, AI attitudes.
   - **B2 · Sovereignty** — axis scoring yielding a Sovereignty Index.
   - **B3 · Process Map** — activities, tasks, hours per profile, attachments → time and cost baseline.
   - **B5 · Use Cases** — AI-opportunity catalogue with per-UC scoring and time-saved estimates.
4. **Cross-audit artefacts** — consolidated scoring view, use-case library, POC pipeline, roadmap.
5. **Export & report** — AI-assisted narrative report, CSV/JSON exports of use cases and processes.

## Key capabilities

- **Structured AI audit workflow** across five blocks with progress tracking per process.
- **Sovereignty scoring model** with automatic index calculation.
- **Cost / time baselining** from profile-hours and process repetition.
- **LLM-assisted flows**: use-case suggestion, sovereignty analysis, process narrative, POC design autofill, compute-estimate refresh.
- **POC pipeline** tied to use cases, feeding a per-audit roadmap.
- **Classification-aware**: internal / confidential / reserved / secret labels per audit.
- **Role-based access** with per-audit collaborator lists.
- **Safe editing UX**: save-indicator, unsaved-change guards, confirm modals for destructive actions, breadcrumb navigation.
- **Audit lifecycle**: draft → active → review → completed; archive and delete flows with confirmation.

## What it is *not* (today)

- Not a multi-tenant SaaS — single-org deployment, local JWT auth.
- Not a BI tool — aggregated cross-audit analytics are limited to built-in views.
- Not a document editor — it links attachments rather than versioning them.
- Not offline — requires MongoDB connectivity.

## Current state — 2026-04-21

- Branch `repo.atexis/MAG` ready for merge, ahead of `main` by hardening and UX commits:
  - Security: login rate limit, viewer gating, removal of JWT fallback.
  - Architecture: Zod validation, pagination, filtered queries, loading states.
  - UX: blocked banner, breadcrumbs, mobile notice, SaveIndicator, save-guard hooks.
  - Consistency: legacy "B4" labels renamed to "B5" across UI.
- Test infrastructure (Vitest + Playwright) in place.
- Data volume (local dev): 6 audits · 11 processes · 30 use cases · 10 POCs · 1 roadmap · 3 users. Exported to `backups/aria-audit-20260421-0952.archive.gz`.

## Going to production — checklist

1. Managed MongoDB (e.g. Atlas) with authentication and daily backups.
2. Environment secrets: `JWT_SECRET`, `MONGODB_URI`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`.
3. HTTPS ingress in front of the Next.js container; HSTS + secure cookies.
4. Restore seed data using `mongorestore` from the archive above (optional).
5. Observability: health probe on `/api/health`, log shipping for app container.
6. Named Docker volume for Mongo if self-hosting, plus off-site backup of `mongodump`.
7. Smoke test: create audit → add process → complete B1/B2/B3 → generate use cases → create POC → build roadmap → export report.

## Roadmap pointers (non-binding)

- Automated backup pipeline and restore drills.
- Article / knowledge-base module (collection exists, UI pending).
- Richer cross-audit analytics and filterable portfolio view.
- Optional Postgres backend (migration script already drafted).
- Fine-grained per-audit permission model beyond the current three roles.
