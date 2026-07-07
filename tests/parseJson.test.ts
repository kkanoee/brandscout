// parseJson (router) doit tolerer une sortie LLM tronquee a max_tokens :
// recuperer les elements complets plutot que faire echouer le Run (bug live
// observe avec deepseek-flash : "Expected ',' or ']' after array element").
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson } from "../src/llm/router.ts";

test("JSON intact : parse normal", () => {
  const r = parseJson<{ observations: { postId: number }[] }>(
    '{"observations":[{"postId":9,"claim":"x"}]}',
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0]!.postId, 9);
});

test("tableau tronque : garde les elements complets, referme le conteneur", () => {
  const truncated =
    '{"observations":[{"postId":1,"claim":"too expensive"},{"postId":2,"claim":"fast replies"},{"postId":3,"claim":"neu';
  const r = parseJson<{ observations: { postId: number }[] }>(truncated);
  assert.equal(r.observations.length, 2);
  assert.deepEqual(r.observations.map((o) => o.postId), [1, 2]);
});

test("texte autour + troncature : extrait le bloc et recupere", () => {
  const r = parseJson<{ observations: { postId: number }[] }>(
    'Sure:\n{"observations":[{"postId":5,"claim":"good"},{"postId',
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0]!.postId, 5);
});

test("accolade litterale dans une string + troncature : scan conscient des strings", () => {
  const r = parseJson<{ observations: { postId: number }[] }>(
    '{"observations":[{"postId":7,"claim":"they said {refund} slowly"},{"postId":8,"claim":"trun',
  );
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0]!.postId, 7);
});

test("vraiment illisible : leve une erreur (batch ignore en amont)", () => {
  assert.throws(() => parseJson("no json here at all"));
});
