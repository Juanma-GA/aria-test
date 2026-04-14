#!/usr/bin/env python3
"""
MongoDB → PostgreSQL Migration Script
Applications: IA Audit + NewsRadar (shared database: aria-audit)

Requirements:
    pip install pymongo psycopg2-binary python-dotenv

Usage:
    python migrate_mongo_to_postgres.py

    The script will prompt for:
      - MongoDB URI (or reads MONGODB_URI from .env)
      - PostgreSQL host, port, database name, user and password

Collections migrated:
    IA Audit: users, audits, processes, usecases, pocs, roadmaps, implementations
    NewsRadar: feeds, articles
"""

import os
import sys
import getpass
import json
from datetime import datetime, timezone

# Optional: load .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────────────────────────────────────────────
# Dependency checks
# ─────────────────────────────────────────────────────────────────

try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure
except ImportError:
    print("ERROR: pymongo not installed. Run:  pip install pymongo")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import Json, execute_values
except ImportError:
    print("ERROR: psycopg2 not installed. Run:  pip install psycopg2-binary")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def prompt(label, default=None, secret=False):
    """Prompt the user for a value, with an optional default."""
    suffix = f" [{default}]" if default else ""
    prompt_str = f"{label}{suffix}: "
    if secret:
        value = getpass.getpass(prompt_str)
    else:
        value = input(prompt_str).strip()
    return value if value else default


def oid(val):
    """Convert a MongoDB ObjectId (or anything) to a 24-char string."""
    return str(val) if val is not None else None


def ts(val):
    """Ensure a datetime is timezone-aware (UTC)."""
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    return val


# ─────────────────────────────────────────────────────────────────
# Connections
# ─────────────────────────────────────────────────────────────────

def get_mongo_connection():
    """Connect to MongoDB, reading the URI from env or user input."""
    mongo_uri = os.getenv("MONGODB_URI") or prompt(
        "MongoDB URI",
        default="mongodb://localhost:27017/aria-audit",
    )
    # Mask credentials in log output
    display_uri = mongo_uri.split("@")[-1] if "@" in mongo_uri else mongo_uri
    print(f"\nConnecting to MongoDB ({display_uri})...")

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
        print("  MongoDB connection OK.")
    except ConnectionFailure as exc:
        print(f"  ERROR: Cannot connect to MongoDB: {exc}")
        sys.exit(1)

    # Extract DB name from the URI path segment
    path = mongo_uri.rstrip("/").rsplit("/", 1)[-1].split("?")[0]
    db_name = path if path and ":" not in path else "aria-audit"
    return client[db_name]


def get_postgres_connection():
    """Prompt for PostgreSQL credentials and return an open connection."""
    print("\n--- PostgreSQL connection details ---")
    host   = prompt("Host",          default="localhost")
    port   = prompt("Port",          default="5432")
    dbname = prompt("Database name", default="aria_audit")
    user   = prompt("User",          default="postgres")
    password = prompt("Password",    secret=True)

    print(f"\nConnecting to PostgreSQL ({user}@{host}:{port}/{dbname})...")
    try:
        conn = psycopg2.connect(
            host=host, port=int(port), dbname=dbname,
            user=user, password=password,
        )
        conn.autocommit = False
        print("  PostgreSQL connection OK.")
        return conn
    except psycopg2.OperationalError as exc:
        print(f"  ERROR: Cannot connect to PostgreSQL: {exc}")
        sys.exit(1)


# ─────────────────────────────────────────────────────────────────
# DDL – Schema creation
# ─────────────────────────────────────────────────────────────────

DDL = """
-- ================================================================
-- USERS
-- ================================================================
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(24)  PRIMARY KEY,
    email           TEXT         NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    name            TEXT         NOT NULL,
    role            TEXT         NOT NULL DEFAULT 'consultant'
                        CHECK (role IN ('admin', 'consultant', 'viewer')),
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
);

-- ================================================================
-- AUDITS
-- ================================================================
CREATE TABLE IF NOT EXISTS audits (
    id                  VARCHAR(24)  PRIMARY KEY,
    name                TEXT         NOT NULL,
    client              TEXT         NOT NULL,
    project             TEXT         DEFAULT '',
    sector              TEXT         NOT NULL
                            CHECK (sector IN ('defence','aerospace','naval','railway','internal','other')),
    lead_consultant_id  VARCHAR(24)  REFERENCES users(id),
    status              TEXT         NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','review','completed')),
    classification      TEXT         NOT NULL DEFAULT 'internal'
                            CHECK (classification IN ('internal','confidential','reserved','secret')),
    start_date          TIMESTAMPTZ,
    target_end_date     TIMESTAMPTZ,
    audit_code          TEXT         UNIQUE,
    is_archived         BOOLEAN      DEFAULT FALSE,
    -- Embedded report sub-document
    report_generated_at TIMESTAMPTZ,
    report_model        TEXT,
    report_markdown     TEXT,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ
);

-- Many-to-many: audit ↔ collaborator users
CREATE TABLE IF NOT EXISTS audit_collaborators (
    audit_id    VARCHAR(24)  NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    user_id     VARCHAR(24)  NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    PRIMARY KEY (audit_id, user_id)
);

-- ================================================================
-- PROCESSES  (B1-B4 audit blocks are embedded as columns / child tables)
-- ================================================================
CREATE TABLE IF NOT EXISTS processes (
    id                          VARCHAR(24)  PRIMARY KEY,
    audit_id                    VARCHAR(24)  NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    proc_id                     TEXT         NOT NULL,
    name                        TEXT         NOT NULL,
    department                  TEXT,
    responsible                 TEXT,
    sector                      TEXT,
    digital_maturity_level      INTEGER      DEFAULT 1,
    priority                    TEXT         DEFAULT 'medium'
                                    CHECK (priority IN ('high','medium','low')),
    status                      TEXT         DEFAULT 'pending'
                                    CHECK (status IN ('pending','in_audit','completed','paused')),
    -- B1 scalar fields
    b1_formal_name              TEXT,
    b1_department               TEXT,
    b1_contract_reference       TEXT,
    b1_capture_date             TIMESTAMPTZ,
    b1_number_of_people         INTEGER,
    b1_client_department        TEXT,
    b1_client_responsible       TEXT,
    b1_technical_director       TEXT,
    -- B3 meta fields
    b3_notes                    TEXT,
    b3_annual_repetitions       INTEGER,
    -- B4 base metrics
    b4_avg_output_time_hours    NUMERIC,
    b4_rework_rate_percent      NUMERIC,
    b4_avg_review_cycles        NUMERIC,
    b4_hourly_rate_eur          NUMERIC,
    b4_queue_waste_hours        NUMERIC,
    b4_content_reuse_percent    NUMERIC,
    b4_metric_notes             TEXT,
    -- Simple string arrays kept as JSONB
    applicable_norms            JSONB        DEFAULT '[]',
    active_certifications       JSONB        DEFAULT '[]',
    created_at                  TIMESTAMPTZ,
    updated_at                  TIMESTAMPTZ
);

-- B1 – Stakeholders
CREATE TABLE IF NOT EXISTS process_stakeholders (
    id              SERIAL       PRIMARY KEY,
    process_id      VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    role            TEXT,
    name            TEXT,
    type            TEXT         CHECK (type IN ('internal','client')),
    influence_level TEXT         CHECK (influence_level IN ('very_high','high','medium','low')),
    ai_attitude     TEXT         CHECK (ai_attitude IN ('champion','supporter','neutral','sceptic','blocker','unknown')),
    notes           TEXT
);

-- B1 – Profiles
CREATE TABLE IF NOT EXISTS process_profiles (
    id              SERIAL       PRIMARY KEY,
    process_id      VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    profile_ref_id  TEXT,
    role            TEXT,
    type            TEXT         CHECK (type IN ('internal','client')),
    count           INTEGER,
    hourly_rate_eur NUMERIC
);

-- B2 – Sovereignty axes (one row per axis per process)
CREATE TABLE IF NOT EXISTS process_sovereignty_axes (
    id                   SERIAL       PRIMARY KEY,
    process_id           VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    axis_key             TEXT         NOT NULL,
    status               TEXT         CHECK (status IN ('green','amber','red')),
    findings             TEXT,
    implications         TEXT,
    normative_frameworks JSONB        DEFAULT '[]',
    infrastructure_mode  TEXT         CHECK (infrastructure_mode IN (
                             'client_onsite','client_onpremise','client_cloud',
                             'atexis_onpremise','atexis_cloud','hybrid')),
    UNIQUE (process_id, axis_key)
);

-- B3 – Activities
CREATE TABLE IF NOT EXISTS process_activities (
    id                   SERIAL       PRIMARY KEY,
    process_id           VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    activity_ref_id      TEXT,
    ord                  INTEGER,
    name                 TEXT,
    tools                JSONB        DEFAULT '[]',
    inputs               JSONB        DEFAULT '[]',
    outputs              JSONB        DEFAULT '[]',
    responsible_profile  TEXT,
    estimated_time_hours NUMERIC,
    annual_repetitions   INTEGER,
    step_repetitions     INTEGER,
    is_decision_point    BOOLEAN      DEFAULT FALSE,
    linked_use_case_ids  JSONB        DEFAULT '[]',
    notes                TEXT
);

-- B3 – Activity input files
CREATE TABLE IF NOT EXISTS activity_input_files (
    id          SERIAL   PRIMARY KEY,
    activity_id INTEGER  NOT NULL REFERENCES process_activities(id) ON DELETE CASCADE,
    file_ref_id TEXT,
    name        TEXT,
    url         TEXT
);

-- B3 – Activity output files
CREATE TABLE IF NOT EXISTS activity_output_files (
    id          SERIAL   PRIMARY KEY,
    activity_id INTEGER  NOT NULL REFERENCES process_activities(id) ON DELETE CASCADE,
    file_ref_id TEXT,
    name        TEXT,
    url         TEXT
);

-- B3 – Activity profile hours
CREATE TABLE IF NOT EXISTS activity_profile_hours (
    id          SERIAL   PRIMARY KEY,
    activity_id INTEGER  NOT NULL REFERENCES process_activities(id) ON DELETE CASCADE,
    profile_id  TEXT,
    role        TEXT,
    hours       NUMERIC
);

-- B3 – Activity tasks
CREATE TABLE IF NOT EXISTS activity_tasks (
    id          SERIAL   PRIMARY KEY,
    activity_id INTEGER  NOT NULL REFERENCES process_activities(id) ON DELETE CASCADE,
    task_ref_id TEXT,
    description TEXT
);

-- B4 – Pain points
CREATE TABLE IF NOT EXISTS process_pain_points (
    id               SERIAL       PRIMARY KEY,
    process_id       VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    pain_ref_id      TEXT,
    description      TEXT,
    friction_type    TEXT         CHECK (friction_type IN ('time','quality','knowledge','integration','scale')),
    process_stage    TEXT,
    current_metric   TEXT,
    estimated_impact INTEGER,
    root_cause       TEXT,
    notes            TEXT
);

-- ================================================================
-- USE CASES  (B5 / B6 scoring embedded as columns)
-- ================================================================
CREATE TABLE IF NOT EXISTS use_cases (
    id                      VARCHAR(24)  PRIMARY KEY,
    audit_id                VARCHAR(24)  NOT NULL REFERENCES audits(id)    ON DELETE CASCADE,
    process_id              VARCHAR(24)  NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    cu_id                   TEXT         NOT NULL,
    description             TEXT         NOT NULL,
    b2_compatible           TEXT         DEFAULT 'yes'
                                CHECK (b2_compatible IN ('yes','no','partial')),
    requires_client_it      BOOLEAN      DEFAULT FALSE,
    estimated_dev_cost_eur  NUMERIC,
    dev_cost_explanation    TEXT,
    estimated_impl_weeks    INTEGER,
    status                  TEXT         DEFAULT 'eligible'
                                CHECK (status IN ('eligible','blocked','pending_review')),
    blocked_reason          TEXT,
    blocked_axis            TEXT,
    unblock_condition       TEXT,
    review_date             TIMESTAMPTZ,
    notes                   TEXT,
    sovereignty_analysis    TEXT,
    -- B6 score dimensions (d1–d6), each with value / justification / auto_filled
    score_d1_value          INTEGER,
    score_d1_justification  TEXT,
    score_d1_auto_filled    BOOLEAN,
    score_d2_value          INTEGER,
    score_d2_justification  TEXT,
    score_d2_auto_filled    BOOLEAN,
    score_d3_value          INTEGER,
    score_d3_justification  TEXT,
    score_d3_auto_filled    BOOLEAN,
    score_d4_value          INTEGER,
    score_d4_justification  TEXT,
    score_d4_auto_filled    BOOLEAN,
    score_d5_value          INTEGER,
    score_d5_justification  TEXT,
    score_d5_auto_filled    BOOLEAN,
    score_d6_value          INTEGER,
    score_d6_justification  TEXT,
    score_d6_auto_filled    BOOLEAN,
    score_notes             TEXT,
    score_scored_by         TEXT,
    score_scored_at         TIMESTAMPTZ,
    -- Compute cost: polymorphic cloud/on-premise/hybrid structure kept as JSONB
    compute_cost            JSONB        DEFAULT '{}',
    created_at              TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ
);

-- Use case AI types (enum array)
CREATE TABLE IF NOT EXISTS use_case_ai_types (
    use_case_id VARCHAR(24)  NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
    ai_type     TEXT         NOT NULL,
    PRIMARY KEY (use_case_id, ai_type)
);

-- Use case target activities (string array)
CREATE TABLE IF NOT EXISTS use_case_target_activities (
    id            SERIAL       PRIMARY KEY,
    use_case_id   VARCHAR(24)  NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
    activity_name TEXT
);

-- Use case time saved per profile
CREATE TABLE IF NOT EXISTS use_case_time_saved (
    id                  SERIAL       PRIMARY KEY,
    use_case_id         VARCHAR(24)  NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
    profile_id          TEXT,
    role                TEXT,
    hours_per_execution NUMERIC
);

-- ================================================================
-- POCS
-- ================================================================
CREATE TABLE IF NOT EXISTS pocs (
    id                               VARCHAR(24)  PRIMARY KEY,
    audit_id                         VARCHAR(24)  NOT NULL REFERENCES audits(id)     ON DELETE CASCADE,
    use_case_id                      VARCHAR(24)           REFERENCES use_cases(id),
    process_id                       VARCHAR(24)           REFERENCES processes(id),
    poc_id                           TEXT         NOT NULL,
    name                             TEXT,
    phase                            TEXT         DEFAULT 'design'
                                         CHECK (phase IN ('design','execution','evaluation','closed')),
    -- Design phase
    design_responsible_user_id       TEXT,
    design_measurable_objective      TEXT,
    design_scope_description         TEXT,
    design_start_date                TIMESTAMPTZ,
    design_deadline_date             TIMESTAMPTZ,
    design_required_resources        TEXT,
    design_active_b2_restrictions    TEXT,
    design_estimated_dev_cost_eur    NUMERIC,
    -- Execution phase
    execution_incidents              TEXT,
    execution_plan_deviations        TEXT,
    execution_pause_reason           TEXT,
    execution_paused_at              TIMESTAMPTZ,
    -- Evaluation phase
    evaluation_results_vs_criteria   TEXT,
    evaluation_technical_lessons     TEXT,
    evaluation_organisational_lessons TEXT,
    evaluation_actual_cost_eur       NUMERIC,
    evaluation_estimated_prod_impact TEXT,
    evaluation_evaluated_by          TEXT,
    evaluation_evaluated_at          TIMESTAMPTZ,
    -- Decision phase
    decision_decision                TEXT         CHECK (decision_decision IN (
                                         'go','go_conditional','no_go_redesign',
                                         'no_go_discard','paused','pending')),
    decision_justification           TEXT,
    decision_conditional_requirement TEXT,
    decision_next_steps              TEXT,
    decision_decided_by              TEXT,
    decision_decided_at              TIMESTAMPTZ,
    -- Compute cost (same polymorphic structure as use_cases)
    compute_cost                     JSONB        DEFAULT '{}',
    ai_generated_fields              JSONB        DEFAULT '[]',
    created_at                       TIMESTAMPTZ,
    updated_at                       TIMESTAMPTZ
);

-- POC success criteria
CREATE TABLE IF NOT EXISTS poc_success_criteria (
    id                SERIAL       PRIMARY KEY,
    poc_id            VARCHAR(24)  NOT NULL REFERENCES pocs(id) ON DELETE CASCADE,
    criterion_ref_id  TEXT,
    criterion         TEXT,
    description       TEXT,
    success_threshold TEXT,
    actual_result     TEXT,
    passed            BOOLEAN
);

-- POC execution milestones
CREATE TABLE IF NOT EXISTS poc_milestones (
    id               SERIAL       PRIMARY KEY,
    poc_id           VARCHAR(24)  NOT NULL REFERENCES pocs(id) ON DELETE CASCADE,
    milestone_ref_id TEXT,
    name             TEXT,
    due_date         TIMESTAMPTZ,
    status           TEXT         CHECK (status IN ('pending','done','missed')),
    notes            TEXT
);

-- ================================================================
-- ROADMAPS
-- ================================================================
CREATE TABLE IF NOT EXISTS roadmaps (
    id         VARCHAR(24)  PRIMARY KEY,
    audit_id   VARCHAR(24)  NOT NULL UNIQUE REFERENCES audits(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Roadmap initiatives (horizons h1 / h2 / h3)
CREATE TABLE IF NOT EXISTS roadmap_initiatives (
    id                           SERIAL       PRIMARY KEY,
    roadmap_id                   VARCHAR(24)  NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    horizon                      TEXT         NOT NULL
                                     CHECK (horizon IN ('h1_quickWins','h2_midTerm','h3_strategic')),
    use_case_id                  VARCHAR(24)  REFERENCES use_cases(id),
    process_id                   VARCHAR(24)  REFERENCES processes(id),
    description                  TEXT,
    annual_time_saving_hours     NUMERIC,
    error_reduction_percent      NUMERIC,
    estimated_investment_eur     NUMERIC,
    roi_breakeven_months         NUMERIC,
    success_kpi                  TEXT,
    prerequisite                 TEXT,
    owner                        TEXT,
    target_date                  TIMESTAMPTZ,
    poc_actual_time_saving_hours NUMERIC,
    poc_actual_cost_eur          NUMERIC,
    poc_lessons                  TEXT
);

-- Roadmap next steps
CREATE TABLE IF NOT EXISTS roadmap_next_steps (
    id         SERIAL       PRIMARY KEY,
    roadmap_id VARCHAR(24)  NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    action     TEXT,
    responsible TEXT,
    deadline   TIMESTAMPTZ,
    status     TEXT         CHECK (status IN ('pending','in_progress','done','blocked'))
);

-- ================================================================
-- IMPLEMENTATIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS implementations (
    id          VARCHAR(24)  PRIMARY KEY,
    title       TEXT         NOT NULL,
    description TEXT,
    poc_id      VARCHAR(24)  REFERENCES pocs(id),
    status      TEXT         DEFAULT 'planned'
                    CHECK (status IN ('planned','in-progress','deployed')),
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ
);

-- ================================================================
-- NEWSRADAR – FEEDS
-- ================================================================
CREATE TABLE IF NOT EXISTS feeds (
    id              VARCHAR(24)  PRIMARY KEY,
    name            TEXT         NOT NULL,
    url             TEXT         NOT NULL UNIQUE,
    category        TEXT         NOT NULL
                        CHECK (category IN ('ia','defensa','aeroespacial')),
    geo_scope       TEXT         DEFAULT 'world'
                        CHECK (geo_scope IN ('spain','europe','world')),
    active          BOOLEAN      DEFAULT TRUE,
    last_fetched_at TIMESTAMPTZ,
    error_count     INTEGER      DEFAULT 0,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
);

-- ================================================================
-- NEWSRADAR – ARTICLES
-- ================================================================
CREATE TABLE IF NOT EXISTS articles (
    id                   VARCHAR(24)  PRIMARY KEY,
    title                TEXT         NOT NULL,
    url                  TEXT         NOT NULL UNIQUE,
    source               TEXT         NOT NULL,
    feed_id              VARCHAR(24)  REFERENCES feeds(id) ON DELETE SET NULL,
    category             TEXT         NOT NULL
                             CHECK (category IN ('ia','defensa','aeroespacial')),
    geo_scope            TEXT         DEFAULT 'world'
                             CHECK (geo_scope IN ('spain','europe','world')),
    published_at         TIMESTAMPTZ  NOT NULL,
    summary              TEXT,
    original_description TEXT,
    image_url            TEXT,
    relevance_score      INTEGER      DEFAULT 50,
    summarized           BOOLEAN      DEFAULT FALSE,
    created_at           TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ
);

-- Mirror MongoDB indexes on articles
CREATE INDEX IF NOT EXISTS idx_articles_category_published ON articles (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_geo_scope          ON articles (geo_scope);
CREATE INDEX IF NOT EXISTS idx_articles_relevance_score    ON articles (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_published_at       ON articles (published_at);
"""


def create_schema(cur):
    print("\nCreating PostgreSQL schema...")
    cur.execute(DDL)
    print("  Schema created / verified.")


# ─────────────────────────────────────────────────────────────────
# Migration functions (one per collection)
# ─────────────────────────────────────────────────────────────────

def migrate_users(mongo_db, cur):
    docs = list(mongo_db.users.find())
    print(f"  users            → {len(docs)} documents")
    if not docs:
        return
    rows = [
        (
            oid(d["_id"]),
            d.get("email"),
            d.get("passwordHash"),
            d.get("name"),
            d.get("role", "consultant"),
            ts(d.get("createdAt")),
            ts(d.get("updatedAt")),
        )
        for d in docs
    ]
    execute_values(cur, """
        INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
        VALUES %s ON CONFLICT (id) DO NOTHING
    """, rows)


def migrate_audits(mongo_db, cur):
    docs = list(mongo_db.audits.find())
    print(f"  audits           → {len(docs)} documents")
    audit_rows, collab_rows = [], []
    for d in docs:
        aid    = oid(d["_id"])
        report = d.get("report") or {}
        audit_rows.append((
            aid,
            d.get("name"),
            d.get("client"),
            d.get("project", ""),
            d.get("sector"),
            oid(d.get("leadConsultant")),
            d.get("status", "draft"),
            d.get("classification", "internal"),
            ts(d.get("startDate")),
            ts(d.get("targetEndDate")),
            d.get("auditCode"),
            bool(d.get("isArchived", False)),
            ts(report.get("generatedAt")),
            report.get("model"),
            report.get("markdown"),
            ts(d.get("createdAt")),
            ts(d.get("updatedAt")),
        ))
        for uid in d.get("collaborators", []):
            collab_rows.append((aid, oid(uid)))

    if audit_rows:
        execute_values(cur, """
            INSERT INTO audits (
                id, name, client, project, sector, lead_consultant_id,
                status, classification, start_date, target_end_date, audit_code,
                is_archived, report_generated_at, report_model, report_markdown,
                created_at, updated_at
            ) VALUES %s ON CONFLICT (id) DO NOTHING
        """, audit_rows)

    if collab_rows:
        execute_values(cur, """
            INSERT INTO audit_collaborators (audit_id, user_id)
            VALUES %s ON CONFLICT DO NOTHING
        """, collab_rows)


def migrate_processes(mongo_db, cur):
    docs = list(mongo_db.processes.find())
    print(f"  processes        → {len(docs)} documents")
    for d in docs:
        pid = oid(d["_id"])
        b1  = d.get("b1") or {}
        b3  = d.get("b3") or {}
        b4  = d.get("b4") or {}
        bm  = b4.get("baseMetrics") or {}

        cur.execute("""
            INSERT INTO processes (
                id, audit_id, proc_id, name, department, responsible, sector,
                digital_maturity_level, priority, status,
                b1_formal_name, b1_department, b1_contract_reference, b1_capture_date,
                b1_number_of_people, b1_client_department, b1_client_responsible, b1_technical_director,
                b3_notes, b3_annual_repetitions,
                b4_avg_output_time_hours, b4_rework_rate_percent, b4_avg_review_cycles,
                b4_hourly_rate_eur, b4_queue_waste_hours, b4_content_reuse_percent, b4_metric_notes,
                applicable_norms, active_certifications,
                created_at, updated_at
            ) VALUES (
                %(id)s,%(audit_id)s,%(proc_id)s,%(name)s,%(department)s,%(responsible)s,%(sector)s,
                %(digital_maturity_level)s,%(priority)s,%(status)s,
                %(b1_formal_name)s,%(b1_department)s,%(b1_contract_reference)s,%(b1_capture_date)s,
                %(b1_number_of_people)s,%(b1_client_department)s,%(b1_client_responsible)s,%(b1_technical_director)s,
                %(b3_notes)s,%(b3_annual_repetitions)s,
                %(b4_avg_output_time_hours)s,%(b4_rework_rate_percent)s,%(b4_avg_review_cycles)s,
                %(b4_hourly_rate_eur)s,%(b4_queue_waste_hours)s,%(b4_content_reuse_percent)s,%(b4_metric_notes)s,
                %(applicable_norms)s,%(active_certifications)s,
                %(created_at)s,%(updated_at)s
            ) ON CONFLICT (id) DO NOTHING
        """, {
            "id":                      pid,
            "audit_id":                oid(d.get("auditId")),
            "proc_id":                 d.get("procId"),
            "name":                    d.get("name"),
            "department":              d.get("department"),
            "responsible":             d.get("responsible"),
            "sector":                  d.get("sector"),
            "digital_maturity_level":  d.get("digitalMaturityLevel", 1),
            "priority":                d.get("priority", "medium"),
            "status":                  d.get("status", "pending"),
            "b1_formal_name":          b1.get("formalName"),
            "b1_department":           b1.get("department"),
            "b1_contract_reference":   b1.get("contractReference"),
            "b1_capture_date":         ts(b1.get("captureDate")),
            "b1_number_of_people":     b1.get("numberOfPeople"),
            "b1_client_department":    b1.get("clientDepartment"),
            "b1_client_responsible":   b1.get("clientResponsible"),
            "b1_technical_director":   b1.get("technicalDirectorResponsible"),
            "b3_notes":                b3.get("notes"),
            "b3_annual_repetitions":   b3.get("annualRepetitions"),
            "b4_avg_output_time_hours": bm.get("avgOutputTimeHours"),
            "b4_rework_rate_percent":  bm.get("reworkRatePercent"),
            "b4_avg_review_cycles":    bm.get("avgReviewCycles"),
            "b4_hourly_rate_eur":      bm.get("hourlyRateEur"),
            "b4_queue_waste_hours":    bm.get("queueWasteHoursPerWeek"),
            "b4_content_reuse_percent": bm.get("contentReusePercent"),
            "b4_metric_notes":         bm.get("metricNotes"),
            "applicable_norms":        Json(d.get("applicableNorms") or []),
            "active_certifications":   Json(d.get("activeCertifications") or []),
            "created_at":              ts(d.get("createdAt")),
            "updated_at":              ts(d.get("updatedAt")),
        })

        # ── B1 Stakeholders ──────────────────────────────────────
        for sk in b1.get("stakeholders", []):
            cur.execute("""
                INSERT INTO process_stakeholders
                    (process_id, role, name, type, influence_level, ai_attitude, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                pid, sk.get("role"), sk.get("name"), sk.get("type"),
                sk.get("influenceLevel"), sk.get("aiAttitude"), sk.get("notes"),
            ))

        # ── B1 Profiles ──────────────────────────────────────────
        for pr in b1.get("profiles", []):
            cur.execute("""
                INSERT INTO process_profiles
                    (process_id, profile_ref_id, role, type, count, hourly_rate_eur)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                pid, pr.get("id"), pr.get("role"), pr.get("type"),
                pr.get("count"), pr.get("hourlyRateEur"),
            ))

        # ── B2 Sovereignty axes ───────────────────────────────────
        b2_axes = (d.get("b2") or {}).get("axes") or {}
        for axis_key in (
            "axis1_InfoClassification",
            "axis2_ProcessSovereignty",
            "axis3_ToolSovereignty",
            "axis4_DataSovereignty",
            "axis5_Infrastructure",
        ):
            ax = b2_axes.get(axis_key) or {}
            if ax:
                cur.execute("""
                    INSERT INTO process_sovereignty_axes
                        (process_id, axis_key, status, findings, implications,
                         normative_frameworks, infrastructure_mode)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (process_id, axis_key) DO NOTHING
                """, (
                    pid, axis_key,
                    ax.get("status"), ax.get("findings"), ax.get("implications"),
                    Json(ax.get("normativeFrameworks") or []), ax.get("infrastructureMode"),
                ))

        # ── B3 Activities ─────────────────────────────────────────
        for act in b3.get("activities", []):
            cur.execute("""
                INSERT INTO process_activities (
                    process_id, activity_ref_id, ord, name,
                    tools, inputs, outputs,
                    responsible_profile, estimated_time_hours, annual_repetitions,
                    step_repetitions, is_decision_point, linked_use_case_ids, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                pid, act.get("id"), act.get("order"), act.get("name"),
                Json(act.get("tools") or []),
                Json(act.get("inputs") or []),
                Json(act.get("outputs") or []),
                act.get("responsibleProfile"), act.get("estimatedTimeHours"),
                act.get("annualRepetitions"), act.get("stepRepetitions"),
                bool(act.get("isDecisionPoint", False)),
                Json(act.get("linkedUseCaseIds") or []),
                act.get("notes"),
            ))
            act_db_id = cur.fetchone()[0]

            for f in act.get("inputFiles") or []:
                cur.execute(
                    "INSERT INTO activity_input_files (activity_id, file_ref_id, name, url)"
                    " VALUES (%s, %s, %s, %s)",
                    (act_db_id, f.get("id"), f.get("name"), f.get("url")),
                )
            for f in act.get("outputFiles") or []:
                cur.execute(
                    "INSERT INTO activity_output_files (activity_id, file_ref_id, name, url)"
                    " VALUES (%s, %s, %s, %s)",
                    (act_db_id, f.get("id"), f.get("name"), f.get("url")),
                )
            for ph in act.get("profileHours") or []:
                cur.execute(
                    "INSERT INTO activity_profile_hours (activity_id, profile_id, role, hours)"
                    " VALUES (%s, %s, %s, %s)",
                    (act_db_id, ph.get("profileId"), ph.get("role"), ph.get("hours")),
                )
            for tk in act.get("tasks") or []:
                cur.execute(
                    "INSERT INTO activity_tasks (activity_id, task_ref_id, description)"
                    " VALUES (%s, %s, %s)",
                    (act_db_id, tk.get("id"), tk.get("description")),
                )

        # ── B4 Pain points ────────────────────────────────────────
        for pp in b4.get("painPoints") or []:
            cur.execute("""
                INSERT INTO process_pain_points
                    (process_id, pain_ref_id, description, friction_type, process_stage,
                     current_metric, estimated_impact, root_cause, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                pid, pp.get("id"), pp.get("description"), pp.get("frictionType"),
                pp.get("processStage"), pp.get("currentMetric"), pp.get("estimatedImpact"),
                pp.get("rootCause"), pp.get("notes"),
            ))


def _resolve_use_cases_collection(mongo_db):
    """Try several possible collection names for use cases."""
    for name in ("usecases", "use_cases", "use-cases", "UseCases"):
        if name in mongo_db.list_collection_names():
            return mongo_db[name]
    # Fallback: try the default accessor (works even if empty)
    return mongo_db.usecases


def migrate_use_cases(mongo_db, cur):
    col  = _resolve_use_cases_collection(mongo_db)
    docs = list(col.find())
    print(f"  use_cases        → {len(docs)} documents")

    for d in docs:
        ucid  = oid(d["_id"])
        score = d.get("score") or {}
        dims  = score.get("dimensions") or {}

        def dim(key):
            o = dims.get(key) or {}
            return o.get("value"), o.get("justification"), bool(o.get("autoFilled", False))

        d1 = dim("d1_efficiencyImpact")
        d2 = dim("d2_qualityImpact")
        d3 = dim("d3_techMaturity")
        d4 = dim("d4_dataReadiness")
        d5 = dim("d5_sovereigntyIndex")
        d6 = dim("d6_governanceComplexity")

        cur.execute("""
            INSERT INTO use_cases (
                id, audit_id, process_id, cu_id, description,
                b2_compatible, requires_client_it,
                estimated_dev_cost_eur, dev_cost_explanation, estimated_impl_weeks,
                status, blocked_reason, blocked_axis, unblock_condition, review_date,
                notes, sovereignty_analysis,
                score_d1_value, score_d1_justification, score_d1_auto_filled,
                score_d2_value, score_d2_justification, score_d2_auto_filled,
                score_d3_value, score_d3_justification, score_d3_auto_filled,
                score_d4_value, score_d4_justification, score_d4_auto_filled,
                score_d5_value, score_d5_justification, score_d5_auto_filled,
                score_d6_value, score_d6_justification, score_d6_auto_filled,
                score_notes, score_scored_by, score_scored_at,
                compute_cost, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s
            ) ON CONFLICT (id) DO NOTHING
        """, (
            ucid, oid(d.get("auditId")), oid(d.get("processId")),
            d.get("cuId"), d.get("description"),
            d.get("b2Compatible", "yes"), bool(d.get("requiresClientIT", False)),
            d.get("estimatedDevCostEur"), d.get("devCostExplanation"), d.get("estimatedImplWeeks"),
            d.get("status", "eligible"), d.get("blockedReason"), d.get("blockedAxis"),
            d.get("unblockCondition"), ts(d.get("reviewDate")),
            d.get("notes"), d.get("sovereigntyAnalysis"),
            *d1, *d2, *d3, *d4, *d5, *d6,
            score.get("scoringNotes"), score.get("scoredBy"), ts(score.get("scoredAt")),
            Json(d.get("computeCost") or {}),
            ts(d.get("createdAt")), ts(d.get("updatedAt")),
        ))

        for ai_type in d.get("aiTypes") or []:
            cur.execute("""
                INSERT INTO use_case_ai_types (use_case_id, ai_type)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (ucid, ai_type))

        for ta in d.get("targetActivities") or []:
            cur.execute(
                "INSERT INTO use_case_target_activities (use_case_id, activity_name) VALUES (%s, %s)",
                (ucid, ta),
            )

        for ts_prof in d.get("timeSavedPerProfile") or []:
            cur.execute("""
                INSERT INTO use_case_time_saved (use_case_id, profile_id, role, hours_per_execution)
                VALUES (%s, %s, %s, %s)
            """, (ucid, ts_prof.get("profileId"), ts_prof.get("role"), ts_prof.get("hoursPerExecution")))


def migrate_pocs(mongo_db, cur):
    docs = list(mongo_db.pocs.find())
    print(f"  pocs             → {len(docs)} documents")

    for d in docs:
        pocid      = oid(d["_id"])
        design     = d.get("design")     or {}
        execution  = d.get("execution")  or {}
        evaluation = d.get("evaluation") or {}
        decision   = d.get("decision")   or {}

        cur.execute("""
            INSERT INTO pocs (
                id, audit_id, use_case_id, process_id, poc_id, name, phase,
                design_responsible_user_id, design_measurable_objective, design_scope_description,
                design_start_date, design_deadline_date, design_required_resources,
                design_active_b2_restrictions, design_estimated_dev_cost_eur,
                execution_incidents, execution_plan_deviations,
                execution_pause_reason, execution_paused_at,
                evaluation_results_vs_criteria, evaluation_technical_lessons,
                evaluation_organisational_lessons, evaluation_actual_cost_eur,
                evaluation_estimated_prod_impact, evaluation_evaluated_by, evaluation_evaluated_at,
                decision_decision, decision_justification, decision_conditional_requirement,
                decision_next_steps, decision_decided_by, decision_decided_at,
                compute_cost, ai_generated_fields, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s
            ) ON CONFLICT (id) DO NOTHING
        """, (
            pocid, oid(d.get("auditId")), oid(d.get("useCaseId")), oid(d.get("processId")),
            d.get("pocId"), d.get("name"), d.get("phase", "design"),
            design.get("responsibleUserId"), design.get("measurableObjective"),
            design.get("scopeDescription"), ts(design.get("startDate")),
            ts(design.get("deadlineDate")), design.get("requiredResources"),
            design.get("activeB2Restrictions"), design.get("estimatedDevCostEur"),
            execution.get("incidents"), execution.get("planDeviations"),
            execution.get("pauseReason"), ts(execution.get("pausedAt")),
            evaluation.get("resultsVsCriteria"), evaluation.get("technicalLessons"),
            evaluation.get("organisationalLessons"), evaluation.get("actualCostEur"),
            evaluation.get("estimatedProductionImpact"), evaluation.get("evaluatedBy"),
            ts(evaluation.get("evaluatedAt")),
            decision.get("decision"), decision.get("justification"),
            decision.get("conditionalRequirement"), decision.get("nextSteps"),
            decision.get("decidedBy"), ts(decision.get("decidedAt")),
            Json(d.get("computeCost") or {}),
            Json(d.get("aiGeneratedFields") or []),
            ts(d.get("createdAt")), ts(d.get("updatedAt")),
        ))

        for sc in design.get("successCriteria") or []:
            cur.execute("""
                INSERT INTO poc_success_criteria
                    (poc_id, criterion_ref_id, criterion, description,
                     success_threshold, actual_result, passed)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                pocid, sc.get("id"), sc.get("criterion"), sc.get("description"),
                sc.get("successThreshold"), sc.get("actualResult"), sc.get("passed"),
            ))

        for ms in execution.get("milestones") or []:
            cur.execute("""
                INSERT INTO poc_milestones (poc_id, milestone_ref_id, name, due_date, status, notes)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                pocid, ms.get("id"), ms.get("name"),
                ts(ms.get("dueDate")), ms.get("status"), ms.get("notes"),
            ))


def migrate_roadmaps(mongo_db, cur):
    docs = list(mongo_db.roadmaps.find())
    print(f"  roadmaps         → {len(docs)} documents")

    for d in docs:
        rid = oid(d["_id"])
        cur.execute("""
            INSERT INTO roadmaps (id, audit_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING
        """, (rid, oid(d.get("auditId")), ts(d.get("createdAt")), ts(d.get("updatedAt"))))

        horizons = d.get("horizons") or {}
        for horizon_key in ("h1_quickWins", "h2_midTerm", "h3_strategic"):
            for init in horizons.get(horizon_key) or []:
                poc_data = init.get("pocActualData") or {}
                cur.execute("""
                    INSERT INTO roadmap_initiatives (
                        roadmap_id, horizon, use_case_id, process_id, description,
                        annual_time_saving_hours, error_reduction_percent, estimated_investment_eur,
                        roi_breakeven_months, success_kpi, prerequisite, owner, target_date,
                        poc_actual_time_saving_hours, poc_actual_cost_eur, poc_lessons
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    rid, horizon_key,
                    oid(init.get("useCaseId")), oid(init.get("processId")),
                    init.get("description"), init.get("annualTimeSavingHours"),
                    init.get("errorReductionPercent"), init.get("estimatedInvestmentEur"),
                    init.get("roiBreakevenMonths"), init.get("successKpi"),
                    init.get("prerequisite"), init.get("owner"), ts(init.get("targetDate")),
                    poc_data.get("actualTimeSavingHours"),
                    poc_data.get("actualCostEur"),
                    poc_data.get("pocLessons"),
                ))

        for ns in d.get("nextSteps") or []:
            cur.execute("""
                INSERT INTO roadmap_next_steps (roadmap_id, action, responsible, deadline, status)
                VALUES (%s, %s, %s, %s, %s)
            """, (rid, ns.get("action"), ns.get("responsible"),
                  ts(ns.get("deadline")), ns.get("status")))


def migrate_implementations(mongo_db, cur):
    docs = list(mongo_db.implementations.find())
    print(f"  implementations  → {len(docs)} documents")
    if not docs:
        return
    rows = [
        (
            oid(d["_id"]), d.get("title"), d.get("description"),
            oid(d.get("pocId")), d.get("status", "planned"),
            ts(d.get("createdAt")), ts(d.get("updatedAt")),
        )
        for d in docs
    ]
    execute_values(cur, """
        INSERT INTO implementations (id, title, description, poc_id, status, created_at, updated_at)
        VALUES %s ON CONFLICT (id) DO NOTHING
    """, rows)


def migrate_feeds(mongo_db, cur):
    docs = list(mongo_db.feeds.find())
    print(f"  feeds            → {len(docs)} documents")
    if not docs:
        return
    rows = [
        (
            oid(d["_id"]), d.get("name"), d.get("url"), d.get("category"),
            d.get("geoScope", "world"), bool(d.get("active", True)),
            ts(d.get("lastFetchedAt")), d.get("errorCount", 0),
            ts(d.get("createdAt")), ts(d.get("updatedAt")),
        )
        for d in docs
    ]
    execute_values(cur, """
        INSERT INTO feeds (id, name, url, category, geo_scope, active,
                           last_fetched_at, error_count, created_at, updated_at)
        VALUES %s ON CONFLICT (id) DO NOTHING
    """, rows)


def migrate_articles(mongo_db, cur):
    docs = list(mongo_db.articles.find())
    print(f"  articles         → {len(docs)} documents")
    if not docs:
        return
    BATCH_SIZE = 500
    total = len(docs)
    for offset in range(0, total, BATCH_SIZE):
        batch = docs[offset : offset + BATCH_SIZE]
        rows  = [
            (
                oid(d["_id"]), d.get("title"), d.get("url"), d.get("source"),
                oid(d.get("feedId")), d.get("category"), d.get("geoScope", "world"),
                ts(d.get("publishedAt")), d.get("summary"), d.get("originalDescription"),
                d.get("imageUrl"), d.get("relevanceScore", 50),
                bool(d.get("summarized", False)),
                ts(d.get("createdAt")), ts(d.get("updatedAt")),
            )
            for d in batch
        ]
        execute_values(cur, """
            INSERT INTO articles (
                id, title, url, source, feed_id, category, geo_scope,
                published_at, summary, original_description, image_url,
                relevance_score, summarized, created_at, updated_at
            ) VALUES %s ON CONFLICT (id) DO NOTHING
        """, rows)
        done = min(offset + BATCH_SIZE, total)
        print(f"    articles batch: {done}/{total}")


# ─────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  MongoDB → PostgreSQL Migration")
    print("  IA Audit + NewsRadar  (database: aria-audit)")
    print("=" * 60)

    mongo_db = get_mongo_connection()
    pg_conn  = get_postgres_connection()
    pg_cur   = pg_conn.cursor()

    try:
        create_schema(pg_cur)

        print("\nMigrating collections:")
        # Order matters: respect FK dependencies
        migrate_users(mongo_db, pg_cur)
        migrate_audits(mongo_db, pg_cur)
        migrate_processes(mongo_db, pg_cur)
        migrate_use_cases(mongo_db, pg_cur)
        migrate_pocs(mongo_db, pg_cur)
        migrate_roadmaps(mongo_db, pg_cur)
        migrate_implementations(mongo_db, pg_cur)
        migrate_feeds(mongo_db, pg_cur)
        migrate_articles(mongo_db, pg_cur)

        pg_conn.commit()
        print("\nMigration completed successfully.")

    except Exception as exc:
        pg_conn.rollback()
        print(f"\nERROR — transaction rolled back: {exc}")
        raise

    finally:
        pg_cur.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
