// options.js — load/save threadsmith prefs (chrome.storage.sync so they
// follow the user's Chrome profile). background.js reads the same keys.
const DEFAULTS = { tone: "casual", tweets: 7 };

const toneEl = document.getElementById("tone");
const tweetsEl = document.getElementById("tweets");
const tweetsOut = document.getElementById("tweetsOut");
const savedEl = document.getElementById("saved");

tweetsEl.addEventListener("input", () => {
  tweetsOut.textContent = tweetsEl.value;
});

chrome.storage.sync.get(DEFAULTS, (prefs) => {
  toneEl.value = prefs.tone;
  tweetsEl.value = prefs.tweets;
  tweetsOut.textContent = prefs.tweets;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    { tone: toneEl.value, tweets: parseInt(tweetsEl.value, 10) },
    () => {
      savedEl.textContent = "Saved ✓";
      setTimeout(() => (savedEl.textContent = ""), 1500);
    }
  );
});
