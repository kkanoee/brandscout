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
      throw new Error("Aucune Seed Source / Keyword Query pour cette Brand.");
    }
    let collected = 0;
    for (const target of targets) {
      const connector = getConnector(target.connector);
      if (!connector.supports(target.mode)) {
        log(`! ${target.connector} ne supporte pas ${target.mode} en v1 — ignore (#${target.id}).`);
        continue;
      }
      log(`Collecte ${target.connector}/${target.mode} « ${target.value} »…`);
      const raw = await connector.collect(target, {
        windowMonths: run.windowMonths,
        volumeCap: run.volumeCap,
      });
      repo.insertPosts(runId, target.id, raw);
      collected += raw.length;
      log(`  ${raw.length} Posts collectes.`);
    }

    // --- Pre-filtre deterministe (avant le LLM) ------------------------------
    const allPosts = repo.listPosts(runId);
    const { kept, filtered } = prefilter(allPosts);
    log(`Pre-filtre : ${kept.length} gardes, ${filtered} ecartes.`);
    if (kept.length === 0) {
      throw new Error("Aucun Post exploitable apres pre-filtre.");
    }
    const postsMap = new Map<number, Post>(kept.map((p) => [p.id, p]));

    // --- Extraction (etage mecanique) ----------------------------------------
    repo.setRunStatus(runId, "extracting");
    const observations = await extract(runId, kept);
    log(`Extraction : ${observations.length} Observations.`);

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
    log(`Synthese : ${allFindings.length} Findings (dont ${opportunities.length} opportunites).`);

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
    log(`Run #${runId} termine.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERREUR: ${msg}`);
    repo.finishRun(runId, "error", null, msg);
    throw err;
  }
}
