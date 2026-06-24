// Serveur web v1 (ADR-0006) : mono-utilisateur, sans auth, 2 ecrans.
// Transport HTTP minimal (node:http) au-dessus de api.ts. Sert l'API JSON + les
// fichiers statiques du frontend natif.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config } from "../config.ts";
import { getDb } from "../db/db.ts";
import * as api from "./api.ts";
import { HttpError } from "./api.ts";

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(here, "..", "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB_DIR, safe);
  if (!file.startsWith(WEB_DIR) || !existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const data = await readFile(file);
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(data);
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const path = url.pathname;
  const method = req.method ?? "GET";

  // GET endpoints
  if (method === "GET" && path === "/api/config") return sendJson(res, 200, api.getConfig());
  if (method === "GET" && path === "/api/brands") return sendJson(res, 200, api.listBrands());
  if (method === "GET" && path === "/api/runs") {
    const brandId = url.searchParams.get("brandId");
    return sendJson(res, 200, api.listRuns(brandId ? Number(brandId) : undefined));
  }
  let m: RegExpMatchArray | null;
  if (method === "GET" && (m = path.match(/^\/api\/runs\/(\d+)$/))) {
    return sendJson(res, 200, api.getRunDetail(Number(m[1])));
  }
  if (method === "GET" && (m = path.match(/^\/api\/brands\/(\d+)\/targets$/))) {
    return sendJson(res, 200, api.listBrands().find((b) => b.id === Number(m![1]))?.targets ?? []);
  }

  // POST / DELETE endpoints
  if (method === "POST" && path === "/api/seed") return sendJson(res, 200, api.seed());
  if (method === "POST" && path === "/api/brands") {
    const body = await readBody(req);
    return sendJson(res, 201, api.createBrand(body.name));
  }
  if (method === "POST" && (m = path.match(/^\/api\/brands\/(\d+)\/targets$/))) {
    const body = await readBody(req);
    return sendJson(
      res,
      201,
      api.addTarget(Number(m[1]), body.mode, body.connector, body.value, body.label ?? null),
    );
  }
  if (method === "DELETE" && (m = path.match(/^\/api\/targets\/(\d+)$/))) {
    return sendJson(res, 200, api.deleteTarget(Number(m[1])));
  }
  if (method === "POST" && path === "/api/runs") {
    const body = await readBody(req);
    if (!body.brandId) throw new HttpError(400, "brandId required.");
    return sendJson(res, 202, api.startRun(Number(body.brandId)));
  }

  throw new HttpError(404, "Unknown route.");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
  }
});

getDb(); // initialise le schema au demarrage
server.listen(config.server.port, () => {
  console.log(`BrandScout — http://localhost:${config.server.port}  (mode: ${config.mode})`);
  console.log(`  Etage mecanique: ${config.llm.mechanicalModel} | jugement: ${config.llm.judgmentModel}`);
});
