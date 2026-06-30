-- Schema BrandScout (ADR-0005 : SQLite local-first, chaque Run persiste integralement).
-- Modelise la chaine Post -> Observation -> Finding -> Confidence avec les Sources
-- (ADR-0003), pas seulement le Report final.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS brand (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Une Seed Source ou une Keyword Query rattachee a une Brand (editee via l'ecran 1).
CREATE TABLE IF NOT EXISTS collection_target (
  id         INTEGER PRIMARY KEY,
  brand_id   INTEGER NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL CHECK (mode IN ('seed_source','keyword_query')),
  connector  TEXT NOT NULL CHECK (connector IN ('youtube','reddit')),
  value      TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_target_brand ON collection_target(brand_id);

CREATE TABLE IF NOT EXISTS run (
  id            INTEGER PRIMARY KEY,
  brand_id      INTEGER NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  window_months INTEGER NOT NULL,
  volume_cap    INTEGER NOT NULL,
  error         TEXT,
  stats_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_run_brand ON run(brand_id);

CREATE TABLE IF NOT EXISTS post (
  id              INTEGER PRIMARY KEY,
  run_id          INTEGER NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  target_id       INTEGER REFERENCES collection_target(id) ON DELETE SET NULL,
  connector       TEXT NOT NULL,
  source_key      TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  author          TEXT NOT NULL,
  content         TEXT NOT NULL,
  url             TEXT NOT NULL,
  context_title   TEXT,
  context_url     TEXT,
  published_at    TEXT,
  collected_at    TEXT NOT NULL,
  kept            INTEGER NOT NULL DEFAULT 1,
  filtered_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_post_run ON post(run_id);

CREATE TABLE IF NOT EXISTS observation (
  id         INTEGER PRIMARY KEY,
  run_id     INTEGER NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  theme      TEXT NOT NULL,
  sentiment  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  claim      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_run ON observation(run_id);
CREATE INDEX IF NOT EXISTS idx_obs_post ON observation(post_id);

CREATE TABLE IF NOT EXISTS finding (
  id               INTEGER PRIMARY KEY,
  run_id           INTEGER NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  section          TEXT NOT NULL,
  theme            TEXT,
  statement        TEXT NOT NULL,
  confidence       TEXT NOT NULL,
  distinct_authors INTEGER NOT NULL,
  distinct_sources INTEGER NOT NULL,
  rationale        TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finding_run ON finding(run_id);

-- Table de liaison Finding <-> Observation (ADR-0003 : tracabilite jusqu'aux Posts).
CREATE TABLE IF NOT EXISTS finding_observation (
  finding_id     INTEGER NOT NULL REFERENCES finding(id) ON DELETE CASCADE,
  observation_id INTEGER NOT NULL REFERENCES observation(id) ON DELETE CASCADE,
  PRIMARY KEY (finding_id, observation_id)
);

CREATE TABLE IF NOT EXISTS report (
  run_id       INTEGER PRIMARY KEY REFERENCES run(id) ON DELETE CASCADE,
  overview     TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

-- Snapshot GEO (source IA, ADR-0007) : stocke a part, en JSON. Scoring distinct
-- du barème de Confidence humain (ce n'est PAS un Finding).
CREATE TABLE IF NOT EXISTS geo (
  run_id        INTEGER PRIMARY KEY REFERENCES run(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  generated_at  TEXT NOT NULL
);
