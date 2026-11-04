// ===== Config and state =====
const MAX_CHARS = 8000;
const MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const KEYS = { api: "sa_api_key", history: "sa_history", theme: "sa_theme" };
let current = null; // the generation currently shown

const $ = (s) => document.querySelector(s);
function h(tag, cls, text) { // safe element builder (uses textContent, never innerHTML)
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ===== Storage helpers (wrapped so a blocked localStorage never crashes the app) =====
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ===== 1. Build the prompt =====
function buildPrompt(notes, style, difficulty) {
  return `You are a study assistant. Style of explanation: "${style}". Quiz difficulty: ${difficulty}.
Using the student's notes or topic below, reply with ONLY valid JSON (no markdown, no extra text) in exactly this format:
{"summary":"a short summary","quiz":[{"question":"...","options":["A","B","C","D"],"answer":0}],"flashcards":[{"front":"...","back":"..."}]}
Rules: exactly 5 quiz questions, each with 4 options; "answer" is the index (0-3) of the correct option; 6 flashcards.

Notes or topic:
${notes}`;
}

// ===== 2. Call the API (POST with fetch + async/await) =====
async function callAI(prompt, apiKey) {
  let res;
  try {
    res = await fetch(MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
  } catch {
    throw new Error("Network error. Check your internet connection and try again.");
  }
  if (!res.ok) {
    const msgs = {
      400: "The API rejected the request (400). Your key may be malformed.",
      401: "Wrong API key (401). Check the key in Settings.",
      403: "Access denied (403). Your key is invalid or not allowed to use this model.",
      429: "Rate limit reached (429). Wait a minute and try again.",
    };
    throw new Error(msgs[res.status] || `Server error (HTTP ${res.status}). Try again later.`);
  }
  const data = await res.json();
  console.log("Full API response:", data); // handy for learning where the text lives
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("The AI returned an empty reply. Try again.");
  return text;
}

// ===== 3. Parse and validate the reply =====
function parseAndValidate(text) {
  let obj;
  try { obj = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { throw new Error("The AI reply was not valid JSON. Click Generate again."); }

  const okSummary = typeof obj.summary === "string" && obj.summary.trim();
  const okQuiz = Array.isArray(obj.quiz) && obj.quiz.length > 0 && obj.quiz.every(q =>
    q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2 &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
  const okCards = Array.isArray(obj.flashcards) && obj.flashcards.length > 0 && obj.flashcards.every(c =>
    c && typeof c.front === "string" && typeof c.back === "string");
  if (!okSummary || !okQuiz || !okCards)
    throw new Error("The AI reply is missing the summary, quiz or flashcards. Click Generate again.");
  return { summary: obj.summary, quiz: obj.quiz.slice(0, 5), flashcards: obj.flashcards };
}

// ===== 4. Render each section =====
function renderSummary(d) { $("#summaryText").textContent = d.summary; }

function renderQuiz(d) {
  const box = $("#quizBox");
  box.replaceChildren();
  $("#score").textContent = "";
  d.quiz.forEach((q, i) => {
    const fs = h("fieldset", "q");
    fs.append(h("legend", "", `${i + 1}. ${q.question}`));
    q.options.forEach((opt, j) => {
      const label = h("label");
      const input = h("input");
      input.type = "radio"; input.name = "q" + i; input.value = j; input.style.width = "auto";
      label.append(input, document.createTextNode(opt));
      fs.append(label);
    });
    box.append(fs);
  });
}

function checkQuiz() {
  if (!current) return;
  let score = 0;
  current.quiz.forEach((q, i) => {
    const labels = document.querySelectorAll(`input[name="q${i}"]`);
    labels.forEach((inp, j) => {
      const l = inp.parentElement;
      l.classList.remove("correct", "wrong");
      if (j === q.answer) l.classList.add("correct");
      else if (inp.checked) l.classList.add("wrong");
      if (inp.checked && j === q.answer) score++;
    });
  });
  $("#score").textContent = `Score: ${score} / ${current.quiz.length}`;
}

function renderCards(d) {
  const box = $("#cardsBox");
  box.replaceChildren();
  d.flashcards.forEach(c => {
    const card = h("div", "card");
    card.tabIndex = 0;
    const inner = h("div", "card-inner");
    const front = h("div", "face", c.front);
    const back = h("div", "face back", c.back);
    const btn = h("button", "", "Mark as known");
    btn.addEventListener("click", (e) => { e.stopPropagation(); card.classList.toggle("known"); updateKnown(); });
    back.append(btn);
    inner.append(front, back);
    card.append(inner);
    const flip = () => card.classList.toggle("flipped");
    card.addEventListener("click", flip);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    box.append(card);
  });
  updateKnown();
}
function updateKnown() {
  const n = document.querySelectorAll(".card.known").length;
  $("#knownCount").textContent = `Known: ${n} / ${document.querySelectorAll(".card").length}`;
}

function showResults(d) {
  current = d;
  renderSummary(d); renderQuiz(d); renderCards(d);
  $("#empty").hidden = true;
  $("#results").hidden = false;
  switchTab("summary");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tabpane").forEach(p => p.hidden = p.id !== "tab-" + name);
}

// ===== 5. History =====
function addHistory(title, data) {
  const list = load(KEYS.history, []);
  list.unshift({ id: Date.now(), title, date: new Date().toLocaleString(), data });
  save(KEYS.history, list.slice(0, 20));
  renderHistory();
}
function renderHistory() {
  const ul = $("#historyList");
  ul.replaceChildren();
  const list = load(KEYS.history, []);
  if (!list.length) { ul.append(h("li", "hint", "No saved generations yet.")); return; }
  list.forEach(item => {
    const li = h("li");
    const b = h("button", "item", item.title);
    b.append(h("small", "", item.date));
    b.addEventListener("click", () => showResults(item.data));
    const del = h("button", "ghost", "Delete");
    del.addEventListener("click", () => {
      save(KEYS.history, load(KEYS.history, []).filter(x => x.id !== item.id));
      renderHistory();
    });
    li.append(b, del);
    ul.append(li);
  });
}

// ===== 6. UI helpers =====
function showError(msg) { const e = $("#error"); e.textContent = msg; e.hidden = !msg; }
function setLoading(on) { $("#loading").hidden = !on; $("#generate").disabled = on; }

async function onGenerate() {
  showError("");
  const apiKey = $("#apiKey").value.trim();
  const notes = $("#notes").value.trim();
  if (!apiKey) { $("#settings").open = true; return showError("Add your API key in Settings first."); }
  if (!notes) return showError("Type a topic or paste some notes first.");
  if (notes.length > MAX_CHARS) return showError(`Your text is over ${MAX_CHARS} characters. Shorten it.`);

  setLoading(true);
  try {
    const text = await callAI(buildPrompt(notes, $("#style").value, $("#difficulty").value), apiKey);
    const data = parseAndValidate(text);
    showResults(data);
    addHistory(notes.slice(0, 50), data);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false); // always re-enable the button
  }
}

function summaryOrNothing() { return current ? current.summary : ""; }

// ===== 7. Events and start-up =====
$("#generate").addEventListener("click", onGenerate);
$("#checkQuiz").addEventListener("click", checkQuiz);
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

$("#notes").addEventListener("input", () => {
  const n = $("#notes").value.length;
  const c = $("#counter");
  c.textContent = `${n} / ${MAX_CHARS}` + (n > MAX_CHARS ? " - too long" : "");
  c.classList.toggle("warn", n > MAX_CHARS * 0.9);
});

$("#saveKey").addEventListener("click", () => {
  save(KEYS.api, $("#apiKey").value.trim());
  showError("");
  $("#settings").open = false;
});

$("#copyBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryOrNothing()); $("#copyBtn").textContent = "Copied"; }
  catch { showError("Could not copy. Select the text and copy it manually."); }
  setTimeout(() => $("#copyBtn").textContent = "Copy", 1500);
});
$("#downloadBtn").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([summaryOrNothing()], { type: "text/plain" }));
  const a = h("a"); a.href = url; a.download = "summary.txt"; a.click();
  URL.revokeObjectURL(url);
});
$("#speakBtn").addEventListener("click", () => {
  if (!("speechSynthesis" in window)) return showError("Your browser does not support reading aloud.");
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(summaryOrNothing()));
});
$("#clearHistory").addEventListener("click", () => { save(KEYS.history, []); renderHistory(); });

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#themeBtn").textContent = t === "dark" ? "Light mode" : "Dark mode";
  save(KEYS.theme, t);
}
$("#themeBtn").addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

// start-up
$("#apiKey").value = load(KEYS.api, "");
applyTheme(load(KEYS.theme, matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
renderHistory();
