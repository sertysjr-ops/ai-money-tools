/**
 * Global CLI flags shared by every tool — keep this dependency-free.
 *
 *   const { globals } = require("../../lib/args");
 *   function parseArgs(argv) {
 *     const args = globals(argv.slice(2), __filename);
 *     ...
 *
 * Handles:
 *   --model <name> | --model=<name>   pick the Ollama model for this run
 *   -h, --help                        print the tool's docblock + global opts
 *
 * Returns the argv with global tokens stripped, so existing parsers never
 * see them (important: without stripping, the model name would be treated
 * as the input file).
 */
const fs = require("fs");
const path = require("path");
const { setModel, getModel } = require("./ollama");
const { loadConfig, defaultsFor } = require("./config");

const HELP_FLAGS = new Set(["-h", "--help"]);

/** Tool name = the directory the cli.js lives in (tools/<name>/cli.js). */
function toolName(selfPath) {
  return path.basename(path.dirname(selfPath || ""));
}

function globals(argv, selfPath) {
  const cfg = loadConfig();
  // config model applies unless the env already picked one
  if (cfg.model && !process.env.OLLAMA_MODEL) setModel(cfg.model);

  const args = [];
  // config flag defaults go FIRST — the tool's parser keeps the last
  // occurrence of each flag, so user argv always wins over config
  for (const [k, v] of Object.entries(defaultsFor(toolName(selfPath)))) {
    if (v === false || v === null || v === undefined) continue;
    args.push(`--${k}`);
    if (v !== true) args.push(String(v));
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") {
      setModel(argv[++i]);
      continue;
    }
    if (a.startsWith("--model=")) {
      setModel(a.slice("--model=".length));
      continue;
    }
    if (a === "--print-config") {
      printConfig(selfPath);
      process.exit(0);
    }
    if (HELP_FLAGS.has(a)) {
      printHelp(selfPath);
      process.exit(0);
    }
    args.push(a);
  }
  return args;
}

/** Show the resolved config for this tool — zero Ollama calls. */
function printConfig(selfPath) {
  const tool = toolName(selfPath);
  const cfg = loadConfig();
  const out = {
    configFile: cfg._file,
    model: getModel(),
    tool,
    defaults: defaultsFor(tool),
    promptOverride: !!(
      cfg.prompts?.[tool] &&
      typeof cfg.prompts[tool].system === "string" &&
      cfg.prompts[tool].system.trim()
    ),
  };
  console.log(JSON.stringify(out, null, 2));
}

/** Extract the leading /** ... *\/ docblock and print it as the help page. */
function printHelp(selfPath) {
  let header = "";
  try {
    const src = fs.readFileSync(selfPath, "utf8");
    const m = src.match(/\/\*\*([\s\S]*?)\*\//);
    if (m) {
      header = m[1]
        .split("\n")
        .map((l) => l.replace(/^\s*\* ?/, ""))
        .join("\n")
        .trim();
    }
  } catch {}
  if (header) console.log(header + "\n");
  else console.log("dani-tools — AI CLI toolkit\n");
  console.log(
    `Global options (every tool):
  --model <name>   Ollama model for this run (current: ${getModel()})
                   env override: OLLAMA_MODEL   server: OLLAMA_URL
  --print-config   show resolved config (file, model, defaults) and exit
  -h, --help       show this help

Config file (optional): ./dani-tools.config.json or
  ~/.config/dani-tools/config.json  (env: DANI_TOOLS_CONFIG)
  { "model": "…", "defaults": { "<tool>": { "flag": "value" } },
    "prompts": { "<tool>": { "system": "…" } } }

Docs: https://github.com/sertysjr-ops/ai-money-tools`
  );
}

module.exports = { globals };
