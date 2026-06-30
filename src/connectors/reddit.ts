// Connecteur Reddit. v1 : Seed Source (un subreddit -> ses submissions) ET
// Keyword Query (recherche d'un terme sur tout Reddit). Gratuit via OAuth
// client-credentials (app "script"). Le sourceKey est r/<subreddit> du post,
// donc une Keyword Query peut couvrir plusieurs sources distinctes.
import type { CollectionTarget, RawPost } from "../domain/types.ts";
import type { Connector, CollectOptions } from "./connector.ts";
import { withinWindow, windowStart } from "./connector.ts";
import { loadFixturePosts } from "./fixtures.ts";
import { cliSearch } from "./cliBackend.ts";
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
      return cliSearch("reddit", config.connectors.redditCliBin, target.value);
    }
    // Backend "official" (OAuth Data API).
    if (!this.live) return loadFixturePosts("reddit", target);
    return target.mode === "seed_source"
      ? this.collectSubreddit(target, opts)
      : this.collectKeyword(target, opts);
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
    return this.paginate(
      (after) => `/r/${encodeURIComponent(target.value)}/new?limit=100${after ? `&after=${after}` : ""}`,
      start,
      opts.volumeCap,
    );
  }

  private async collectKeyword(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    const start = windowStart(opts.windowMonths);
    const q = encodeURIComponent(target.value);
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
