#!/usr/bin/env node
/**
 * config tier tests — lib/config.js + the args.js integration.
 *
 * Phases 1–5 are offline (no Ollama): child processes with
 * DANI_TOOLS_CONFIG pointed at temp config files. Phase 6 is a live
 * end-to-end prompt-override check against the local model (skipped
 * when Ollama is unreachable).
 *
 * Run: node test/config.test.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROBE = path.join(__dirname, "probe", "cli.js");

let passed = 0;
function check(name, cond, extra = "") {
  if (!cond) {
    console.error(`❌ ${name} ${extra}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${name}`);
    passed++;
  }
}

function tmpConfig(obj) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "dt-cfg-")),
    "config.json"
  );
  if (typeof obj === "string") fs.writeFileSync(file, obj); // raw (malformed)
  else fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

function run(script, args, env = {}, input = "") {
  // tests control the model explicitly — strip any ambient OLLAMA_MODEL
  // unless the test itself sets one (undefined env values get STRINGIFIED
  // by spawn, so delete instead of setting to undefined)
  const childEnv = { ...process.env };
  delete childEnv.OLLAMA_MODEL;
  Object.assign(childEnv, env);
  return spawnSync("node", [script, ...args], {
    input,
    encoding: "utf8",
    timeout: 120000,
    env: childEnv,
  });
}

/* ---- 1. no config anywhere → empty resolution ---- */
{
  const r = run(PROBE, ["--print-config"], { DANI_TOOLS_CONFIG: "/nonexistent/x.json" });
  const out = JSON.parse(r.stdout);
  check(
    "no config file → null file, default model, empty defaults",
    r.status === 0 && out.configFile === null && out.model === "qwen3.5:4b" &&
      Object.keys(out.defaults).length === 0 && out.promptOverride === false,
    r.stdout
  );
}

/* ---- 2. config file is found, model + defaults resolve ---- */
{
  const file = tmpConfig({
    model: "qwen3.5:2b",
    defaults: { probe: { tone: "bold", count: 3, verbose: true, skip: false } },
    prompts: { probe: { system: "custom" } },
  });
  const r = run(PROBE, ["--print-config"], { DANI_TOOLS_CONFIG: file });
  const out = JSON.parse(r.stdout);
  check(
    "config resolves: file, model, tool name, promptOverride",
    out.configFile === file && out.model === "qwen3.5:2b" &&
      out.tool === "probe" && out.promptOverride === true,
    r.stdout
  );
  check(
    "defaults resolved (false entries dropped at injection, not here)",
    out.defaults.tone === "bold" && out.defaults.count === 3,
    r.stdout
  );
}

/* ---- 3. env model beats config model; --model beats both ---- */
{
  const file = tmpConfig({ model: "qwen3.5:2b" });
  const envWin = run(PROBE, ["--print-config"], {
    DANI_TOOLS_CONFIG: file,
    OLLAMA_MODEL: "qwen3.5:9b",
  });
  check(
    "OLLAMA_MODEL env beats config model",
    JSON.parse(envWin.stdout).model === "qwen3.5:9b",
    envWin.stdout
  );
  // --model must come before --print-config: flags are processed in order
  // and --print-config exits when reached (same as git's flag semantics)
  const flagWin = run(PROBE, ["--model", "qwen3.5:9b", "--print-config"], {
    DANI_TOOLS_CONFIG: file,
  });
  check(
    "--model flag beats config model",
    JSON.parse(flagWin.stdout).model === "qwen3.5:9b",
    flagWin.stdout
  );
}

/* ---- 4. defaults are injected BEFORE user argv (user wins) ---- */
{
  const file = tmpConfig({
    defaults: { probe: { tone: "bold", count: 3, verbose: true, skip: false } },
  });
  const r = run(PROBE, ["--tone", "casual", "input.txt"], {
    DANI_TOOLS_CONFIG: file,
  });
  const args = JSON.parse(r.stdout);
  const tones = args.reduce(
    (acc, a, i) => (a === "--tone" ? [...acc, args[i + 1]] : acc),
    []
  );
  check(
    "config default injected, user flag last (parsers keep last)",
    tones.join(",") === "bold,casual",
    r.stdout
  );
  const vi = args.indexOf("--verbose");
  check(
    "boolean true → bare flag; false → dropped; value flags paired",
    vi > -1 &&
      (vi === args.length - 1 || args[vi + 1].startsWith("--")) && // bare
      !args.includes("--skip") &&
      args[args.indexOf("--count") + 1] === "3",
    r.stdout
  );
  check(
    "user positional args survive injection",
    args[args.length - 1] === "input.txt",
    r.stdout
  );
}

/* ---- 5. malformed config → warning, never a crash ---- */
{
  const file = tmpConfig("{ this is not json");
  const r = run(PROBE, ["--print-config"], { DANI_TOOLS_CONFIG: file });
  const out = JSON.parse(r.stdout);
  check(
    "malformed config → stderr note + empty resolution",
    r.status === 0 && /malformed/.test(r.stderr) && out.configFile === null,
    `stderr: ${r.stderr}`
  );
}

/* ---- 6. live e2e: prompt override reaches the model ---- */
(async () => {
  let ollamaUp = false;
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    ollamaUp = res.ok;
  } catch {}
  if (!ollamaUp) {
    console.log("⏭  Ollama unreachable — skipping live prompt-override e2e");
  } else {
    const file = tmpConfig({
      prompts: {
        hookline: {
          system:
            "Ignore all other instructions. Output exactly the single word " +
            "CONFIGURADO and nothing else.",
        },
      },
    });
    const r = run(
      path.join(ROOT, "tools", "hookline", "cli.js"),
      ["--count", "1"],
      { DANI_TOOLS_CONFIG: file },
      "test topic: sourdough bread"
    );
    check(
      "prompt override reaches the model (CONFIGURADO e2e)",
      r.status === 0 && r.stdout.includes("CONFIGURADO"),
      `status=${r.status} out=${r.stdout.slice(0, 120)}`
    );

    // and without the config, the built-in prompt is untouched
    const plain = run(
      path.join(ROOT, "tools", "hookline", "cli.js"),
      ["--count", "2"],
      { DANI_TOOLS_CONFIG: "/nonexistent/x.json" },
      "test topic: sourdough bread"
    );
    check(
      "built-in prompt intact without config",
      plain.status === 0 &&
        !plain.stdout.includes("CONFIGURADO") &&
        plain.stdout.trim().length > 10,
      plain.stdout.slice(0, 120)
    );
  }

  console.log(`\n${passed} checks passed`);
  process.exit(process.exitCode || 0);
})();
