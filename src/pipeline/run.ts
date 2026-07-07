// Orchestrateur d'un Run : collecte -> pre-filtre -> extraction -> synthese +
// confidence -> report. Chaque etape met a jour le statut et persiste tout
// (ADR-0005). On-demand : un Run = une analyse d'UNE Brand a l'instant T.
import type { Post, RunStats } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { config } from "../config.ts";
import { geoSnapshot } from "../geo/run.ts";
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
        brand: brand.name,
      });
      repo.insertPosts(runId, target.id, raw, brand.officialHandles);
      collected += raw.length;
      log(`  ${raw.length} Posts collected.`);
    }

    // --- Pre-filtre deterministe (avant le LLM) ------------------------------
    // Pertinence marque : on EXIGE la mention de la marque pour toute cible, SAUF
    // une seed source qui EST la propriete de la marque (sa chaine : value == marque)
    // dont les commentaires sont pertinents par contexte meme sans la nommer.
    const brandLc = brand.name.toLowerCase();
    const brandGatedTargetIds = new Set(
      targets
        .filter((t) => !(t.mode === "seed_source" && t.value.toLowerCase() === brandLc))
        .map((t) => t.id),
    );
    const pass1 = prefilter(repo.listPosts(runId), {
      brand: brand.name,
      brandGatedTargetIds,
    });
    log(`Prefilter: ${pass1.kept.length} kept, ${pass1.filtered} filtered.`);

    // --- Profondeur : commentaires/reponses des publications pertinentes -----
    // On descend SOUS chaque publication gardee (X : reponses au tweet, Reddit :
    // commentaires du post). Ils deviennent des Posts (parent = la publication),
    // pertinents par contexte -> analyses comme le reste. C'est souvent la que se
    // trouve la vraie perception (le post est l'annonce ; les reponses, l'opinion).
    const REPLY_CAP = 8;
    let kept = pass1.kept;
    let filtered = pass1.filtered;
    let replyCollected = 0;
    for (const parent of pass1.kept) {
      if (parent.parentExternalId) continue; // deja une reponse
      const conn = getConnector(parent.connector);
      if (!conn.fetchReplies) continue;
      try {
        const replies = await conn.fetchReplies(parent, { max: REPLY_CAP });
        for (const r of replies) {
          r.parentExternalId = parent.externalId;
          r.contextTitle = parent.contextTitle ?? parent.content.slice(0, 140);
          r.contextUrl = parent.contextUrl ?? parent.url;
        }
        if (replies.length) {
          repo.insertPosts(runId, parent.targetId, replies, brand.officialHandles);
          replyCollected += replies.length;
        }
      } catch (e) {
        log(`  ! replies ${parent.connector}/${parent.externalId} skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (replyCollected > 0) {
      collected += replyCollected;
      // Les reponses sont pertinentes par construction (sous une publication gardee)
      // -> pas de gate marque, juste longueur/spam/doublons.
      const newReplies = repo.listPosts(runId).filter((p) => p.parentExternalId != null);
      const pass2 = prefilter(newReplies);
      kept = [...kept, ...pass2.kept];
      filtered += pass2.filtered;
      log(`Depth: ${replyCollected} comments/replies collected, ${pass2.kept.length} kept.`);
    }
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

    // --- GEO / source IA (ADR-0007) : snapshot parallele, persiste a part -----
    // Hors chemin critique : un echec GEO ne fait pas echouer le Run.
    try {
      const geoLive = config.geo.liveInRun && config.mode !== "fixtures";
      const geo = await geoSnapshot(brand.name, { live: geoLive });
      repo.saveGeo(runId, geo);
      log(`GEO : AI reputation ${geo.overall.aiReputation}/100 (${geo.live ? "live" : "fixtures"}), ${geo.models.length} modeles.`);
    } catch (e) {
      log(`GEO ignore : ${e instanceof Error ? e.message : String(e)}`);
    }

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
