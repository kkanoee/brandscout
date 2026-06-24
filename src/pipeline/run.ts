// Orchestrateur d'un Run : collecte -> pre-filtre -> extraction -> synthese +
// confidence -> report. Chaque etape met a jour le statut et persiste tout
// (ADR-0005). On-demand : un Run = une analyse d'UNE Brand a l'instant T.
import type { Post, RunStats } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { getConnector } from "../connectors/connector.ts";
import { prefilter } from "./prefilter.ts";
import { extract } from "./extract.ts";
import { synthesize, synthesizeOpportunities } from "./synthesize.ts";
import { generateReport } from "./report.ts";

export interface RunHooks {
  log?: (msg: string) => void;
}

export async function executeRun(runId: number, hooks: RunHooks = {}): Promise<void> {
  const log = hooks.log ?? (() => {});
  const run = repo.getRun(runId);
  if (!run) throw new Error(`Run ${runId} introuvable`);
  const brand = repo.getBrand(run.brandId);
  if (!brand) throw new Error(`Brand ${run.brandId} introuvable`);

  try {
    // --- Collecte ------------------------------------------------------------
    repo.setRunStatus(runId, "collecting");
    const targets = repo.listTargets(brand.id);
    if (targets.length === 0) {
      throw new Error("No Seed Source / Keyword Query for this Brand.");
    }
    let collected = 0;
    for (const target of targets) {
      const connector = getConnector(target.connector);
      if (!connector.supports(target.mode)) {
        log(`! ${target.connector} does not support ${target.mode} in v1 — skipped (#${target.id}).`);
        continue;
      }
      log(`Collecting ${target.connector}/${target.mode} "${target.value}"…`);
      const raw = await connector.collect(target, {
        windowMonths: run.windowMonths,
        volumeCap: run.volumeCap,
      });
      repo.insertPosts(runId, target.id, raw);
      collected += raw.length;
      log(`  ${raw.length} Posts collected.`);
    }

    // --- Pre-filtre deterministe (avant le LLM) ------------------------------
    const allPosts = repo.listPosts(runId);
    const { kept, filtered } = prefilter(allPosts);
    log(`Prefilter: ${kept.length} kept, ${filtered} filtered.`);
    if (kept.length === 0) {
      throw new Error("No usable Post after prefilter.");
    }
    const postsMap = new Map<number, Post>(kept.map((p) => [p.id, p]));

    // --- Extraction (etage mecanique) ----------------------------------------
    repo.setRunStatus(runId, "extracting");
    const observations = await extract(runId, kept);
    log(`Extraction: ${observations.length} Observations.`);

    // --- Synthese + Confidence (etage jugement) ------------------------------
    repo.setRunStatus(runId, "synthesizing");
    const findings = await synthesize(runId, observations, postsMap);
    const opportunities = await synthesizeOpportunities(
      runId,
      brand.name,
      observations,
      findings,
    );
    const allFindings = [...findings, ...opportunities];
    log(`Synthesis: ${allFindings.length} Findings (incl. ${opportunities.length} opportunities).`);

    // --- Report --------------------------------------------------------------
    repo.setRunStatus(runId, "reporting");
    await generateReport(runId, brand.name, allFindings);

    const stats: RunStats = {
      collected,
      kept: kept.length,
      filtered,
      observations: observations.length,
      findings: allFindings.length,
    };
    repo.finishRun(runId, "done", stats, null);
    log(`Run #${runId} done.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    repo.finishRun(runId, "error", null, msg);
    throw err;
  }
}
