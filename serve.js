#!/usr/bin/env node
/**
 * dani-tools serve — local HTTP API wrapping the CLI tools.
 *
 * The CLI tools stay the single source of truth: this server spawns them
 * as child processes (input via stdin, output via stdout), so anything the
 * CLI can do the API can do — including from a Chrome extension, n8n,
 * Make, or any webhook that can POST JSON.
 *
 * Endpoints:
 *   GET  /api/health → { ok, model, tools: [...] }
 *   POST /api/run    → { tool, input, flags? } → { ok, tool, output, tookMs }
 *                      flags is an object of CLI flags without the dashes,
 *                      e.g. { "tone": "bold", "tweets": 8, "no-numbers": true }
 *                      Unknown flags are rejected (per-tool whitelist).
 *   POST /api/batch  → { jobs: [{ tool, input, flags? }, ...] } (max 10)
 *                      → { ok, results: [{ ok, tool, output|error, tookMs }],
 *                          tookMs }
 *                      Jobs run sequentially (Ollama is serial anyway) and
 *                      each is isolated: one failure doesn't sink the batch.
 *                      This is the n8n/Make-webhook shape.
 *
 * Usage:
 *   node serve.js              # http://127.0.0.1:7890
 *   DANI_TOOLS_PORT=8000 node serve.js
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = parseInt(process.env.DANI_TOOLS_PORT || "7890", 10);
const HOST = "127.0.0.1"; // local-only by design — privacy-first, like the CLIs
const TIMEOUT_MS = 180_000;
const MAX_INPUT = 200_000; // chars — plenty for an article, small enough to be safe

// Per-tool flag whitelist: flag → "value" (needs an argument) | "bool".
// changelogify is excluded: it reads a git repo, not stdin text.
const TOOLS = {
  threadsmith: { tone: "value", tweets: "value", "no-numbers": "bool" },
  quotemine: { count: "value", max: "value" },
  replyguy: { tone: "value", count: "value", short: "bool", agree: "bool", disagree: "bool", context: "value" },
  altmaker: { kind: "value", count: "value", platform: "value", json: "bool" },
  hookline: { count: "value", kind: "value", voice: "value" },
  namelab: { count: "value", style: "value", domain: "value", "no-hints": "bool" },
  faqforge: { style: "value", count: "value", title: "value" }, // no --out: stdout only
  pitchforge: { channel: "value", target: "value", count: "value", followup: "bool" },
};

function runTool(tool, input, flags) {
  return new Promise((resolve, reject) => {
    const spec = TOOLS[tool];
    if (!spec) return reject(new Error(`unknown tool ${JSON.stringify(tool)} — try: ${Object.keys(TOOLS).join(", ")}`));

    const argv = [path.join(__dirname, "tools", tool, "cli.js")];
    for (const [name, kind] of Object.entries(spec)) {
      const v = flags?.[name];
      if (v === undefined || v === null || v === false) continue;
      if (kind === "bool") {
        if (v) argv.push(`--${name}`);
      } else {
        argv.push(`--${name}`, String(v).slice(0, 500));
      }
    }

    const child = spawn(process.execPath, argv, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${tool} timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(killer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${tool} exited ${code}: ${err.trim().slice(0, 300)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", // chrome-extension:// origins need this
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.method === "GET" && req.url === "/api/health") {
    const { getModel } = require("./lib/ollama");
    return send(res, 200, { ok: true, model: getModel(), tools: Object.keys(TOOLS) });
  }

  if (req.method === "POST" && req.url === "/api/run") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > MAX_INPUT * 2) req.destroy();
    });
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return send(res, 400, { ok: false, error: "bad json" });
      }
      const { tool, input, flags } = payload || {};
      if (typeof tool !== "string" || typeof input !== "string" || !input.trim()) {
        return send(res, 400, { ok: false, error: "need { tool: string, input: string, flags? }" });
      }
      if (input.length > MAX_INPUT) {
        return send(res, 413, { ok: false, error: `input too large (>${MAX_INPUT} chars)` });
      }
      const t0 = Date.now();
      try {
        const output = await runTool(tool, input, flags || {});
        send(res, 200, { ok: true, tool, output, tookMs: Date.now() - t0 });
      } catch (e) {
        send(res, 500, { ok: false, tool, error: e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/batch") {
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > MAX_INPUT * 12) req.destroy(); // 10 jobs + slack
    });
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return send(res, 400, { ok: false, error: "bad json" });
      }
      const jobs = payload?.jobs;
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return send(res, 400, { ok: false, error: "need { jobs: [{ tool, input, flags? }, ...] }" });
      }
      if (jobs.length > 10) {
        return send(res, 400, { ok: false, error: "max 10 jobs per batch" });
      }
      for (const j of jobs) {
        if (typeof j?.tool !== "string" || typeof j?.input !== "string" || !j.input.trim()) {
          return send(res, 400, { ok: false, error: "every job needs { tool: string, input: string }" });
        }
        if (j.input.length > MAX_INPUT) {
          return send(res, 413, { ok: false, error: `job input too large (>${MAX_INPUT} chars)` });
        }
      }
      const t0 = Date.now();
      const results = [];
      for (const j of jobs) {
        const jt0 = Date.now();
        try {
          const output = await runTool(j.tool, j.input, j.flags || {});
          results.push({ ok: true, tool: j.tool, output, tookMs: Date.now() - jt0 });
        } catch (e) {
          results.push({ ok: false, tool: j.tool, error: e.message, tookMs: Date.now() - jt0 });
        }
      }
      send(res, 200, {
        ok: results.every((r) => r.ok),
        results,
        tookMs: Date.now() - t0,
      });
    });
    return;
  }

  send(res, 404, { ok: false, error: "not found — GET /api/health, POST /api/run, or POST /api/batch" });
});

server.listen(PORT, HOST, () => {
  console.log(`🛠  dani-tools API → http://${HOST}:${PORT}  (tools: ${Object.keys(TOOLS).join(", ")})`);
});
