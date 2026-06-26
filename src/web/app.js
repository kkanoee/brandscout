// Frontend natif BrandScout (vanilla). Deux ecrans : Lancer un Run / Reports.
const $ = (sel) => document.querySelector(sel);
const api = {
  async get(url) { const r = await fetch(url); if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json(); },
  async post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText); return r.json();
  },
  async del(url) { const r = await fetch(url, { method: "DELETE" }); if (!r.ok) throw new Error(r.statusText); return r.json(); },
};

const state = { brands: [], brandId: null, pollTimer: null, currentRunId: null };

const SECTION_LABELS = {
  strengths: "Strengths",
  critiques: "Critiques",
  themes: "Themes",
  opportunities: "Opportunities",
};
const SECTION_ORDER = ["strengths", "critiques", "themes", "opportunities"];
const MODE_LABEL = { seed_source: "Seed Source", keyword_query: "Keyword Query" };

// --- Navigation onglets ------------------------------------------------------
$("#tab-launch").onclick = () => switchTab("launch");
$("#tab-reports").onclick = () => { switchTab("reports"); loadRuns(); };
function switchTab(name) {
  $("#tab-launch").classList.toggle("active", name === "launch");
  $("#tab-reports").classList.toggle("active", name === "reports");
  $("#screen-launch").classList.toggle("hidden", name !== "launch");
  $("#screen-reports").classList.toggle("hidden", name !== "reports");
}

// --- Config / mode -----------------------------------------------------------
async function loadConfig() {
  const c = await api.get("/api/config");
  $("#modeBadge").textContent = `mode: ${c.mode} · ${c.mechanicalModel} / ${c.judgmentModel}`;
  $("#envelope").textContent = `window ${c.windowMonths} months · cap ${c.volumeCap} posts/source`;
}

// --- Brands ------------------------------------------------------------------
async function loadBrands(selectId) {
  state.brands = await api.get("/api/brands");
  const sel = $("#brandSelect");
  sel.innerHTML = "";
  for (const b of state.brands) {
    const o = document.createElement("option");
    o.value = b.id; o.textContent = `${b.name} (${b.targets.length} sources, ${b.runCount} runs)`;
    sel.appendChild(o);
  }
  if (state.brands.length) {
    state.brandId = selectId ?? Number(sel.value);
    sel.value = String(state.brandId);
    renderTargets();
  } else {
    state.brandId = null;
    $("#targetsTable tbody").innerHTML = "";
  }
}
$("#brandSelect").onchange = (e) => { state.brandId = Number(e.target.value); renderTargets(); };
$("#addBrandBtn").onclick = async () => {
  const name = $("#newBrandName").value.trim();
  if (!name) return;
  const b = await api.post("/api/brands", { name });
  $("#newBrandName").value = "";
  await loadBrands(b.id);
};
$("#seedBtn").onclick = async () => { const r = await api.post("/api/seed"); await loadBrands(r.brandId); };

// --- Targets -----------------------------------------------------------------
function renderTargets() {
  const brand = state.brands.find((b) => b.id === state.brandId);
  const tbody = $("#targetsTable tbody");
  tbody.innerHTML = "";
  if (!brand) return;
  for (const t of brand.targets) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="mode-tag">${MODE_LABEL[t.mode]}</span></td>
      <td>${t.connector}</td>
      <td>${escapeHtml(t.value)}</td>
      <td><button class="del" data-id="${t.id}" title="Supprimer">✕</button></td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll(".del").forEach((b) => {
    b.onclick = async () => { await api.del(`/api/targets/${b.dataset.id}`); await loadBrands(state.brandId); };
  });
}
$("#addTargetBtn").onclick = async () => {
  $("#targetErr").textContent = "";
  if (!state.brandId) { $("#targetErr").textContent = "Create a Brand first."; return; }
  const value = $("#tValue").value.trim();
  if (!value) { $("#targetErr").textContent = "Value required."; return; }
  try {
    await api.post(`/api/brands/${state.brandId}/targets`, {
      mode: $("#tMode").value, connector: $("#tConnector").value, value,
    });
    $("#tValue").value = "";
    await loadBrands(state.brandId);
  } catch (e) { $("#targetErr").textContent = e.message; }
};

// --- Lancer un Run -----------------------------------------------------------
$("#launchBtn").onclick = async () => {
  if (!state.brandId) { $("#targetErr").textContent = "Select a Brand."; return; }
  $("#runLog").textContent = "Starting…";
  try {
    const { runId } = await api.post("/api/runs", { brandId: state.brandId });
    state.currentRunId = runId;
    pollRun(runId);
  } catch (e) { $("#runLog").textContent = "Error: " + e.message; }
};

function pollRun(runId) {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const detail = await api.get(`/api/runs/${runId}`);
      $("#runLog").textContent = (detail.logs || []).join("\n") || "…";
      $("#runLog").scrollTop = $("#runLog").scrollHeight;
      if (detail.run.status === "done" || detail.run.status === "error") {
        clearInterval(state.pollTimer);
        await loadBrands(state.brandId);
        if (detail.run.status === "done") {
          $("#runLog").textContent += "\n\n✓ Done. See the Reports tab.";
        }
      }
    } catch (e) { clearInterval(state.pollTimer); $("#runLog").textContent += "\nError: " + e.message; }
  }, 600);
}

// --- Reports -----------------------------------------------------------------
async function loadRuns() {
  const runs = await api.get("/api/runs");
  const ul = $("#runsList");
  ul.innerHTML = "";
  if (!runs.length) { ul.innerHTML = '<p class="hint">No runs yet. Launch one.</p>'; return; }
  for (const r of runs) {
    const li = document.createElement("li");
    li.dataset.id = r.id;
    const statusClass = r.status === "done" ? "done" : r.status === "error" ? "error" : "running";
    const when = new Date(r.startedAt).toLocaleString();
    li.innerHTML = `
      <div class="rtitle">${escapeHtml(r.brandName)} <span class="status ${statusClass}">${r.status}</span></div>
      <div class="rmeta">Run #${r.id} · ${when}${r.stats ? ` · ${r.stats.findings} findings` : ""}</div>`;
    li.onclick = () => { selectRun(r.id); ul.querySelectorAll("li").forEach((x) => x.classList.remove("active")); li.classList.add("active"); };
    ul.appendChild(li);
  }
}

async function selectRun(runId) {
  const d = await api.get(`/api/runs/${runId}`);
  const v = $("#reportView");
  if (d.run.status === "error") {
    v.innerHTML = `<div class="report-head"><h1>${escapeHtml(d.run.brandName)}</h1></div>
      <p class="err">Run failed: ${escapeHtml(d.run.error || "unknown error")}</p>`;
    return;
  }
  if (d.run.status !== "done") {
    v.innerHTML = `<p class="hint">Run #${runId} in progress (${d.run.status})… check back in a moment.</p>`;
    return;
  }
  const s = d.run.stats || {};
  let html = `
    <div class="report-head">
      <h1>${escapeHtml(d.run.brandName)}</h1>
      <div class="report-stats">
        <span>Run #${d.run.id}</span>
        <span>${s.collected ?? 0} posts collected · ${s.kept ?? 0} kept · ${s.filtered ?? 0} filtered</span>
        <span>${s.observations ?? 0} observations · ${s.findings ?? 0} findings</span>
      </div>
    </div>`;
  html += buildRecap(d.sections);
  if (d.overview) html += `<div class="overview">${escapeHtml(d.overview)}</div>`;

  for (const section of SECTION_ORDER) {
    const items = d.sections[section] || [];
    if (!items.length) continue;
    html += `<div class="section-title">${SECTION_LABELS[section]} <span class="count">${items.length}</span></div>`;
    for (const f of items) html += renderFinding(f);
  }
  v.innerHTML = html;
}

// Recap leger en haut du Report (compatible v1 : pas un dashboard interactif).
// Repartition par tier de Confidence + themes principaux. Calcule cote front.
const RECAP_TIERS = [
  { key: "fait_verifie", label: "Verified fact" },
  { key: "signal_probable", label: "Probable signal" },
  { key: "intuition", label: "Hunch" },
];
function buildRecap(sections) {
  const all = Object.values(sections).flat();
  if (!all.length) return "";

  const counts = {};
  for (const t of RECAP_TIERS) counts[t.key] = all.filter((f) => f.confidence === t.key).length;

  const segs = RECAP_TIERS
    .filter((t) => counts[t.key] > 0)
    .map((t) => `<div class="recap-seg ${t.key}" style="flex:${counts[t.key]}" title="${t.label}: ${counts[t.key]}"></div>`)
    .join("");
  const legend = RECAP_TIERS
    .map((t) => `<span class="recap-leg"><i class="dot ${t.key}"></i>${t.label} <b>${counts[t.key]}</b></span>`)
    .join("");

  // Themes principaux : par nombre d'observations, hors opportunites (theme nul).
  const themeMap = new Map();
  for (const [section, items] of Object.entries(sections)) {
    if (section === "opportunities") continue;
    for (const f of items) {
      if (!f.theme) continue;
      const cur = themeMap.get(f.theme) || { obs: 0, section };
      cur.obs += f.observations.length;
      themeMap.set(f.theme, cur);
    }
  }
  const chips = [...themeMap.entries()]
    .sort((a, b) => b[1].obs - a[1].obs)
    .slice(0, 6)
    .map(([theme, info]) => `<span class="theme-chip ${info.section}">${escapeHtml(theme.replace(/_/g, " "))} · ${info.obs}</span>`)
    .join("");

  return `<div class="recap">
      <div class="recap-bar">${segs}</div>
      <div class="recap-legend">${legend}</div>
      ${chips ? `<div class="recap-themes"><span class="recap-themes-label">Top themes</span>${chips}</div>` : ""}
    </div>`;
}

function renderFinding(f) {
  const obs = f.observations.map((o) => {
    const p = o.post;
    const link = p ? `<a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.sourceKey)} · ${escapeHtml(p.author)}</a>` : "unknown source";
    const date = p && p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "";
    // Contexte : de quelle video / quel thread provient le commentaire.
    let ctx = "";
    if (p && p.contextTitle) {
      const icon = p.connector === "youtube" ? "▶" : "#";
      const href = escapeAttr(p.contextUrl || p.url);
      ctx = `<div class="ctx"><span class="ctx-ico">${icon}</span> <a href="${href}" target="_blank" rel="noopener">${escapeHtml(p.contextTitle)}</a></div>`;
    }
    return `<div class="obs">
        <div class="claim">${escapeHtml(o.claim)}<span class="sent ${o.sentiment}">${o.sentiment}</span></div>
        ${ctx}
        <div class="src">${link} ${date ? "· " + date : ""}</div>
        ${p ? `<div class="post-quote">${escapeHtml(p.content)}</div>` : ""}
      </div>`;
  }).join("");
  return `
    <details class="finding">
      <summary>
        <span class="badge ${f.confidence}">${f.confidenceLabel}</span>
        <span class="stmt">${escapeHtml(f.statement)}</span>
        <span class="evid">${f.distinctAuthors} author(s) / ${f.distinctSources} source(s)</span>
      </summary>
      <div class="obs-list">
        ${f.rationale ? `<div class="rationale">${escapeHtml(f.rationale)}</div>` : ""}
        ${obs || '<p class="hint">No linked observation.</p>'}
      </div>
    </details>`;
}

// --- Utils -------------------------------------------------------------------
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// --- Boot --------------------------------------------------------------------
(async function boot() {
  await loadConfig();
  await loadBrands();
})();
