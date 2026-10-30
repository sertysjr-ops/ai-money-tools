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

    console.log(`\n${passed} checks passed`);
  } finally {
    proc.kill("SIGKILL");
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
