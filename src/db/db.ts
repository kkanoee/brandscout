// Connexion SQLite (better-sqlite3) + repository. Local-first (ADR-0005).
import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.ts";
import type {
  Brand,
  CollectionTarget,
  Run,
  RunStats,
  RunStatus,
  Post,
  RawPost,
  Observation,
  Finding,
  Report,
  CollectionMode,
  ConnectorName,
} from "../domain/types.ts";

const here = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = resolve(process.cwd(), config.server.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(resolve(here, "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  return db;
}

// Migrations idempotentes pour les bases creees avant un ajout de colonne.
function migrate(d: Database.Database): void {
  ensureColumn(d, "post", "context_title", "TEXT");
  ensureColumn(d, "post", "context_url", "TEXT");
}
function ensureColumn(
  d: Database.Database,
  table: string,
  column: string,
  decl: string,
): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

const now = (): string => new Date().toISOString();

// --- Mappers (row brut -> type de domaine) -----------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapBrand(r: any): Brand {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}
function mapTarget(r: any): CollectionTarget {
  return {
    id: r.id,
    brandId: r.brand_id,
    mode: r.mode as CollectionMode,
    connector: r.connector as ConnectorName,
    value: r.value,
    label: r.label ?? null,
    createdAt: r.created_at,
  };
}
function mapRun(r: any): Run {
  return {
    id: r.id,
    brandId: r.brand_id,
    status: r.status as RunStatus,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    windowMonths: r.window_months,
    volumeCap: r.volume_cap,
    error: r.error ?? null,
    stats: r.stats_json ? (JSON.parse(r.stats_json) as RunStats) : null,
  };
}
function mapPost(r: any): Post {
  return {
    id: r.id,
    runId: r.run_id,
    targetId: r.target_id ?? null,
    connector: r.connector as ConnectorName,
    sourceKey: r.source_key,
    externalId: r.external_id,
    author: r.author,
    content: r.content,
    url: r.url,
    contextTitle: r.context_title ?? null,
    contextUrl: r.context_url ?? null,
    publishedAt: r.published_at ?? null,
    collectedAt: r.collected_at,
    kept: !!r.kept,
    filteredReason: r.filtered_reason ?? null,
  };
}
function mapObservation(r: any): Observation {
  return {
    id: r.id,
    runId: r.run_id,
    postId: r.post_id,
    theme: r.theme,
    sentiment: r.sentiment,
    kind: r.kind,
    claim: r.claim,
    createdAt: r.created_at,
  };
}
function mapFinding(r: any): Finding {
  return {
    id: r.id,
    runId: r.run_id,
    section: r.section,
    theme: r.theme ?? null,
    statement: r.statement,
    confidence: r.confidence,
    distinctAuthors: r.distinct_authors,
    distinctSources: r.distinct_sources,
    rationale: r.rationale ?? null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Repository ---------------------------------------------------------------

export const repo = {
  // Brands
  createBrand(name: string): Brand {
    const d = getDb();
    const info = d
      .prepare("INSERT INTO brand (name, created_at) VALUES (?, ?)")
      .run(name.trim(), now());
    return this.getBrand(Number(info.lastInsertRowid))!;
  },
  getBrand(id: number): Brand | null {
    const r = getDb().prepare("SELECT * FROM brand WHERE id = ?").get(id);
    return r ? mapBrand(r) : null;
  },
  findBrandByName(name: string): Brand | null {
    const r = getDb()
      .prepare("SELECT * FROM brand WHERE name = ?")
      .get(name.trim());
    return r ? mapBrand(r) : null;
  },
  upsertBrand(name: string): Brand {
    return this.findBrandByName(name) ?? this.createBrand(name);
  },
  listBrands(): Brand[] {
    return getDb()
      .prepare("SELECT * FROM brand ORDER BY name")
      .all()
      .map(mapBrand);
  },

  // Targets
  addTarget(
    brandId: number,
    mode: CollectionMode,
    connector: ConnectorName,
    value: string,
    label: string | null,
  ): CollectionTarget {
    const d = getDb();
    const info = d
      .prepare(
        `INSERT INTO collection_target (brand_id, mode, connector, value, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(brandId, mode, connector, value.trim(), label, now());
    return mapTarget(
      d.prepare("SELECT * FROM collection_target WHERE id = ?").get(
        Number(info.lastInsertRowid),
      ),
    );
  },
  listTargets(brandId: number): CollectionTarget[] {
    return getDb()
      .prepare("SELECT * FROM collection_target WHERE brand_id = ? ORDER BY id")
      .all(brandId)
      .map(mapTarget);
  },
  deleteTarget(id: number): void {
    getDb().prepare("DELETE FROM collection_target WHERE id = ?").run(id);
  },

  // Runs
  createRun(brandId: number, windowMonths: number, volumeCap: number): Run {
    const d = getDb();
    const info = d
      .prepare(
        `INSERT INTO run (brand_id, status, started_at, window_months, volume_cap)
         VALUES (?, 'pending', ?, ?, ?)`,
      )
      .run(brandId, now(), windowMonths, volumeCap);
    return this.getRun(Number(info.lastInsertRowid))!;
  },
  getRun(id: number): Run | null {
    const r = getDb().prepare("SELECT * FROM run WHERE id = ?").get(id);
    return r ? mapRun(r) : null;
  },
  listRuns(brandId?: number): Run[] {
    const d = getDb();
    const rows = brandId
      ? d.prepare("SELECT * FROM run WHERE brand_id = ? ORDER BY id DESC").all(brandId)
      : d.prepare("SELECT * FROM run ORDER BY id DESC").all();
    return rows.map(mapRun);
  },
  setRunStatus(id: number, status: RunStatus): void {
    getDb().prepare("UPDATE run SET status = ? WHERE id = ?").run(status, id);
  },
  finishRun(id: number, status: RunStatus, stats: RunStats | null, error: string | null): void {
    getDb()
      .prepare(
        "UPDATE run SET status = ?, finished_at = ?, stats_json = ?, error = ? WHERE id = ?",
      )
      .run(status, now(), stats ? JSON.stringify(stats) : null, error, id);
  },

  // Posts
  insertPosts(
    runId: number,
    targetId: number | null,
    posts: RawPost[],
  ): Post[] {
    const d = getDb();
    const stmt = d.prepare(
      `INSERT INTO post (run_id, target_id, connector, source_key, external_id,
         author, content, url, context_title, context_url, published_at, collected_at, kept, filtered_reason)
       VALUES (@run_id, @target_id, @connector, @source_key, @external_id,
         @author, @content, @url, @context_title, @context_url, @published_at, @collected_at, 1, NULL)`,
    );
    const collectedAt = now();
    const ids: number[] = [];
    const tx = d.transaction((rows: RawPost[]) => {
      for (const p of rows) {
        const info = stmt.run({
          run_id: runId,
          target_id: targetId,
          connector: p.connector,
          source_key: p.sourceKey,
          external_id: p.externalId,
          author: p.author,
          content: p.content,
          url: p.url,
          context_title: p.contextTitle ?? null,
          context_url: p.contextUrl ?? null,
          published_at: p.publishedAt,
          collected_at: collectedAt,
        });
        ids.push(Number(info.lastInsertRowid));
      }
    });
    tx(posts);
    return ids.map((id) => this.getPost(id)!);
  },
  getPost(id: number): Post | null {
    const r = getDb().prepare("SELECT * FROM post WHERE id = ?").get(id);
    return r ? mapPost(r) : null;
  },
  markPostFiltered(id: number, reason: string): void {
    getDb()
      .prepare("UPDATE post SET kept = 0, filtered_reason = ? WHERE id = ?")
      .run(reason, id);
  },
  listKeptPosts(runId: number): Post[] {
    return getDb()
      .prepare("SELECT * FROM post WHERE run_id = ? AND kept = 1 ORDER BY id")
      .all(runId)
      .map(mapPost);
  },
  listPosts(runId: number): Post[] {
    return getDb()
      .prepare("SELECT * FROM post WHERE run_id = ? ORDER BY id")
      .all(runId)
      .map(mapPost);
  },

  // Observations
  insertObservation(o: Omit<Observation, "id" | "createdAt">): Observation {
    const d = getDb();
    const info = d
      .prepare(
        `INSERT INTO observation (run_id, post_id, theme, sentiment, kind, claim, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(o.runId, o.postId, o.theme, o.sentiment, o.kind, o.claim, now());
    return mapObservation(
      d.prepare("SELECT * FROM observation WHERE id = ?").get(Number(info.lastInsertRowid)),
    );
  },
  listObservations(runId: number): Observation[] {
    return getDb()
      .prepare("SELECT * FROM observation WHERE run_id = ? ORDER BY id")
      .all(runId)
      .map(mapObservation);
  },

  // Findings
  insertFinding(
    f: Omit<Finding, "id" | "createdAt">,
    observationIds: number[],
  ): Finding {
    const d = getDb();
    const tx = d.transaction(() => {
      const info = d
        .prepare(
          `INSERT INTO finding (run_id, section, theme, statement, confidence,
             distinct_authors, distinct_sources, rationale, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          f.runId,
          f.section,
          f.theme,
          f.statement,
          f.confidence,
          f.distinctAuthors,
          f.distinctSources,
          f.rationale,
          now(),
        );
      const fid = Number(info.lastInsertRowid);
      const link = d.prepare(
        "INSERT OR IGNORE INTO finding_observation (finding_id, observation_id) VALUES (?, ?)",
      );
      for (const oid of observationIds) link.run(fid, oid);
      return fid;
    });
    const fid = tx();
    return mapFinding(d.prepare("SELECT * FROM finding WHERE id = ?").get(fid));
  },
  listFindings(runId: number): Finding[] {
    return getDb()
      .prepare("SELECT * FROM finding WHERE run_id = ? ORDER BY id")
      .all(runId)
      .map(mapFinding);
  },
  listFindingObservations(findingId: number): Observation[] {
    return getDb()
      .prepare(
        `SELECT o.* FROM observation o
         JOIN finding_observation fo ON fo.observation_id = o.id
         WHERE fo.finding_id = ? ORDER BY o.id`,
      )
      .all(findingId)
      .map(mapObservation);
  },

  // Report
  saveReport(runId: number, overview: string): Report {
    const d = getDb();
    d.prepare(
      `INSERT INTO report (run_id, overview, generated_at) VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET overview = excluded.overview, generated_at = excluded.generated_at`,
    ).run(runId, overview, now());
    return this.getReport(runId)!;
  },
  getReport(runId: number): Report | null {
    const r = getDb().prepare("SELECT * FROM report WHERE run_id = ?").get(runId);
    return r
      ? { runId: (r as any).run_id, overview: (r as any).overview, generatedAt: (r as any).generated_at }
      : null;
  },
};
