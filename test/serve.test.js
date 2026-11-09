#!/usr/bin/env node
/**
 * serve.test.js — boot serve.js on an ephemeral port, exercise the API,
 * kill it. Mirrors how test/run-all.js treats the CLIs: real Ollama, real
 * output, no mocks.
 *
 * Usage: node test/serve.test.js   (needs `ollama serve` running)
 */
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
let passed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    console.error(`❌ ${name} ${detail}`);
    process.exit(1);
  }
}

function post(port, pathName, payload, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathName,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve({ code: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`bad json from ${pathName}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end(body);
  });
}

function get(port, pathName) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: pathName, timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ code: res.statusCode, body: JSON.parse(data) }));
      })
      .on("error", reject);
  });
}

function freePort() {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function waitUp(port, timeoutMs = 15_000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      get(port, "/api/health")
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - t0 > timeoutMs) reject(new Error("server never came up"));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

async function main() {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, "serve.js")], {
    env: { ...process.env, DANI_TOOLS_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  proc.stdout.on("data", (d) => (serverLog += d));
  proc.stderr.on("data", (d) => (serverLog += d));

  try {
    await waitUp(port);

    // 1. health
    const h = await get(port, "/api/health");
    check("GET /api/health → ok + tool list", h.body.ok === true && h.body.tools.includes("threadsmith"));

    // 1b. /api/tools: per-tool metadata for UIs (tagline + flag kinds)
    const tl = await get(port, "/api/tools");
    check(
      "GET /api/tools → all tools with tagline + flags",
      tl.body.ok === true && tl.body.tools.length === 8 &&
        tl.body.tools.every((t) => t.name && typeof t.tagline === "string" && t.tagline.length > 5 &&
          Array.isArray(t.flags)),
      JSON.stringify(tl.body).slice(0, 200)
    );
    const ts = tl.body.tools.find((t) => t.name === "threadsmith");
    check(
      "threadsmith metadata: tone value-flag + no-numbers bool",
      ts && ts.flags.some((f) => f.flag === "tone" && f.kind === "value") &&
        ts.flags.some((f) => f.flag === "no-numbers" && f.kind === "bool")
    );

    // 1c. the playground is served at / and wired to the API
    const pgRaw = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path: "/", timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ code: res.statusCode, ctype: res.headers["content-type"], body: data }));
      }).on("error", reject);
    });
    check(
      "GET / serves the playground (html, API-wired)",
      pgRaw.code === 200 && /text\/html/.test(pgRaw.ctype || "") &&
        pgRaw.body.includes("dani-tools") && pgRaw.body.includes("/api/run") &&
        pgRaw.body.includes("/api/tools") && pgRaw.body.includes("buildFlags"),
      `code=${pgRaw.code}`
    );

    // 2. threadsmith end-to-end (the extension's exact call shape)
    const t0 = Date.now();
    const r = await post(port, "/api/run", {
      tool: "threadsmith",
      input:
        "Remote work is changing how teams build software. Async communication " +
        "replaces meetings. Documentation becomes the source of truth. Time zones " +
        "become a feature, not a bug: work follows the sun. But loneliness is " +
        "real, and junior developers lose the osmosis learning of an office.",
      flags: { tone: "bold", tweets: 5 },
    });
    check(
      "POST /api/run threadsmith → ok + numbered tweets",
      r.body.ok === true && /\d+\//.test(r.body.output || ""),
      JSON.stringify(r.body).slice(0, 200)
    );
    check("tookMs reported and sane", r.body.tookMs > 0 && r.body.tookMs <= Date.now() - t0 + 50);

    // 3. unknown tool rejected
    const bad = await post(port, "/api/run", { tool: "evil", input: "x" });
    check("unknown tool → 500 with tool list", bad.body.ok === false && /try:/i.test(bad.body.error || ""));

    // 4. flag whitelist: unknown flags ignored, known flags applied
    const q = await post(port, "/api/run", {
      tool: "quotemine",
      input: "The best code is no code. Simplicity is the ultimate sophistication. Done is better than perfect.",
      flags: { count: 3, "rm-rf": "true" }, // injection attempt must be dropped
    });
    check("quotemine ok despite junk flag", q.body.ok === true && (q.body.output || "").length > 20);

    // 5. validation
    const noInput = await post(port, "/api/run", { tool: "threadsmith", input: "  " });
    check("empty input → 400", noInput.code === 400);
    const badJson = await new Promise((resolve) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/api/run", method: "POST", headers: { "Content-Type": "application/json" } },
        (res) => res.resume().on("end", () => resolve(res.statusCode))
      );
      req.end("{not json");
    });
    check("malformed json → 400", badJson === 400);

    // 6. 404 shape
    const nf = await get(port, "/nope");
    check("unknown route → 404", nf.code === 404);

    // 6b. batch mode: two real jobs, sequential, per-job isolation
    const b = await post(port, "/api/batch", {
      jobs: [
        { tool: "quotemine", input: "The best code is no code. Done is better than perfect. Simplicity wins.", flags: { count: 2 } },
        { tool: "hookline", input: "a todo app that guilt-trips you", flags: { count: 2 } },
      ],
    });
    check(
      "POST /api/batch → ok + 2 results with output",
      b.body.ok === true && b.body.results.length === 2 &&
        b.body.results.every((r) => r.ok && (r.output || "").length > 10),
      JSON.stringify(b.body).slice(0, 200)
    );
    check(
      "batch results carry per-job tool + tookMs",
      b.body.results[0].tool === "quotemine" && b.body.results[1].tool === "hookline" &&
        b.body.results.every((r) => r.tookMs > 0) && b.body.tookMs > 0
    );

    // 6c. batch isolation: one bad tool doesn't sink the batch
    const bi = await post(port, "/api/batch", {
      jobs: [
        { tool: "evil", input: "x" },
        { tool: "quotemine", input: "Ship early. Ship often. Learn always.", flags: { count: 1 } },
      ],
    });
    check(
      "batch isolates failures (ok:false overall, good job survives)",
      bi.code === 200 && bi.body.ok === false &&
        bi.body.results[0].ok === false && bi.body.results[1].ok === true,
      JSON.stringify(bi.body).slice(0, 200)
    );

    // 6d. batch validation
    const tooMany = await post(port, "/api/batch", {
      jobs: Array.from({ length: 11 }, () => ({ tool: "quotemine", input: "x" })),
    });
    check("batch >10 jobs → 400", tooMany.code === 400);
    const emptyJobs = await post(port, "/api/batch", { jobs: [] });
    check("batch empty jobs → 400", emptyJobs.code === 400);
    const badJob = await post(port, "/api/batch", { jobs: [{ tool: "quotemine", input: "  " }] });
    check("batch job with blank input → 400", badJob.code === 400);

    // 7. extension static analysis: wiring tokens present
    const fs = require("fs");
    const bg = fs.readFileSync(path.join(ROOT, "extension", "background.js"), "utf8");
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, "extension", "manifest.json"), "utf8"));
    check(
      "extension wired to local API + contextMenus",
      bg.includes("127.0.0.1:7890/api/run") &&
        mf.permissions.includes("contextMenus") &&
        mf.host_permissions.some((h) => h.includes("127.0.0.1:7890"))
    );
    check(
      "extension manifest v3 + service worker",
      mf.manifest_version === 3 && mf.background.service_worker === "background.js"
    );

    // 8. options page wiring: prefs saved in options.js drive background.js
    const optHtml = fs.readFileSync(path.join(ROOT, "extension", "options.html"), "utf8");
    const optJs = fs.readFileSync(path.join(ROOT, "extension", "options.js"), "utf8");
    check(
      "options page registered + has tone/tweets controls",
      mf.options_page === "options.html" &&
        optHtml.includes('id="tone"') && optHtml.includes('id="tweets"') &&
        optHtml.includes("casual") && optHtml.includes("bold") &&
        optHtml.includes("professional") && optHtml.includes("funny")
    );
    check(
      "background reads prefs from storage (no hardcoded flags)",
      bg.includes("chrome.storage.sync.get") && bg.includes("prefs.tone") &&
        bg.includes("prefs.tweets") && !bg.includes('flags: { tone: "'),
    );
    check(
      "options.js saves tone + tweets to sync storage",
      optJs.includes("chrome.storage.sync.set") && optJs.includes("tone") && optJs.includes("tweets")
    );

    console.log(`\n${passed} checks passed`);
  } finally {
    proc.kill("SIGKILL");
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
