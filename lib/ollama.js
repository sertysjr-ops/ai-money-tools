// Tiny Ollama client — zero dependencies, Node 18+ (global fetch).
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
let MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

/** Switch the active model at runtime (used by the --model global flag). */
function setModel(name) {
  if (name && typeof name === "string" && name.trim()) {
    MODEL = name.trim();
  }
}

async function chat(system, user, { temperature = 0.7, numPredict = 900 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      think: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature, num_predict: numPredict },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)} (is \`ollama serve\` running?)`);
  }
  const data = await res.json();
  const text = (data.message?.content || "").trim();
  if (!text) throw new Error("Model returned empty output");
  return text;
}

module.exports = { chat, setModel, getModel: () => MODEL, MODEL, OLLAMA_URL };
