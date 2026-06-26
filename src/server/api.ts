// Logique applicative de l'API (separee du transport HTTP pour rester testable).
import { repo } from "../db/db.ts";
import { seedDemo } from "../seed.ts";
import { executeRun } from "../pipeline/run.ts";
import { config } from "../config.ts";
import { TIER_LABEL } from "../pipeline/confidence.ts";
import type {
  CollectionMode,
  ConnectorName,
  Finding,
  ReportSection,
} from "../domain/types.ts";

// Journaux en memoire par Run (pour l'affichage live de l'ecran 1).
const runLogs = new Map<number, string[]>();

export function listBrands() {
  return repo.listBrands().map((b) => ({
    ...b,
    targets: repo.listTargets(b.id),
    runCount: repo.listRuns(b.id).length,
  }));
}

export function createBrand(name: string) {
  if (!name || !name.trim()) throw new HttpError(400, "Brand name required.");
  return repo.upsertBrand(name);
}

export function addTarget(
  brandId: number,
  mode: CollectionMode,
  connector: ConnectorName,
  value: string,
  label: string | null,
) {
  if (!repo.getBrand(brandId)) throw new HttpError(404, "Brand not found.");
  if (!value || !value.trim()) throw new HttpError(400, "Target value required.");
  if (connector === "youtube" && mode === "keyword_query") {
    throw new HttpError(400, "YouTube only supports Seed Source in v1 (ADR-0001).");
  }
  return repo.addTarget(brandId, mode, connector, value, label);
}

export function deleteTarget(id: number) {
  repo.deleteTarget(id);
  return { ok: true };
}

export function startRun(brandId: number) {
  const brand = repo.getBrand(brandId);
  if (!brand) throw new HttpError(404, "Brand not found.");
  if (repo.listTargets(brandId).length === 0) {
    throw new HttpError(400, "Add at least one Seed Source or Keyword Query.");
  }
  const run = repo.createRun(brandId, config.run.windowMonths, config.run.volumeCap);
  const logs: string[] = [];
  runLogs.set(run.id, logs);

  // On-demand, asynchrone : on rend la main tout de suite, l'UI sonde le statut.
  executeRun(run.id, {
    log: (m) => logs.push(`${new Date().toLocaleTimeString()}  ${m}`),
  }).catch(() => {
    /* l'erreur est deja persistee sur le Run (status=error) */
  });

  return { runId: run.id };
}

export function listRuns(brandId?: number) {
  const runs = repo.listRuns(brandId);
  return runs.map((r) => ({ ...r, brandName: repo.getBrand(r.brandId)?.name ?? "?" }));
}

export function getRunDetail(runId: number) {
  const run = repo.getRun(runId);
  if (!run) throw new HttpError(404, "Run not found.");
  const brand = repo.getBrand(run.brandId);
  const report = repo.getReport(runId);
  const findings = repo.listFindings(runId);

  const enrich = (f: Finding) => ({
    id: f.id,
    section: f.section,
    theme: f.theme,
    statement: f.statement,
    confidence: f.confidence,
    confidenceLabel: TIER_LABEL[f.confidence],
    distinctAuthors: f.distinctAuthors,
    distinctSources: f.distinctSources,
    rationale: f.rationale,
    observations: repo.listFindingObservations(f.id).map((o) => {
      const post = repo.getPost(o.postId);
      return {
        claim: o.claim,
        sentiment: o.sentiment,
        kind: o.kind,
        post: post
          ? {
              author: post.author,
              sourceKey: post.sourceKey,
              connector: post.connector,
              url: post.url,
              contextTitle: post.contextTitle,
              contextUrl: post.contextUrl,
              content: post.content,
              publishedAt: post.publishedAt,
            }
          : null,
      };
    }),
  });

  const sections: Record<ReportSection, ReturnType<typeof enrich>[]> = {
    perception: [],
    strengths: [],
    critiques: [],
    themes: [],
    opportunities: [],
  };
  for (const f of findings) sections[f.section].push(enrich(f));

  return {
    run: { ...run, brandName: brand?.name ?? "?" },
    overview: report?.overview ?? null,
    sections,
    logs: runLogs.get(runId) ?? [],
  };
}

export function getConfig() {
  return {
    mode: config.mode,
    mechanicalModel: config.llm.mechanicalModel,
    judgmentModel: config.llm.judgmentModel,
    windowMonths: config.run.windowMonths,
    volumeCap: config.run.volumeCap,
    confidence: config.confidence,
  };
}

export function seed() {
  const b = seedDemo();
  return { brandId: b.id, name: b.name, targets: repo.listTargets(b.id).length };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
