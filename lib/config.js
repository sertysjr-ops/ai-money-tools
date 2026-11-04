/**
 * dani-tools config — the "creator CLI" tier foundation.
 *
 * One optional JSON file customizes every tool:
 *
 *   {
 *     "model": "qwen3.5:4b",                  // default model
 *     "defaults": {                           // per-tool flag defaults
 *       "threadsmith": { "tone": "bold", "tweets": 8 },
 *       "hookline":    { "count": 10 }
 *     },
 *     "prompts": {                            // prompt template overrides
 *       "threadsmith": { "system": "You write threads like David Perell…" }
 *     }
 *   }
 *
 * Search order (first hit wins):
 *   1. $DANI_TOOLS_CONFIG
 *   2. ./dani-tools.config.json        (current working directory)
 *   3. ~/.config/dani-tools/config.json
 *
 * Precedence for the model: --model flag > $OLLAMA_MODEL > config > default.
 * Per-tool defaults are injected BEFORE the user's argv, so explicit flags
 * always override the config. A missing or malformed file degrades to an
 * empty config with a stderr note — tools must never crash on config.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

let _cache = null;

function candidates() {
  const list = [];
  if (process.env.DANI_TOOLS_CONFIG) list.push(process.env.DANI_TOOLS_CONFIG);
  list.push(path.join(process.cwd(), "dani-tools.config.json"));
  list.push(path.join(os.homedir(), ".config", "dani-tools", "config.json"));
  return list;
}

/** Load (once) the config file. Returns {model?, defaults?, prompts?, _file}. */
function loadConfig() {
  if (_cache) return _cache;
  for (const file of candidates()) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed._file = file;
        _cache = parsed;
        return _cache;
      }
      process.stderr.write(`dani-tools: config ${file} is not a JSON object — ignored\n`);
    } catch (e) {
      process.stderr.write(`dani-tools: config ${file} is malformed (${e.message}) — ignored\n`);
    }
  }
  _cache = { _file: null };
  return _cache;
}

/** Test hook: drop the memoized config so a new env/cwd takes effect. */
function resetCache() {
  _cache = null;
}

/**
 * System prompt for a tool: config override wins, built-in is the fallback.
 * Non-string or empty overrides are ignored.
 */
function promptFor(tool, fallback) {
  const p = loadConfig().prompts?.[tool];
  if (p && typeof p.system === "string" && p.system.trim()) return p.system;
  return fallback;
}

/** Flag defaults declared for a tool ({} when none). */
function defaultsFor(tool) {
  const d = loadConfig().defaults?.[tool];
  return d && typeof d === "object" && !Array.isArray(d) ? d : {};
}

module.exports = { loadConfig, resetCache, promptFor, defaultsFor, candidates };
