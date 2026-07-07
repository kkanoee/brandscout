// Pertinence marque (prefilter) : le filtre "off-brand" ne doit garder, pour une
// cible tierce, que les Posts qui parlent vraiment de la marque. Bug live observe :
// un post generique de r/Daytrading remontait dans le Report de "Chart Fanatics".
import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsBrand } from "../src/pipeline/prefilter.ts";

const B = "Chart Fanatics";

test("mention directe dans le contenu", () => {
  assert.ok(mentionsBrand({ content: "Chart Fanatics is overpriced", contextTitle: null }, B));
});

test("variantes espaces/tirets (chart-fanatics, chartfanatics)", () => {
  assert.ok(mentionsBrand({ content: "love chartfanatics tbh", contextTitle: null }, B));
  assert.ok(mentionsBrand({ content: "chart-fanatics review", contextTitle: null }, B));
});

test("pertinent par le titre du thread meme si le commentaire ne nomme pas la marque", () => {
  assert.ok(
    mentionsBrand({ content: "way overpriced honestly", contextTitle: "Is Chart Fanatics worth it?" }, B),
  );
});

test("post generique non lie -> non pertinent (c'est le bruit filtre)", () => {
  assert.equal(
    mentionsBrand({ content: "A simple daytrading strategy with 1:5 R:R", contextTitle: "Weekly wins thread" }, B),
    false,
  );
});
