// Prototype GEO (ADR-0007) : la matrice de reputation IA se calcule correctement
// sur les fixtures, et les metriques GEO sont distinctes de la Confidence humaine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { geoSnapshot } from "../src/geo/run.ts";

test("snapshot GEO sur fixtures : matrice par modele + score global", async () => {
  const snap = await geoSnapshot("Chart Fanatics", { live: false });

  assert.equal(snap.live, false);
  assert.equal(snap.models.length, 3);

  const byModel = Object.fromEntries(snap.models.map((m) => [m.model, m]));

  // OpenAI : 3 positive / 1 risk, toujours present.
  assert.equal(byModel["OpenAI"]!.net, 2);
  assert.equal(byModel["OpenAI"]!.presencePct, 100);

  // Grok : 3 risk, et 1 prompt de categorie sans mention -> 75% de presence.
  assert.equal(byModel["Grok"]!.net, -3);
  assert.equal(byModel["Grok"]!.mentions, 3);
  assert.equal(byModel["Grok"]!.presencePct, 75);

  // Global : 12 reponses, 11 mentions, net 0, reputation composite 71.
  assert.equal(snap.overall.runs, 12);
  assert.equal(snap.overall.mentions, 11);
  assert.equal(snap.overall.net, 0);
  assert.equal(snap.overall.aiReputation, 71);

  // Provenance : au moins un risk topic trace jusqu'a une reponse de modele.
  const risky = snap.classified.filter((c) => c.riskTopics.length > 0);
  assert.ok(risky.length >= 3);
  assert.ok(risky.every((c) => c.answer.length > 0));

  // G3 : accord inter-modeles — le theme "pricing" est corrobore par >= 2 modeles.
  const pricing = snap.riskThemes.find((t) => t.theme === "pricing");
  assert.ok(pricing, "theme pricing attendu");
  assert.ok(pricing!.corroborated);
  assert.ok(pricing!.models.length >= 2);
});

test("la presence est une metrique GEO, pas un tier de Confidence", async () => {
  const snap = await geoSnapshot("Chart Fanatics", { live: false });
  // Le snapshot GEO n'expose AUCUN tier de Confidence humain (fait_verifie...).
  assert.equal((snap as Record<string, unknown>)["confidence"], undefined);
  assert.ok(typeof snap.overall.presencePct === "number");
});
