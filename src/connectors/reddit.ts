// Connecteur Reddit. v1 : Seed Source (recherche de la MARQUE restreinte a un
// subreddit -> ce qui, dans cette communaute, parle de la marque) ET Keyword
// Query (recherche d'un terme sur tout Reddit). Gratuit via OAuth
// client-credentials (app "script"). Le sourceKey est r/<subreddit> du post,
// donc une Keyword Query peut couvrir plusieurs sources distinctes.
import type { CollectionTarget, RawPost, Post } from "../domain/types.ts";
import type { Connector, CollectOptions } from "./connector.ts";
import { withinWindow, windowStart, asPhrase } from "./connector.ts";
import { loadFixturePosts } from "./fixtures.ts";
import { cliSearch, cliReplies } from "./cliBackend.ts";
import { config } from "../config.ts";

const OAUTH = "https://oauth.reddit.com";

export class RedditConnector implements Connector {
  readonly name = "reddit" as const;
  private token: { value: string; exp: number } | null = null;
  private readonly live: boolean;

  constructor(live: boolean) {
    this.live = live;
  }

  supports(mode: CollectionTarget["mode"]): boolean {
    return mode === "seed_source" || mode === "keyword_query";
  }

  async collect(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    // Backend "cli" (rdt-cli, non-officiel, ADR-0008) : contourne l'API officielle.
    if (config.connectors.redditBackend === "cli") {
      if (config.mode !== "live") return loadFixturePosts("reddit", target);
      // seed_source = communaute tierce -> on cherche la MARQUE DANS le subreddit
      // (au lieu de ratisser toute la communaute). keyword_query = target.value est
      // deja le terme de recherche (souvent le nom de la marque).
      return target.mode === "seed_source"
        ? cliSearch("reddit", config.connectors.redditCliBin, asPhrase(opts.brand), ["-r", target.value])
        : cliSearch("reddit", config.connectors.redditCliBin, asPhrase(target.value));
    }
    // Backend "official" (OAuth Data API).
    if (!this.live) return loadFixturePosts("reddit", target);
    return target.mode === "seed_source"
      ? this.collectSubreddit(target, opts)
      : this.collectKeyword(target, opts);
  }

  // Commentaires d'un post (profondeur). Backend cli -> rdt read ; sinon API officielle.
  async fetchReplies(post: Post, opts: { max: number }): Promise<RawPost[]> {
    if (config.mode !== "live") return [];
    if (config.connectors.redditBackend === "cli") {
      return cliReplies("reddit", config.connectors.redditCliBin, post.externalId, ["-n", String(opts.max)]);
    }
    if (!this.live) return [];
    return this.collectComments(post, opts.max);
  }

  private async collectComments(post: Post, max: number): Promise<RawPost[]> {
    const sub = post.sourceKey.replace(/^r\//, "");
    const data = await this.api(
      `/r/${encodeURIComponent(sub)}/comments/${encodeURIComponent(post.externalId)}?limit=${max}&depth=1&sort=top`,
    );
    const listings = Array.isArray(data) ? data : [];
    const out: RawPost[] = [];
    for (const listing of listings) {
      for (const ch of listing?.data?.children ?? []) {
        const d = ch?.data;
        if (ch?.kind !== "t1" || !d?.body) continue;
        out.push({
          connector: "reddit",
          sourceKey: `r/${d.subreddit ?? sub}`,
          externalId: d.id,
          author: d.author ?? "unknown",
          content: d.body,
          url: d.permalink ? `https://www.reddit.com${d.permalink}` : post.url,
          publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        });
      }
    }
    return out;
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.exp > now + 30_000) return this.token.value;
    const creds = Buffer.from(
      `${config.connectors.redditClientId}:${config.connectors.redditClientSecret}`,
    ).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": config.connectors.redditUserAgent,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Reddit auth ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    this.token = { value: data.access_token, exp: now + data.expires_in * 1000 };
    return this.token.value;
  }

  private async api(path: string): Promise<any> {
    const token = await this.accessToken();
    const res = await fetch(`${OAUTH}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": config.connectors.redditUserAgent,
      },
    });
    if (!res.ok) throw new Error(`Reddit ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async collectSubreddit(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    const start = windowStart(opts.windowMonths);
    // seed_source = communaute tierce -> recherche de la MARQUE restreinte au
    // subreddit (restrict_sr=1), pas un ratissage de tout /new (qui ramenait du
    // bruit non lie a la marque).
    const q = encodeURIComponent(asPhrase(opts.brand));
    const sub = encodeURIComponent(target.value);
    return this.paginate(
      (after) =>
        `/r/${sub}/search?q=${q}&restrict_sr=1&sort=new&type=link&limit=100${after ? `&after=${after}` : ""}`,
      start,
      opts.volumeCap,
    );
  }

  private async collectKeyword(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    const start = windowStart(opts.windowMonths);
    const q = encodeURIComponent(asPhrase(target.value));
    return this.paginate(
      (after) => `/search?q=${q}&sort=new&type=link&limit=100${after ? `&after=${after}` : ""}`,
      start,
      opts.volumeCap,
    );
  }

  private async paginate(
    buildPath: (after: string) => string,
    start: Date,
    cap: number,
  ): Promise<RawPost[]> {
    const out: RawPost[] = [];
    let after = "";
    while (out.length < cap) {
      const data = await this.api(buildPath(after));
      const children = data?.data?.children ?? [];
      if (children.length === 0) break;
      for (const ch of children) {
        const d = ch?.data;
        if (!d) continue;
        const publishedAt = d.created_utc
          ? new Date(d.created_utc * 1000).toISOString()
          : null;
        if (!withinWindow(publishedAt, start)) continue;
        const permalink = `https://www.reddit.com${d.permalink}`;
        out.push({
          connector: "reddit",
          sourceKey: `r/${d.subreddit}`,
          externalId: d.id,
          author: d.author ?? "unknown",
          content: [d.title, d.selftext].filter(Boolean).join("\n\n"),
          url: permalink,
          // Contexte = le thread (titre + lien).
          contextTitle: d.title ?? null,
          contextUrl: permalink,
          publishedAt,
        });
        if (out.length >= cap) break;
      }
      after = data?.data?.after ?? "";
      if (!after) break;
    }
    return out;
  }
}
