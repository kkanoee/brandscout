// Mapping CLI-backend (ADR-0008) : la sortie JSON heterogene de twitter-cli /
// rdt-cli est mappee correctement vers RawPost. (Le spawn live n'est pas teste
// ici — il exige les CLIs installes + session connectee.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { __mapItems } from "../src/connectors/cliBackend.ts";

test("X / twitter-cli : enveloppe {items:[...]} -> RawPost", () => {
  const raw = JSON.stringify({
    items: [
      { id: "1", author: "alice", text: "Great tweet about the brand", url: "https://x.com/alice/status/1", created_at: "2026-06-01T12:00:00Z" },
      { id: "2", username: "bob", full_text: "another mention", created_at: "2026-06-02T12:00:00Z" },
    ],
  });
  const posts = __mapItems("x", raw);
  assert.equal(posts.length, 2);
  assert.equal(posts[0]!.connector, "x");
  assert.equal(posts[0]!.sourceKey, "x");
  assert.equal(posts[0]!.author, "alice");
  assert.equal(posts[0]!.content, "Great tweet about the brand");
  assert.equal(posts[0]!.publishedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(posts[1]!.author, "bob"); // fallback username
});

test("Reddit / rdt-cli : tableau brut + subreddit + epoch -> RawPost", () => {
  const raw = JSON.stringify([
    { id: "abc", author: "carol", title: "T", selftext: "post body", permalink: "/r/Daytrading/comments/abc", subreddit: "Daytrading", created_utc: 1716200000 },
  ]);
  const posts = __mapItems("reddit", raw);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.connector, "reddit");
  assert.equal(posts[0]!.sourceKey, "r/Daytrading"); // sourceKey derive du subreddit
  assert.equal(posts[0]!.author, "carol");
  assert.ok(posts[0]!.content.length > 0);
  assert.match(posts[0]!.publishedAt!, /^2024-/); // epoch (s) -> ISO
});

test("robustesse : items sans contenu ignores, JSON invalide -> []", () => {
  assert.equal(__mapItems("x", JSON.stringify({ items: [{ id: "x", author: "z" }] })).length, 0);
  assert.equal(__mapItems("x", "not json at all").length, 0);
});
