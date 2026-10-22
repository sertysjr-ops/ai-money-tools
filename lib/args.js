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
const { setModel, getModel } = require("./ollama");

const HELP_FLAGS = new Set(["-h", "--help"]);

function globals(argv, selfPath) {
  const args = [];
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
    if (HELP_FLAGS.has(a)) {
      printHelp(selfPath);
      process.exit(0);
    }
    args.push(a);
  }
  return args;
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
  -h, --help       show this help

Docs: https://github.com/sertysjr-ops/ai-money-tools`
  );
}

module.exports = { globals };
