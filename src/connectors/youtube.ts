// Connecteur YouTube. v1 : Seed Source uniquement (une chaine -> ses commentaires
// sur la fenetre). Quota YouTube Data API v3 : 10k u/jour, gratuit.
import type { CollectionTarget, RawPost } from "../domain/types.ts";
import type { Connector, CollectOptions } from "./connector.ts";
import { withinWindow, windowStart } from "./connector.ts";
import { loadFixturePosts } from "./fixtures.ts";
import { config } from "../config.ts";

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeConnector implements Connector {
  readonly name = "youtube" as const;
  private readonly live: boolean;
  constructor(live: boolean) {
    this.live = live;
  }

  supports(mode: CollectionTarget["mode"]): boolean {
    return mode === "seed_source"; // pas de keyword_query YouTube en v1
  }

  async collect(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    if (!this.live) return loadFixturePosts("youtube", target);
    return this.collectLive(target, opts);
  }

  private async collectLive(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    const key = config.connectors.youtubeApiKey;
    const start = windowStart(opts.windowMonths);

    const channelId = await this.resolveChannelId(target.value, key);
    const uploads = await this.uploadsPlaylist(channelId, key);
    const videos = await this.recentVideos(uploads, key, start, opts.volumeCap);

    const channelTitle = target.label || target.value;
    const sourceKey = `yt/${channelTitle}`;
    const out: RawPost[] = [];

    for (const video of videos) {
      if (out.length >= opts.volumeCap) break;
      const comments = await this.videoComments(video.id, key, opts.volumeCap - out.length);
      for (const c of comments) {
        if (!withinWindow(c.publishedAt, start)) continue;
        // On rattache chaque commentaire a SA video (titre + lien) pour la tracabilite.
        out.push({
          ...c,
          sourceKey,
          contextTitle: video.title,
          contextUrl: `https://www.youtube.com/watch?v=${video.id}`,
        });
        if (out.length >= opts.volumeCap) break;
      }
    }
    return out;
  }

  private async resolveChannelId(value: string, key: string): Promise<string> {
    if (/^UC[\w-]{20,}$/.test(value)) return value;
    const url = `${API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(value)}&key=${key}`;
    const data = await fetchJson(url);
    const id = data?.items?.[0]?.id?.channelId;
    if (!id) throw new Error(`Chaine YouTube introuvable: ${value}`);
    return id;
  }

  private async uploadsPlaylist(channelId: string, key: string): Promise<string> {
    const url = `${API}/channels?part=contentDetails&id=${channelId}&key=${key}`;
    const data = await fetchJson(url);
    const pl = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!pl) throw new Error(`Playlist uploads introuvable pour ${channelId}`);
    return pl;
  }

  private async recentVideos(
    playlistId: string,
    key: string,
    start: Date,
    cap: number,
  ): Promise<Array<{ id: string; title: string }>> {
    const videos: Array<{ id: string; title: string }> = [];
    let pageToken = "";
    // On limite le nombre de videos parcourues pour borner le quota.
    const maxVideos = Math.max(5, Math.ceil(cap / 20));
    while (videos.length < maxVideos) {
      // part=snippet pour recuperer le TITRE de la video.
      const url =
        `${API}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${key}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const data = await fetchJson(url);
      for (const it of data?.items ?? []) {
        const pubAt = it?.contentDetails?.videoPublishedAt ?? null;
        if (pubAt && Date.parse(pubAt) < start.getTime()) continue;
        const vid = it?.contentDetails?.videoId;
        if (vid) videos.push({ id: vid, title: it?.snippet?.title ?? "(untitled video)" });
        if (videos.length >= maxVideos) break;
      }
      pageToken = data?.nextPageToken ?? "";
      if (!pageToken) break;
    }
    return videos;
  }

  private async videoComments(
    videoId: string,
    key: string,
    limit: number,
  ): Promise<RawPost[]> {
    const out: RawPost[] = [];
    let pageToken = "";
    while (out.length < limit) {
      const url =
        `${API}/commentThreads?part=snippet&maxResults=100&order=time&videoId=${videoId}&key=${key}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      let data: any;
      try {
        data = await fetchJson(url);
      } catch {
        break; // commentaires desactives sur cette video -> on passe
      }
      for (const it of data?.items ?? []) {
        const s = it?.snippet?.topLevelComment?.snippet;
        if (!s) continue;
        out.push({
          connector: "youtube",
          sourceKey: "", // rempli par l'appelant
          externalId: it.id,
          author: s.authorDisplayName ?? "unknown",
          content: s.textOriginal ?? s.textDisplay ?? "",
          url: `https://www.youtube.com/watch?v=${videoId}&lc=${it.id}`,
          publishedAt: s.publishedAt ?? null,
        });
        if (out.length >= limit) break;
      }
      pageToken = data?.nextPageToken ?? "";
      if (!pageToken) break;
    }
    return out;
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube ${res.status}: ${await res.text()}`);
  return res.json();
}
