// Test bout-en-bout (etape 8) en mode fixtures : un Run complet sur la Brand de
// demonstration produit un Report tracable avec les bons tiers de Confidence.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Configure l'environnement AVANT d'importer la config (lue au chargement).
const TEST_DB = "data/test-e2e.sqlite";
process.env.BRANDSCOUT_MODE = "fixtures";
process.env.DB_PATH = TEST_DB;

const { repo } = await import("../src/db/db.ts");
const { seedDemo } = await import("../src/seed.ts");
const { executeRun } = await import("../src/pipeline/run.ts");

function cleanup() {
  for (const ext of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(TEST_DB + ext); } catch { /* absent */ }
  }
}

before(cleanup);
after(cleanup);

test("Run complet sur Chart Fanatics -> Report tracable", async () => {
  const brand = seedDemo();
  assert.ok(brand.id > 0);
  assert.equal(repo.listTargets(brand.id).length, 4);

  const run = repo.createRun(brand.id, 6, 500);
  await executeRun(run.id);

  const done = repo.getRun(run.id);
  assert.equal(done?.status, "done");
  assert.ok(done?.stats);
  assert.equal(done!.stats!.collected, 16);
  assert.ok(done!.stats!.observations > 0);

  const findings = repo.listFindings(run.id);
  assert.ok(findings.length > 0);

  // Tracabilite : chaque Finding (hors opportunites inferees) pointe vers des Observations.
  for (const f of findings) {
    if (f.section === "opportunities") continue;
    const obs = repo.listFindingObservations(f.id);
    assert.ok(obs.length > 0, `Finding ${f.id} sans observation`);
  }

  const byTier = (t: string) => findings.filter((f) => f.confidence === t);
  // pricing + support corrobores sur plusieurs sources -> Fait verifie
  assert.ok(byTier("fait_verifie").length >= 1, "au moins un Fait verifie attendu");
  // content_quality : 3 auteurs, 1 source -> Signal probable
  assert.ok(byTier("signal_probable").length >= 1, "au moins un Signal probable attendu");
  // trust : 1 auteur -> Intuition
  assert.ok(byTier("intuition").length >= 1, "au moins une Intuition attendue");

  // Invariant ADR-0003 : un Fait verifie pointe vers >= 2 sources distinctes.
  for (const f of byTier("fait_verifie")) {
    assert.ok(f.distinctSources >= 2, `Fait verifie ${f.id} avec ${f.distinctSources} source(s)`);
  }

  // Report present
  assert.ok(repo.getReport(run.id)?.overview);
});
