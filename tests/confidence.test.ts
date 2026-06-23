// Invariants de Confidence (ADR-0003/0004) : la preuve plafonne le tier.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeConfidence, cap } from "../src/pipeline/confidence.ts";
import type { Observation, Post } from "../src/domain/types.ts";

function post(id: number, author: string, sourceKey: string): Post {
  return {
    id, runId: 1, targetId: null, connector: "reddit", sourceKey,
    externalId: `e${id}`, author, content: "x", url: "u",
    publishedAt: null, collectedAt: "", kept: true, filteredReason: null,
  };
}
function obs(id: number, postId: number): Observation {
  return { id, runId: 1, postId, theme: "t", sentiment: "negative", kind: "critique", claim: "c", createdAt: "" };
}

test("3 auteurs sur 2 sources distinctes -> Fait verifie", () => {
  const posts = new Map([
    [1, post(1, "a", "r/A")],
    [2, post(2, "b", "r/A")],
    [3, post(3, "c", "r/B")],
  ]);
  const e = computeConfidence([obs(1, 1), obs(2, 2), obs(3, 3)], posts);
  assert.equal(e.tier, "fait_verifie");
  assert.equal(e.distinctAuthors, 3);
  assert.equal(e.distinctSources, 2);
});

test("3 auteurs sur 1 seule source -> Signal probable", () => {
  const posts = new Map([
    [1, post(1, "a", "r/A")],
    [2, post(2, "b", "r/A")],
    [3, post(3, "c", "r/A")],
  ]);
  const e = computeConfidence([obs(1, 1), obs(2, 2), obs(3, 3)], posts);
  assert.equal(e.tier, "signal_probable");
});

test("1 auteur -> Intuition", () => {
  const posts = new Map([[1, post(1, "a", "r/A")]]);
  const e = computeConfidence([obs(1, 1)], posts);
  assert.equal(e.tier, "intuition");
});

test("meme auteur compte une seule voix (independance v1)", () => {
  const posts = new Map([
    [1, post(1, "same", "r/A")],
    [2, post(2, "same", "r/B")],
    [3, post(3, "same", "r/C")],
  ]);
  const e = computeConfidence([obs(1, 1), obs(2, 2), obs(3, 3)], posts);
  assert.equal(e.distinctAuthors, 1);
  assert.equal(e.tier, "intuition"); // 1 voix, peu importe les sources
});

test("cap : le LLM ne surclasse jamais le plafond de preuve", () => {
  assert.equal(cap("fait_verifie", "intuition"), "intuition");
  assert.equal(cap("fait_verifie", "signal_probable"), "signal_probable");
  assert.equal(cap("intuition", "fait_verifie"), "intuition"); // ne promeut pas non plus
});
