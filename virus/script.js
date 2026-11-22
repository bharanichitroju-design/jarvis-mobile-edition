/* =========================================================
   STARK INDUSTRIES // J.A.R.V.I.S. UNIFIED CORE SCRIPT
   - Multi-Model Gemini Chain + Automatic Google Web Search Fallback
   - Live Clock, Telemetry Counters, Signal Wave & Audio EQ
   - 3-Turn Left Keyframe FX Dial + Drag-to-Expand
   - Continuous Speech Recognition & Voice Synthesis
   ========================================================= */

// ==================== 1. CONFIGURATION & STATE ====================
let GEMINI_API_KEY = localStorage.getItem("jarvis_key") || "";

function ensureGeminiApiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim().length < 10) {
    const entered = prompt("Enter your Gemini API Key, Boss:");
    if (entered && entered.trim()) {
      GEMINI_API_KEY = entered.trim();
      localStorage.setItem("jarvis_key", GEMINI_API_KEY);
    }
  }
  return GEMINI_API_KEY;
}

const TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest"
];

const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation"
];

const STORAGE_KEYS = {
  HISTORY: "jarvis_hud_history_v1",
  MEMORY: "jarvis_hud_memory_v1",
  FILES_3D: "jarvis_hud_3d_files_v1"
};

let chatHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
let memoryStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY) || "[]");
let files3DStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.FILES_3D) || "[]");

let isMicListening = false;
let isJarvisStrictMode = false;
let isSpeaking = false;
let recognition = null;
let audioWaveLevel = 0.08;

// ==================== 2. DOM REFERENCES ====================
const msgInput = document.getElementById("msg");
const executeBtn = document.getElementById("execute-btn");
const chatBox = document.getElementById("chat");
const statusText = document.getElementById("status-text");
const statusBadge = document.getElementById("status-badge");
const engineBadge = document.getElementById("engineBadge");
const apiFallbackBadge = document.getElementById("apiFallbackBadge");
const modeIndicator = document.getElementById("modeIndicator");
const voiceStatus = document.getElementById("voiceStatus");
const speechIndicator = document.getElementById("speechIndicator");
const micBtn = document.getElementById("mic-btn");
const rightOrb = document.getElementById("rightOrb");
const imgInput = document.getElementById("img-input");

const memCountEl = document.getElementById("memCount");
const file3dCountEl = document.getElementById("file3dCount");
const msgCountEl = document.getElementById("msgCount");

// ==================== 3. RULER, CLOCK & BOTTOM ARC DOCK ====================
function buildTopRuler() {
  const ruler = document.getElementById("topRuler");
  if (!ruler) return;
  ruler.innerHTML = "";
  for (let i = 1; i <= 30; i++) {
    const span = document.createElement("span");
    span.textContent = String(i).padStart(2, "0");
    if (i === 23) span.classList.add("active");
    span.addEventListener("click", () => {
      ruler.querySelectorAll("span").forEach(s => s.classList.remove("active"));
      span.classList.add("active");
    });
    ruler.appendChild(span);
  }
}

function updateClockAndDate() {
  const now = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const hudMonth = document.getElementById("hudMonth");
  const hudDayNum = document.getElementById("hudDayNum");
  const hudWeekday = document.getElementById("hudWeekday");
  const hudMiniClock = document.getElementById("hudMiniClock");
  const coreArcTime = document.getElementById("coreArcTime");
  const bottomClock = document.getElementById("bottomClock");

  if (hudMonth) hudMonth.textContent = months[now.getMonth()];
  if (hudDayNum) hudDayNum.textContent = String(now.getDate()).padStart(2, "0");
  if (hudWeekday) hudWeekday.textContent = weekdays[now.getDay()];
  if (hudMiniClock) hudMiniClock.innerHTML = `${hh}:${mm}<small>:${ss}</small>`;
  if (coreArcTime) coreArcTime.textContent = `${hh}:${mm}`;
  if (bottomClock) bottomClock.textContent = `${hh}:${mm}:${ss}`;
}

function buildArcDock() {
  const dock = document.getElementById("arcDock");
  if (!dock) return;
  const items = [
    { label: "MEMORY", action: () => openModal("memory-modal") },
    { label: "HISTORY", action: () => openModal("history-modal") },
    { label: "GALLERY", action: () => imgInput && imgInput.click() },
    { label: "WEB SEARCH", action: () => triggerWebSearchPrompt() },
    { label: "VOICE LINK", action: () => toggleMic() },
    { label: "RESET VIEW", action: () => collapseExpandedPanel() }
  ];

  dock.innerHTML = "";
  items.forEach((item, idx) => {
    const orb = document.createElement("div");
    orb.className = "dock-orb";
    orb.innerHTML = `
      <span class="orb-tooltip">${item.label}</span>
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="rgba(4,24,46,0.9)" stroke="#3be8ff" stroke-width="2" stroke-dasharray="10 5" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="#8cf3ff" stroke-width="1.5" />
        <circle cx="32" cy="32" r="11" fill="rgba(14,165,233,0.35)" stroke="#ffffff" stroke-width="1.5" />
        <text x="32" y="35" text-anchor="middle" fill="#ffffff" font-family="Orbitron" font-size="8" font-weight="700">0${idx + 1}</text>
      </svg>
    `;
    orb.addEventListener("click", item.action);
    dock.appendChild(orb);
  });
}

function updateTelemetryCounts() {
  if (memCountEl) memCountEl.textContent = String(memoryStore.length);
  if (file3dCountEl) file3dCountEl.textContent = String(files3DStore.length);
  if (msgCountEl) msgCountEl.textContent = String(chatHistory.length);
}

// ==================== 4. CHAT, HISTORY & MEMORY ====================
function appendMessage(sender, text, save = true) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.className = `message ${sender === "user" ? "user" : "ai"}`;
  div.innerHTML = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (save) {
    chatHistory.push({
      sender,
      text,
      time: new Date().toLocaleTimeString()
    });
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(chatHistory.slice(-120)));
    updateTelemetryCounts();
  }
}

function renderSavedHistory() {
  const list = document.getElementById("history-list");
  if (!list) return;
  if (!chatHistory.length) {
    list.innerHTML = `<div class="history-item">No history records found, Boss.</div>`;
    return;
  }
  list.innerHTML = chatHistory.slice().reverse().map(item => `
    <div class="history-item">
      <strong>[${item.sender.toUpperCase()}]</strong> <small>(${item.time || ""})</small><br/>
      <span>${item.text}</span>
    </div>
  `).join("");
}

function renderSavedMemory(filter = "") {
  const list = document.getElementById("saved-memory-list");
  if (!list) return;
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? memoryStore.filter(m => m.text.toLowerCase().includes(q))
    : memoryStore;

  if (!filtered.length) {
    list.innerHTML = `<div class="history-item">No saved memory entries matching "${filter}".</div>`;
    return;
  }
  list.innerHTML = filtered.slice().reverse().map(entry => `
    <div class="history-item">
      <small>${entry.time}</small><br/>
      <div>${entry.text}</div>
    </div>
  `).join("");
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = "block";
  if (id === "history-modal") renderSavedHistory();
  if (id === "memory-modal") renderSavedMemory(document.getElementById("memory-search-input")?.value || "");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function setupModals() {
  document.getElementById("close-history")?.addEventListener("click", () => closeModal("history-modal"));
  document.getElementById("close-memory-modal")?.addEventListener("click", () => closeModal("memory-modal"));

  document.getElementById("clear-all-history")?.addEventListener("click", () => {
    chatHistory = [];
    localStorage.setItem(STORAGE_KEYS.HISTORY, "[]");
    updateTelemetryCounts();
    renderSavedHistory();
  });

  document.getElementById("save-custom-memory")?.addEventListener("click", () => {
    const input = document.getElementById("custom-memory-input");
    const val = (input?.value || "").trim();
    if (!val) return;
    memoryStore.push({
      text: val,
      time: new Date().toLocaleString()
    });
    localStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(memoryStore));
    input.value = "";
    updateTelemetryCounts();
    renderSavedMemory();
    appendMessage("ai", `Saved to Vault Memory, Boss: "${val}"`);
  });

  document.getElementById("memory-search-input")?.addEventListener("input", (e) => {
    renderSavedMemory(e.target.value);
  });

  window.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("modal")) {
      e.target.style.display = "none";
    }
  });
}

// ==================== 5. MULTI-MODEL GEMINI CHAIN + GOOGLE WEB FALLBACK ====================
async function fetchGoogleWebFallback(query) {
  if (apiFallbackBadge) apiFallbackBadge.textContent = "GOOGLE-WEB";
  if (engineBadge) engineBadge.textContent = "ENGINE: AUTO-WEB FALLBACK";

  let snippet = "";
  let sourceTitle = "";
  let sourceUrl = "";

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl);
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      snippet = ddgData.AbstractText || ddgData.Answer || "";
      sourceTitle = ddgData.Heading || "Web Result";
      sourceUrl = ddgData.AbstractURL || `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      if (!snippet && Array.isArray(ddgData.RelatedTopics) && ddgData.RelatedTopics.length > 0) {
        const firstTopic = ddgData.RelatedTopics.find(t => t && t.Text);
        if (firstTopic) {
          snippet = firstTopic.Text;
          sourceUrl = firstTopic.FirstURL || sourceUrl;
        }
      }
    }
  } catch (_) {}

  const googleSearchLink = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  if (snippet) {
    return (
      `<div><strong>[ALL GEMINI MODELS EXHAUSTED — GOOGLE WEB FALLBACK: ${sourceTitle}]</strong></div>` +
      `<div>${snippet}</div>` +
      `<div style="margin-top:4px;"><a href="${googleSearchLink}" target="_blank" rel="noopener noreferrer" style="color:#8cf3ff;text-decoration:underline;">Open Google Search Results</a>` +
      (sourceUrl && sourceUrl !== googleSearchLink
        ? ` • <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:#8cf3ff;text-decoration:underline;">Source</a>`
        : "") +
      `</div>`
    );
  }

  return (
    `<div><strong>[ALL GEMINI MODELS EXHAUSTED — GOOGLE WEB FALLBACK]</strong></div>` +
    `<div>All configured Gemini models reached limits or failed. Direct Google Search link ready for "<strong>${query}</strong>":</div>` +
    `<div style="margin-top:4px;"><a href="${googleSearchLink}" target="_blank" rel="noopener noreferrer" style="color:#8cf3ff;text-decoration:underline;">Search on Google Now</a></div>`
  );
}

function buildContextualSystemInstruction() {
  const base = isJarvisStrictMode
    ? "You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani (also addressed as Sir). Keep answers concise, direct, and tactical."
    : "You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani (also addressed as Sir). Always address Bharani as 'Boss' or 'Sir'.";

  if (memoryStore.length > 0) {
    const notes = memoryStore.slice(-15).map(m => `- ${m.text}`).join("\n");
    return `${base}\n\nSaved Vault Memory:\n${notes}`;
  }
  return base;
}

async function tryTextModel(modelName, apiKey, promptText, systemInstruction) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: promptText }] }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`${modelName} HTTP ${response.status}: ${errText.slice(0, 120)}`);
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) {
      throw new Error(`${modelName} returned empty text`);
    }
    return reply;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function queryGeminiOrFallback(promptText) {
  setSystemState("PROCESSING", "SCANNING");
  const activeKey = ensureGeminiApiKey();

  if (!activeKey) {
    const webHtml = await fetchGoogleWebFallback(promptText);
    setSystemState("SYSTEM ONLINE", "[WEB-FALLBACK]");
    return webHtml;
  }

  const systemInstruction = buildContextualSystemInstruction();

  for (const modelName of TEXT_MODELS) {
    try {
      if (apiFallbackBadge) apiFallbackBadge.textContent = modelName.toUpperCase();
      if (engineBadge) engineBadge.textContent = `ENGINE: ${modelName}`;

      const reply = await tryTextModel(modelName, activeKey, promptText, systemInstruction);
      setSystemState("SYSTEM ONLINE", "[ONLINE]");
      return reply;
    } catch (err) {
      console.warn(`Model failed, moving to next model in chain (${modelName}):`, err);
    }
  }

  // All configured Gemini models failed or hit quota/limit -> trigger Google Web Fallback
  const webHtml = await fetchGoogleWebFallback(promptText);
  setSystemState("SYSTEM ONLINE", "[WEB-FALLBACK]");
  return webHtml;
}

async function handleUserCommand(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;

  appendMessage("user", text);
  if (msgInput) msgInput.value = "";

  const lower = text.toLowerCase();
  if (lower === "open memory" || lower === "memory") {
    openModal("memory-modal");
    appendMessage("ai", "Opening Vault Memory & Details, Boss.");
    speakText("Opening Vault Memory, Boss.");
    return;
  }
  if (lower === "open history" || lower === "history") {
    openModal("history-modal");
    appendMessage("ai", "Opening Command History Log, Boss.");
    speakText("Opening History Log, Boss.");
    return;
  }
  if (lower.startsWith("remember ") || lower.startsWith("save memory ")) {
    const fact = text.replace(/^(remember|save memory)\s+/i, "").trim();
    if (fact) {
      memoryStore.push({ text: fact, time: new Date().toLocaleString() });
      localStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(memoryStore));
      updateTelemetryCounts();
      const confirmation = `Noted in Vault Memory, Boss: "${fact}"`;
      appendMessage("ai", confirmation);
      speakText(confirmation);
      return;
    }
  }

  const aiReply = await queryGeminiOrFallback(text);
  appendMessage("ai", aiReply);

  const plainTextForSpeech = aiReply.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plainTextForSpeech) {
    speakText(plainTextForSpeech.slice(0, 260));
  }
}

function handleHardcoded(cmd) {
  handleUserCommand(cmd);
}

function triggerWebSearchPrompt() {
  const q = (msgInput?.value || "").trim() || prompt("Enter search query for Google Web Fallback, Boss:");
  if (!q) return;
  appendMessage("user", `Web Search: ${q}`);
  fetchGoogleWebFallback(q).then(html => appendMessage("ai", html));
}

function setSystemState(mainStatus, badgeStatus) {
  if (statusText) statusText.textContent = mainStatus;
  if (statusBadge) statusBadge.textContent = badgeStatus;
}

// ==================== 6. VOICE RECOGNITION & SPEECH SYNTHESIS ====================
function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.03;
    utter.pitch = 0.95;
    utter.onstart = () => {
      isSpeaking = true;
      if (speechIndicator) speechIndicator.textContent = "SPEAKING";
    };
    utter.onend = () => {
      isSpeaking = false;
      if (speechIndicator) speechIndicator.textContent = isMicListening ? "LISTENING" : "IDLE";
    };
    utter.onerror = () => {
      isSpeaking = false;
      if (speechIndicator) speechIndicator.textContent = "IDLE";
    };
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}

function setupSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;

  recognition = new SpeechRec();
  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isMicListening = true;
    micBtn?.classList.add("listening", "active-mic");
    if (voiceStatus) voiceStatus.textContent = "ACTIVE";
    if (speechIndicator) speechIndicator.textContent = "LISTENING";
  };

  recognition.onresult = (event) => {
    const lastIdx = event.results.length - 1;
    const transcript = event.results[lastIdx][0].transcript.trim();
    if (transcript) {
      handleUserCommand(transcript);
    }
  };

  recognition.onerror = () => {
    if (speechIndicator) speechIndicator.textContent = "MIC ERR";
  };

  recognition.onend = () => {
    if (isMicListening) {
      try {
        recognition.start();
      } catch (_) {}
    } else {
      micBtn?.classList.remove("listening", "active-mic");
      if (voiceStatus) voiceStatus.textContent = "STANDBY";
      if (speechIndicator) speechIndicator.textContent = "IDLE";
    }
  };
}

function toggleMic() {
  if (!recognition) setupSpeechRecognition();
  if (!recognition) {
    appendMessage("ai", "Speech Recognition is not supported in this browser, Boss.");
    return;
  }
  if (!isMicListening) {
    isMicListening = true;
    try {
      recognition.start();
    } catch (_) {}
  } else {
    isMicListening = false;
    try {
      recognition.stop();
    } catch (_) {}
    micBtn?.classList.remove("listening", "active-mic");
    if (voiceStatus) voiceStatus.textContent = "STANDBY";
    if (speechIndicator) speechIndicator.textContent = "IDLE";
  }
}

function toggleJarvisMode() {
  isJarvisStrictMode = !isJarvisStrictMode;
  if (modeIndicator) {
    modeIndicator.textContent = isJarvisStrictMode ? "JARVIS-STRICT" : "STANDARD";
  }
  rightOrb?.classList.toggle("jarvis-mode-active", isJarvisStrictMode);
  const msg = isJarvisStrictMode
    ? "Jarvis Strict Tactical Mode engaged, Boss."
    : "Standard AI Mode restored, Boss.";
  appendMessage("ai", msg);
  speakText(msg);
}

// ==================== 7. SIGNAL WAVE, EQUALIZER & CIRCULAR VIBRATION ====================
function initEqualizer() {
  const eq = document.getElementById("equalizer");
  if (!eq) return;
  eq.innerHTML = "";
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement("div");
    bar.className = "eq-bar";
    eq.appendChild(bar);
  }
}

let wavePhase = 0;
function renderVisualizers() {
  wavePhase += 0.08;
  const activeBoost = isSpeaking ? 0.55 : (isMicListening ? 0.35 : 0.08);
  audioWaveLevel += (activeBoost - audioWaveLevel) * 0.15;

  const netCanvas = document.getElementById("networkCanvas");
  if (netCanvas) {
    const ctx = netCanvas.getContext("2d");
    const w = netCanvas.width;
    const h = netCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(59, 232, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = "#3be8ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#3be8ff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let x = 0; x < w; x += 3) {
      const amp = (h * 0.34) * (0.35 + audioWaveLevel);
      const y = h / 2 + Math.sin(x * 0.055 + wavePhase) * amp * Math.cos(x * 0.02 - wavePhase * 0.5);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const bars = document.querySelectorAll("#equalizer .eq-bar");
  bars.forEach((bar, idx) => {
    const wave = Math.abs(Math.sin(wavePhase * 1.3 + idx * 0.45));
    const pct = Math.min(100, Math.max(12, Math.round((14 + wave * 58) * (0.65 + audioWaveLevel * 1.4))));
    bar.style.height = `${pct}%`;
  });

  const vibCanvas = document.getElementById("circularVibrationCanvas");
  if (vibCanvas) {
    const vctx = vibCanvas.getContext("2d");
    const cx = vibCanvas.width / 2;
    const cy = vibCanvas.height / 2;
    const baseR = 112;
    vctx.clearRect(0, 0, vibCanvas.width, vibCanvas.height);

    vctx.strokeStyle = "#8cf3ff";
    vctx.lineWidth = 1.8;
    vctx.beginPath();
    const points = 72;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const ripple = Math.sin(angle * 10 + wavePhase * 2.2) * (4 + audioWaveLevel * 22);
      const r = baseR + ripple;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) vctx.moveTo(px, py);
      else vctx.lineTo(px, py);
    }
    vctx.closePath();
    vctx.stroke();
  }

  requestAnimationFrame(renderVisualizers);
}

// ==================== 8. KEYFRAME FX DIAL (3 LEFT TURNS + DRAG TO EXPAND) ====================
let expandedElement = null;

function collapseExpandedPanel() {
  if (expandedElement) {
    expandedElement.classList.remove("expanded-fullscreen");
    expandedElement = null;
  }
  const puck = document.getElementById("keyDialPuck");
  const stage = document.getElementById("keyRingStage");
  if (puck && stage && puck.parentElement !== stage) {
    puck.classList.remove("floating-key", "docked-return", "dragging");
    puck.style.left = "";
    puck.style.top = "";
    puck.style.right = "";
    puck.style.bottom = "";
    stage.appendChild(puck);
  }
}

function setupRotaryKey() {
  const puck = document.getElementById("keyDialPuck");
  const stage = document.getElementById("keyRingStage");
  const badge = document.getElementById("keyTurnBadge");
  const lockState = document.getElementById("keyLockState");
  if (!puck || !stage) return;

  let isRotating = false;
  let isDraggingPanel = false;
  let lastAngle = null;
  let totalCounterClockwiseDeg = 0;
  let unlocked = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let hoveredBox = null;

  function getPointerAngle(clientX, clientY) {
    const rect = puck.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }

  function updateDialVisual(deg) {
    puck.style.setProperty("--key-angle", `${deg}deg`);
    const turns = Math.min(3, Math.floor(totalCounterClockwiseDeg / 360));
    if (badge) badge.textContent = unlocked ? "3/3" : `${turns}/3`;
    if (lockState) lockState.textContent = unlocked ? "UNLOCKED" : "LOCKED";
    if (unlocked) {
      puck.classList.add("key-activated");
    } else {
      puck.classList.remove("key-activated");
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;

    if (unlocked) {
      isDraggingPanel = true;
      const rect = puck.getBoundingClientRect();
      dragOffsetX = pt.clientX - (rect.left + rect.width / 2);
      dragOffsetY = pt.clientY - (rect.top + rect.height / 2);
      puck.classList.add("floating-key", "dragging");
      puck.classList.remove("docked-return");
      document.body.appendChild(puck);
      puck.style.left = `${rect.left}px`;
      puck.style.top = `${rect.top}px`;
    } else {
      isRotating = true;
      lastAngle = getPointerAngle(pt.clientX, pt.clientY);
    }
  }

  function onPointerMove(e) {
    const pt = e.touches ? e.touches[0] : e;

    if (isRotating) {
      const currentAngle = getPointerAngle(pt.clientX, pt.clientY);
      let delta = currentAngle - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      lastAngle = currentAngle;

      if (delta < 0) {
        totalCounterClockwiseDeg += Math.abs(delta);
        if (totalCounterClockwiseDeg >= 1080) {
          totalCounterClockwiseDeg = 1080;
          unlocked = true;
        }
      }
      updateDialVisual(-totalCounterClockwiseDeg);
    } else if (isDraggingPanel) {
      const halfW = puck.offsetWidth / 2;
      const halfH = puck.offsetHeight / 2;
      puck.style.left = `${pt.clientX - dragOffsetX - halfW}px`;
      puck.style.top = `${pt.clientY - dragOffsetY - halfH}px`;

      document.querySelectorAll("[data-expandable='true']").forEach(el => {
        el.classList.remove("drop-target-hover");
      });

      const targets = Array.from(document.querySelectorAll("[data-expandable='true']"));
      hoveredBox = null;
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (pt.clientX >= r.left && pt.clientX <= r.right && pt.clientY >= r.top && pt.clientY <= r.bottom) {
          hoveredBox = el;
          el.classList.add("drop-target-hover");
          break;
        }
      }
    }
  }

  function onPointerUp() {
    if (isRotating) {
      isRotating = false;
      lastAngle = null;
    }

    if (isDraggingPanel) {
      isDraggingPanel = false;
      puck.classList.remove("dragging");

      document.querySelectorAll("[data-expandable='true']").forEach(el => {
        el.classList.remove("drop-target-hover");
      });

      if (hoveredBox) {
        if (expandedElement && expandedElement !== hoveredBox) {
          expandedElement.classList.remove("expanded-fullscreen");
        }
        hoveredBox.classList.add("expanded-fullscreen");
        expandedElement = hoveredBox;
        puck.classList.add("docked-return");
        puck.style.left = "";
        puck.style.top = "";
      } else {
        puck.classList.remove("floating-key", "docked-return");
        puck.style.left = "";
        puck.style.top = "";
        stage.appendChild(puck);
      }
      hoveredBox = null;
    }
  }

  puck.addEventListener("mousedown", onPointerDown);
  puck.addEventListener("touchstart", onPointerDown, { passive: false });
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchend", onPointerUp);

  puck.addEventListener("click", () => {
    if (expandedElement) {
      collapseExpandedPanel();
      unlocked = false;
      totalCounterClockwiseDeg = 0;
      updateDialVisual(0);
    }
  });
}

// ==================== 9. GALLERY UPLOAD & INITIALIZATION ====================
function setupGalleryUpload() {
  imgInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        appendMessage(
          "ai",
          `<div><strong>[GALLERY ASSET LOADED: ${file.name}]</strong></div>` +
          `<img src="${reader.result}" alt="${file.name}" style="max-width:100%;max-height:160px;border:1px solid #3be8ff;border-radius:4px;margin-top:4px;" />`
        );
      };
      reader.readAsDataURL(file);
    });
    imgInput.value = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildTopRuler();
  updateClockAndDate();
  setInterval(updateClockAndDate, 1000);

  buildArcDock();
  initEqualizer();
  updateTelemetryCounts();
  setupModals();
  setupRotaryKey();
  setupSpeechRecognition();
  setupGalleryUpload();
  renderVisualizers();

  executeBtn?.addEventListener("click", () => handleUserCommand(msgInput?.value || ""));
  msgInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleUserCommand(msgInput.value);
  });
  micBtn?.addEventListener("click", toggleMic);

  if (chatHistory.length > 0) {
    chatHistory.slice(-15).forEach(item => appendMessage(item.sender, item.text, false));
  } else {
    appendMessage("ai", "J.A.R.V.I.S. Mark VII HUD online in Neon Cyan mode, Boss. Ready for commands.", false);
  }
});
