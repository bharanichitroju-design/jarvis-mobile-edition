/* =========================================================
   STARK INDUSTRIES // J.A.R.V.I.S. HACKING WALL SCRIPT
   - Multi-Model Gemini Chain + Automatic Google Web Fallback
   - 6 Dock Buttons: YouTube, 3D work, Games, Voice, Exist, Clear
   - Box 1 (Your Diary), Box 2 (Media), Box 3 (Personal + AI Locked)
   - Key-Drop-Only Fullscreen Activation + Auto Key Deactivation
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

const STORAGE_KEYS = {
  HISTORY: "jarvis_hud_history_v1",
  MEMORY: "jarvis_hud_memory_v1",
  DIARY: "jarvis_hud_diary_box1_v1",
  MEDIA: "jarvis_hud_media_box2_v1",
  PERSONAL: "jarvis_hud_personal_box3_v1"
};

const PERSONAL_PASSCODE = "5030";
const WRONG_PASS_MESSAGE = "You are danger. This password is incorrect.";

let chatHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
let memoryStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY) || "[]");
let diaryEntries = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIARY) || "[]");
let mediaItems = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEDIA) || "[]");
let personalDetails = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERSONAL) || "[]");

let isMicListening = false;
let isJarvisStrictMode = false;
let isSpeaking = false;
let recognition = null;
let audioWaveLevel = 0.08;

let pendingDiaryPhoto = "";
let pendingDiaryPhotoName = "";
let pendingPersonalPhoto = "";
let pendingPersonalPhotoName = "";
let personalUnlocked = false;
let keypadBuffer = "";

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

const memCountEl = document.getElementById("memCount");
const file3dCountEl = document.getElementById("file3dCount");
const msgCountEl = document.getElementById("msgCount");
const mediaCountBadge = document.getElementById("mediaCountBadge");
const mediaMiniStrip = document.getElementById("mediaMiniStrip");
const diaryLatestMeta = document.getElementById("diaryLatestMeta");
const personalLockBadge = document.getElementById("personalLockBadge");

// ==================== 3. RULER, CLOCK, NODE POINTS, SPECTRUM & 6-BUTTON ARC DOCK ====================
function buildTopRuler() {
  const ruler = document.getElementById("topRuler");
  if (!ruler) return;
  ruler.innerHTML = "";
  const todayNum = new Date().getDate();
  for (let i = 1; i <= 30; i++) {
    const span = document.createElement("span");
    span.textContent = String(i).padStart(2, "0");
    if (i === todayNum || (todayNum > 30 && i === 30)) span.classList.add("active");
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

function startIndicatorPointsCycle() {
  const nodes = Array.from(document.querySelectorAll("#indicatorPoints .node-pt"));
  if (!nodes.length) return;
  let activeIdx = 0;
  setInterval(() => {
    nodes.forEach((n, idx) => n.classList.toggle("active", idx === activeIdx));
    activeIdx = (activeIdx + 1) % nodes.length;
  }, 900);
}

function buildSpectrumBars() {
  const frame = document.getElementById("spectrumBarsFrame");
  if (!frame) return;
  const barCount = 24;
  frame.innerHTML = "";
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const col = document.createElement("div");
    col.className = "spectrum-bar-col";
    col.style.height = "25%";
    frame.appendChild(col);
    bars.push(col);
  }

  let tick = 0;
  setInterval(() => {
    tick += 0.22;
    const energy = isSpeaking ? 0.92 : (isMicListening ? 0.65 : 0.28);
    bars.forEach((col, i) => {
      const waveA = Math.abs(Math.sin(tick + i * 0.42));
      const waveB = Math.abs(Math.cos(tick * 0.7 - i * 0.28));
      const pct = Math.max(14, Math.min(96, Math.round((waveA * 0.65 + waveB * 0.35) * 100 * energy + 12)));
      col.style.height = `${pct}%`;
    });
  }, 150);
}

function buildArcDock() {
  const dock = document.getElementById("arcDock");
  if (!dock) return;

  const buttons = [
    {
      label: "YouTube",
      action: () => {
        appendMessage("ai", "Launching YouTube, Boss.");
        window.open("https://www.youtube.com", "_blank", "noopener,noreferrer");
      }
    },
    {
      label: "3D work",
      action: () => open3DWorkplaceModal()
    },
    {
      label: "Games",
      action: () => openGamesModal()
    },
    {
      label: "Voice",
      action: () => toggleMic()
    },
    {
      label: "Exist",
      action: () => triggerExistBackAction()
    },
    {
      label: "Clear",
      action: () => openClearChatChoice()
    }
  ];

  dock.innerHTML = "";
  buttons.forEach((btn, idx) => {
    const slot = document.createElement("div");
    slot.className = "dock-slot";
    slot.innerHTML = `
      <div class="dock-orb" title="${btn.label}">
        <svg viewBox="0 0 64 64">
          <g class="dock-rot-frame" style="transform-origin:32px 32px;">
            <circle cx="32" cy="32" r="28" fill="rgba(4,24,46,0.9)" stroke="#3be8ff" stroke-width="2" stroke-dasharray="10 5" />
            <circle cx="32" cy="32" r="21" fill="none" stroke="#8cf3ff" stroke-width="1.4" stroke-dasharray="6 4" />
          </g>
          <circle cx="32" cy="32" r="12" fill="rgba(14,165,233,0.35)" stroke="#ffffff" stroke-width="1.5" />
          <text x="32" y="35" text-anchor="middle" fill="#ffffff" font-family="Orbitron" font-size="8" font-weight="700">0${idx + 1}</text>
        </svg>
      </div>
      <span class="dock-sub-label">${btn.label}</span>
    `;
    slot.addEventListener("click", btn.action);
    dock.appendChild(slot);
  });
}

function updateTelemetryCounts() {
  if (memCountEl) memCountEl.textContent = String(diaryEntries.length);
  if (file3dCountEl) file3dCountEl.textContent = String(mediaItems.length);
  if (msgCountEl) msgCountEl.textContent = String(chatHistory.length);
  if (mediaCountBadge) mediaCountBadge.textContent = String(mediaItems.length);

  if (diaryLatestMeta) {
    if (diaryEntries.length > 0) {
      const latest = diaryEntries[diaryEntries.length - 1];
      diaryLatestMeta.textContent = `${latest.fileLabel} // AI CONNECTED`;
    } else {
      diaryLatestMeta.textContent = "BOX 1 // TEXT & PHOTOS • AI CONNECTED";
    }
  }

  if (mediaMiniStrip) {
    if (mediaItems.length > 0) {
      const latestMedia = mediaItems[mediaItems.length - 1];
      mediaMiniStrip.textContent = `${latestMedia.fileLabel}: ${latestMedia.name}`;
    } else {
      mediaMiniStrip.textContent = "PHOTOS & VIDEOS • AI CONNECTED";
    }
  }

  if (personalLockBadge) {
    personalLockBadge.textContent = personalUnlocked ? "AI UNLOCKED" : "AI LOCKED";
  }
}

// ==================== 4. CHAT, HISTORY, MEMORY & CLEAR CHOICE ====================
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
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(chatHistory.slice(-150)));
    updateTelemetryCounts();
  }
}

function openClearChatChoice() {
  openModal("clear-choice-modal");
}

function finalizeClearChat(saveToBothMemoryAndHistory) {
  const snapshot = chatHistory.slice();
  const formatted = snapshot
    .map(m => `[${m.sender.toUpperCase()} @ ${m.time || ""}]: ${m.text.replace(/<[^>]*>/g, "")}`)
    .join(" | ");

  if (formatted) {
    const record = {
      text: `Cleared Chat Log: ${formatted.slice(0, 1200)}`,
      time: new Date().toLocaleString()
    };
    if (saveToBothMemoryAndHistory) {
      memoryStore.push(record);
      localStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(memoryStore));
    }
  }

  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(chatHistory.slice(-150)));
  if (chatBox) {
    chatBox.innerHTML = "";
  }
  updateTelemetryCounts();
  closeModal("clear-choice-modal");

  const statusMsg = saveToBothMemoryAndHistory
    ? "Chat cleared and saved to Memory and History, Boss."
    : "Chat cleared and saved to History only, Boss.";
  appendMessage("ai", statusMsg, false);
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

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = "block";
  if (id === "history-modal") renderSavedHistory();
  if (id === "diary-modal") renderDiaryList(document.getElementById("diary-search-input")?.value || "");
  if (id === "media-modal") renderMediaGrid();
  if (id === "personal-modal") refreshPersonalModalState();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
  if (id === "diary-modal" || id === "media-modal" || id === "personal-modal") {
    resetRotaryKeyLock();
  }
}

function setupModals() {
  document.getElementById("close-history")?.addEventListener("click", () => closeModal("history-modal"));
  document.getElementById("close-diary-modal")?.addEventListener("click", () => closeModal("diary-modal"));
  document.getElementById("close-media-modal")?.addEventListener("click", () => closeModal("media-modal"));
  document.getElementById("close-personal-modal")?.addEventListener("click", () => closeModal("personal-modal"));
  document.getElementById("close-clear-choice")?.addEventListener("click", () => closeModal("clear-choice-modal"));
  document.getElementById("close-workspace-tool")?.addEventListener("click", () => closeModal("workspace-tool-modal"));

  document.getElementById("clear-all-history")?.addEventListener("click", () => {
    chatHistory = [];
    localStorage.setItem(STORAGE_KEYS.HISTORY, "[]");
    updateTelemetryCounts();
    renderSavedHistory();
  });

  document.getElementById("saveClearToHistoryOnly")?.addEventListener("click", () => finalizeClearChat(false));
  document.getElementById("saveClearToMemoryAndHistory")?.addEventListener("click", () => finalizeClearChat(true));

  window.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("modal")) {
      const mId = e.target.id;
      e.target.style.display = "none";
      if (mId === "diary-modal" || mId === "media-modal" || mId === "personal-modal") {
        resetRotaryKeyLock();
      }
    }
  });
}

// ==================== 5. BOX 1 (YOUR DIARY), BOX 2 (MEDIA) & BOX 3 (PERSONAL + AI LOCKED) ====================
function setupDiaryBox1() {
  const imgInp = document.getElementById("diary-img-input");
  const badge = document.getElementById("diaryPendingPhotoBadge");
  const saveBtn = document.getElementById("save-diary-entry");
  const searchInp = document.getElementById("diary-search-input");
  const askAiBtn = document.getElementById("ask-diary-ai-btn");
  const aiInp = document.getElementById("diary-ai-input");

  imgInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingDiaryPhoto = reader.result;
      pendingDiaryPhotoName = file.name;
      if (badge) badge.textContent = `PHOTO: ${file.name}`;
    };
    reader.readAsDataURL(file);
    imgInp.value = "";
  });

  saveBtn?.addEventListener("click", () => {
    const textInp = document.getElementById("diary-text-input");
    const txt = (textInp?.value || "").trim();
    if (!txt && !pendingDiaryPhoto) return;

    const fileNum = diaryEntries.length + 1;
    const entry = {
      box: 1,
      fileNumber: fileNum,
      fileLabel: `Box 1 File ${fileNum}`,
      text: txt,
      image: pendingDiaryPhoto || "",
      photoName: pendingDiaryPhotoName || "",
      timestamp: new Date().toLocaleString()
    };

    diaryEntries.push(entry);
    try {
      localStorage.setItem(STORAGE_KEYS.DIARY, JSON.stringify(diaryEntries.slice(-40)));
    } catch (_) {}

    if (textInp) textInp.value = "";
    pendingDiaryPhoto = "";
    pendingDiaryPhotoName = "";
    if (badge) badge.textContent = "NO PHOTO";
    updateTelemetryCounts();
    renderDiaryList(searchInp?.value || "");
    appendMessage("ai", `Saved ${entry.fileLabel} to Your Diary (${entry.timestamp}), Boss.`);
  });

  searchInp?.addEventListener("input", (e) => renderDiaryList(e.target.value));

  askAiBtn?.addEventListener("click", () => {
    const q = (aiInp?.value || "").trim();
    if (!q) return;
    const ans = answerFromBox1Diary(q);
    appendMessage("user", `[Diary AI] ${q}`);
    appendMessage("ai", ans);
    if (aiInp) aiInp.value = "";
  });
}

function renderDiaryList(filter = "") {
  const list = document.getElementById("diary-entries-list");
  if (!list) return;
  const q = filter.trim().toLowerCase();
  const rows = q
    ? diaryEntries.filter(d =>
        (d.text && d.text.toLowerCase().includes(q)) ||
        (d.fileLabel && d.fileLabel.toLowerCase().includes(q)) ||
        (d.timestamp && d.timestamp.toLowerCase().includes(q))
      )
    : diaryEntries;

  if (!rows.length) {
    list.innerHTML = `<div class="history-item">No diary entries in Box 1 yet, Boss.</div>`;
    return;
  }

  list.innerHTML = rows.slice().reverse().map(d => `
    <div class="history-item">
      <strong>${d.fileLabel}</strong> — <small>${d.timestamp}</small>
      ${d.text ? `<div style="margin-top:4px;white-space:pre-wrap;">${d.text}</div>` : ""}
      ${d.image ? `<img src="${d.image}" alt="${d.fileLabel}" style="max-width:100%;max-height:130px;border:1px solid #3be8ff;border-radius:3px;margin-top:6px;cursor:pointer;" onclick="openLightbox('${d.fileLabel}', '${d.image}', 'image')" />` : ""}
    </div>
  `).join("");
}

function answerFromBox1Diary(query) {
  const lower = query.toLowerCase();
  if (!lower.includes("box 1") && !lower.includes("file") && !lower.includes("diary")) {
    return "Please mention Box 1 or a specific File number (e.g., Box 1 File 1) so I can answer from that entry, Boss.";
  }

  const fileMatch = lower.match(/file\s*(\d+)/);
  if (fileMatch) {
    const targetNum = parseInt(fileMatch[1], 10);
    const found = diaryEntries.find(d => d.fileNumber === targetNum);
    if (!found) {
      return `Box 1 File ${targetNum} is not found in Your Diary, Boss.`;
    }
    return `<strong>[${found.fileLabel} — ${found.timestamp}]</strong><br/>${found.text || (found.image ? `Uploaded Photo: ${found.photoName || "Image"}` : "Empty entry")}`;
  }

  if (!diaryEntries.length) {
    return "Box 1 currently has no saved diary entries, Boss.";
  }

  const latest = diaryEntries[diaryEntries.length - 1];
  return `<strong>[Box 1 Latest — ${latest.fileLabel} (${latest.timestamp})]</strong><br/>${latest.text || (latest.image ? `Uploaded Photo: ${latest.photoName || "Image"}` : "Photo log saved.")}`;
}

function setupMediaBox2() {
  const mediaInp = document.getElementById("media-files-input");
  const askAiBtn = document.getElementById("ask-media-ai-btn");
  const aiInp = document.getElementById("media-ai-input");

  mediaInp?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach(file => {
      const isVideo = file.type.startsWith("video/");
      const reader = new FileReader();
      reader.onload = () => {
        const fileNum = mediaItems.length + 1;
        const item = {
          box: 2,
          fileNumber: fileNum,
          fileLabel: `Box 2 File ${fileNum}`,
          name: file.name,
          type: isVideo ? "video" : "image",
          src: reader.result,
          timestamp: new Date().toLocaleString()
        };
        mediaItems.push(item);
        try {
          localStorage.setItem(STORAGE_KEYS.MEDIA, JSON.stringify(mediaItems.slice(-30)));
        } catch (_) {
          mediaItems[mediaItems.length - 1].src = URL.createObjectURL(file);
        }
        updateTelemetryCounts();
        renderMediaGrid();
        appendMessage("ai", `Added ${item.fileLabel} (${item.name}) to Media Box, Boss.`);
      };
      reader.readAsDataURL(file);
    });

    mediaInp.value = "";
  });

  askAiBtn?.addEventListener("click", () => {
    const q = (aiInp?.value || "").trim();
    if (!q) return;
    const ans = answerFromBox2Media(q);
    appendMessage("user", `[Media AI] ${q}`);
    appendMessage("ai", ans);
    if (aiInp) aiInp.value = "";
  });
}

function renderMediaGrid() {
  const grid = document.getElementById("media-gallery-grid");
  if (!grid) return;
  if (!mediaItems.length) {
    grid.innerHTML = `<div class="history-item" style="grid-column:1/-1;">No photos or videos in Media Box yet, Boss.</div>`;
    return;
  }

  grid.innerHTML = mediaItems.slice().reverse().map(item => `
    <div class="media-thumb-card" onclick="openMediaItemById(${item.fileNumber})">
      ${item.type === "video"
        ? `<video src="${item.src}" muted preload="metadata"></video>`
        : `<img src="${item.src}" alt="${item.fileLabel}" />`
      }
      <div style="font-family:var(--font-mono);font-size:0.58rem;margin-top:3px;color:#ffffff;">${item.fileLabel}</div>
      <div style="font-family:var(--font-mono);font-size:0.5rem;color:#9bf7ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
    </div>
  `).join("");
}

function openMediaItemById(fileNumber) {
  const item = mediaItems.find(m => m.fileNumber === fileNumber);
  if (!item) return;
  openLightbox(`${item.fileLabel} — ${item.name}`, item.src, item.type);
}

function openLightbox(title, src, type) {
  const titleEl = document.getElementById("lightboxTitle");
  const bodyEl = document.getElementById("lightboxContent");
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = title;
  if (type === "video") {
    bodyEl.innerHTML = `<video src="${src}" controls autoplay style="width:100%;max-height:66vh;border:1px solid #3be8ff;border-radius:4px;"></video>`;
  } else {
    bodyEl.innerHTML = `<img src="${src}" alt="${title}" style="max-width:100%;max-height:66vh;border:1px solid #3be8ff;border-radius:4px;" />`;
  }
  openModal("media-lightbox-modal");
}

function answerFromBox2Media(query) {
  const lower = query.toLowerCase();
  if (!lower.includes("box 2") && !lower.includes("file") && !lower.includes("media")) {
    return "Mention Box 2 and the File number (e.g., Box 2 File 1) to inspect that media item, Boss.";
  }
  const m = lower.match(/file\s*(\d+)/);
  if (m) {
    const num = parseInt(m[1], 10);
    const found = mediaItems.find(x => x.fileNumber === num);
    if (!found) return `Box 2 File ${num} was not found in Media Box, Boss.`;
    return `<strong>[${found.fileLabel}]</strong> Type: ${found.type.toUpperCase()} | File Name: ${found.name} | Added: ${found.timestamp}`;
  }
  if (!mediaItems.length) return "Media Box has no files stored yet, Boss.";
  const latest = mediaItems[mediaItems.length - 1];
  return `<strong>[Box 2 Latest — ${latest.fileLabel}]</strong> ${latest.type.toUpperCase()}: ${latest.name} (${latest.timestamp})`;
}

function setupPersonalBox3() {
  const displayEl = document.getElementById("keypadDisplay");
  const alertEl = document.getElementById("personal-danger-alert");
  const imgInp = document.getElementById("personal-img-input");
  const photoBadge = document.getElementById("personalPendingPhotoBadge");
  const saveBtn = document.getElementById("save-personal-detail");
  const askAiBtn = document.getElementById("ask-personal-ai-btn");
  const aiInp = document.getElementById("personal-ai-input");

  function syncKeypadDisplay() {
    if (!displayEl) return;
    const slots = [0, 1, 2, 3].map(i => (keypadBuffer[i] ? keypadBuffer[i] : "•"));
    displayEl.textContent = slots.join(" ");
  }

  document.querySelectorAll("#flameKeypadGrid .flame-key-btn[data-digit]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (keypadBuffer.length < 4) {
        keypadBuffer += btn.getAttribute("data-digit");
        syncKeypadDisplay();
        if (alertEl) alertEl.textContent = "";
      }
    });
  });

  document.getElementById("keypadClearBtn")?.addEventListener("click", () => {
    keypadBuffer = "";
    syncKeypadDisplay();
    if (alertEl) alertEl.textContent = "";
  });

  document.getElementById("keypadEnterBtn")?.addEventListener("click", () => {
    if (keypadBuffer === PERSONAL_PASSCODE) {
      personalUnlocked = true;
      keypadBuffer = "";
      syncKeypadDisplay();
      if (alertEl) alertEl.textContent = "";
      refreshPersonalModalState();
      updateTelemetryCounts();
    } else {
      keypadBuffer = "";
      syncKeypadDisplay();
      if (alertEl) {
        alertEl.textContent = WRONG_PASS_MESSAGE;
      }
    }
  });

  imgInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingPersonalPhoto = reader.result;
      pendingPersonalPhotoName = file.name;
      if (photoBadge) photoBadge.textContent = `PHOTO: ${file.name}`;
    };
    reader.readAsDataURL(file);
    imgInp.value = "";
  });

  saveBtn?.addEventListener("click", () => {
    if (!personalUnlocked) {
      alert("This is AI locked, Boss.");
      return;
    }
    const inp = document.getElementById("personal-detail-input");
    const txt = (inp?.value || "").trim();
    if (!txt && !pendingPersonalPhoto) return;

    personalDetails.push({
      text: txt,
      image: pendingPersonalPhoto || "",
      photoName: pendingPersonalPhotoName || "",
      timestamp: new Date().toLocaleString()
    });
    try {
      localStorage.setItem(STORAGE_KEYS.PERSONAL, JSON.stringify(personalDetails.slice(-40)));
    } catch (_) {}

    if (inp) inp.value = "";
    pendingPersonalPhoto = "";
    pendingPersonalPhotoName = "";
    if (photoBadge) photoBadge.textContent = "NO PHOTO";
    renderPersonalEntries();
    appendMessage("ai", "Personal detail stored in your private AI vault, Boss.");
  });

  askAiBtn?.addEventListener("click", () => {
    const q = (aiInp?.value || "").trim();
    if (!q) return;
    if (!personalUnlocked) {
      const codeAttempt = prompt("This is AI locked. Enter security code, Boss:");
      if (codeAttempt !== PERSONAL_PASSCODE) {
        appendMessage("ai", WRONG_PASS_MESSAGE);
        if (aiInp) aiInp.value = "";
        return;
      }
      personalUnlocked = true;
      refreshPersonalModalState();
      updateTelemetryCounts();
    }

    const summary = personalDetails.length
      ? personalDetails.map((p, i) => `Record ${i + 1} (${p.timestamp}): ${p.text || (p.image ? `Photo (${p.photoName || "Image"})` : "")}`).join("<br/>")
      : "No personal details stored yet, Boss.";
    appendMessage("user", `[Personal AI] ${q}`);
    appendMessage("ai", `<strong>[PERSONAL VAULT AI — VERIFIED]</strong><br/>${summary}`);
    if (aiInp) aiInp.value = "";
  });
}

function refreshPersonalModalState() {
  const lockScreen = document.getElementById("personal-lock-screen");
  const unlockedContent = document.getElementById("personal-unlocked-content");
  if (!lockScreen || !unlockedContent) return;
  if (personalUnlocked) {
    lockScreen.style.display = "none";
    unlockedContent.style.display = "block";
    renderPersonalEntries();
  } else {
    lockScreen.style.display = "block";
    unlockedContent.style.display = "none";
  }
}

function renderPersonalEntries() {
  const list = document.getElementById("personal-entries-list");
  if (!list) return;
  if (!personalDetails.length) {
    list.innerHTML = `<div class="history-item">No personal details saved yet, Boss.</div>`;
    return;
  }
  list.innerHTML = personalDetails.slice().reverse().map((p, idx) => `
    <div class="history-item">
      <strong>Record #${personalDetails.length - idx}</strong> — <small>${p.timestamp}</small>
      ${p.text ? `<div style="margin-top:4px;white-space:pre-wrap;">${p.text}</div>` : ""}
      ${p.image ? `<img src="${p.image}" alt="Personal detail" style="max-width:100%;max-height:130px;border:1px solid #3be8ff;border-radius:3px;margin-top:6px;cursor:pointer;" onclick="openLightbox('Personal Record', '${p.image}', 'image')" />` : ""}
    </div>
  `).join("");
}

// ==================== 6. 3D WORKPLACE & GAMES MODALS ====================
function open3DWorkplaceModal() {
  const titleEl = document.getElementById("workspaceToolTitle");
  const bodyEl = document.getElementById("workspaceToolBody");
  if (titleEl) titleEl.textContent = "3D WORKPLACE";
  if (bodyEl) {
    bodyEl.innerHTML = `
      <p style="font-size:0.78rem;color:#d8f8ff;margin-bottom:8px;">
        Three-dimensional workspace ready for your Mark VII models, Boss.
      </p>
      <canvas id="threePreviewCanvas" width="480" height="210" style="width:100%;height:210px;border:1px solid #3be8ff;border-radius:4px;background:#020b16;"></canvas>
    `;
  }
  openModal("workspace-tool-modal");

  setTimeout(() => {
    const canvas = document.getElementById("threePreviewCanvas");
    if (!canvas || typeof THREE === "undefined") return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.clientWidth || 460, 210, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, (canvas.clientWidth || 460) / 210, 0.1, 1000);
    camera.position.z = 4.2;

    const geo = new THREE.TorusKnotGeometry(1.05, 0.3, 100, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3be8ff, wireframe: true });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    function animate3D() {
      if (!document.getElementById("threePreviewCanvas")) return;
      mesh.rotation.x += 0.012;
      mesh.rotation.y += 0.018;
      renderer.render(scene, camera);
      requestAnimationFrame(animate3D);
    }
    animate3D();
  }, 40);
}

function openGamesModal() {
  const titleEl = document.getElementById("workspaceToolTitle");
  const bodyEl = document.getElementById("workspaceToolBody");
  if (titleEl) titleEl.textContent = "GAMES BAY";
  if (bodyEl) {
    bodyEl.innerHTML = `
      <p style="font-size:0.78rem;color:#d8f8ff;margin-bottom:10px;">Select tactical simulation or arcade launch, Boss:</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="neon-btn" onclick="window.open('https://chess.com','_blank','noopener,noreferrer')">3D CHESS ARENA</button>
        <button type="button" class="btn" onclick="window.open('https://poki.com','_blank','noopener,noreferrer')">ARCADE SIMULATION BAY</button>
      </div>
    `;
  }
  openModal("workspace-tool-modal");
}

function triggerExistBackAction() {
  const openModals = Array.from(document.querySelectorAll(".modal")).filter(m => m.style.display === "block");
  if (openModals.length > 0) {
    const topModal = openModals[openModals.length - 1];
    topModal.style.display = "none";
    resetRotaryKeyLock();
    return;
  }
  if (expandedElement) {
    collapseExpandedPanel();
    resetRotaryKeyLock();
    return;
  }
  resetRotaryKeyLock();
  appendMessage("ai", "Returned to base HUD view and deactivated key, Boss.");
}

// ==================== 7. MULTI-MODEL GEMINI CHAIN + GOOGLE WEB FALLBACK ====================
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
  const timeoutId = setTimeout(() => controller.abort(), 6500);

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
  setSystemState("SCANNING", "SCAN");
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

  if (lower.includes("box 1") || (lower.includes("diary") && lower.includes("file"))) {
    appendMessage("ai", answerFromBox1Diary(text));
    return;
  }
  if (lower.includes("box 2") || (lower.includes("media") && lower.includes("file"))) {
    appendMessage("ai", answerFromBox2Media(text));
    return;
  }
  if (lower.includes("box 3") || lower.includes("personal detail")) {
    if (!personalUnlocked) {
      appendMessage("ai", "This is AI locked. Unlock Box 3 with the key and enter your security code first, Boss.");
      return;
    }
    const info = personalDetails.length
      ? personalDetails.map((p, idx) => `#${idx + 1} (${p.timestamp}): ${p.text || "[Photo]"}`).join("<br/>")
      : "No personal details recorded yet, Boss.";
    appendMessage("ai", info);
    return;
  }

  const aiReply = await queryGeminiOrFallback(text);
  appendMessage("ai", aiReply);

  const plainTextForSpeech = aiReply.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plainTextForSpeech) {
    speakText(plainTextForSpeech.slice(0, 260));
  }
}

function setSystemState(mainStatus, badgeStatus) {
  if (statusText) statusText.textContent = mainStatus;
  if (statusBadge) statusBadge.textContent = badgeStatus;
}

// ==================== 8. VOICE RECOGNITION & SPEECH SYNTHESIS ====================
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

function startAutoVoiceAccess() {
  if (!recognition) setupSpeechRecognition();
  if (!recognition || isMicListening) return;
  isMicListening = true;
  try {
    recognition.start();
  } catch (_) {
    isMicListening = false;
    const armOnce = () => {
      if (!isMicListening && recognition) {
        isMicListening = true;
        try { recognition.start(); } catch (_) { isMicListening = false; }
      }
      window.removeEventListener("pointerdown", armOnce);
      window.removeEventListener("keydown", armOnce);
    };
    window.addEventListener("pointerdown", armOnce, { once: true });
    window.addEventListener("keydown", armOnce, { once: true });
  }
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
    modeIndicator.textContent = isJarvisStrictMode ? "STRICT" : "STD";
  }
  rightOrb?.classList.toggle("jarvis-mode-active", isJarvisStrictMode);
  const msg = isJarvisStrictMode
    ? "Jarvis Strict Tactical Mode engaged, Boss."
    : "Standard AI Mode restored, Boss.";
  appendMessage("ai", msg);
  speakText(msg);
}

// ==================== 9. RED SIGNAL WAVE ====================
let wavePhase = 0;
function renderVisualizers() {
  wavePhase += 0.085;
  const activeBoost = isSpeaking ? 0.58 : (isMicListening ? 0.36 : 0.08);
  audioWaveLevel += (activeBoost - audioWaveLevel) * 0.15;

  const redCanvas = document.getElementById("redWaveCanvas");
  if (redCanvas) {
    const ctx = redCanvas.getContext("2d");
    const w = redCanvas.width;
    const h = redCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 51, 85, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = "#ff3355";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "#ff3355";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let x = 0; x < w; x += 2) {
      const spike = Math.pow(Math.abs(Math.sin(x * 0.045 - wavePhase * 1.4)), 2.2);
      const amp = (h * 0.36) * (0.35 + audioWaveLevel * 1.25);
      const y = h / 2 + Math.sin(x * 0.075 + wavePhase * 1.6) * amp * (0.45 + spike);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  requestAnimationFrame(renderVisualizers);
}

// ==================== 10. KEYFRAME FX DIAL (3 LEFT TURNS + DRAG TO EXPAND + AUTO DEACTIVATE) ====================
let expandedElement = null;
let resetRotaryKeyLock = () => {};

function collapseExpandedPanel() {
  if (expandedElement) {
    expandedElement.classList.remove("expanded-fullscreen");
    expandedElement = null;
  }
  const puck = document.getElementById("keyDialPuck");
  const stage = document.getElementById("keyRingStage");
  if (puck && stage && puck.parentElement !== stage) {
    puck.classList.remove("floating-key", "dragging");
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

  resetRotaryKeyLock = function () {
    isRotating = false;
    isDraggingPanel = false;
    lastAngle = null;
    totalCounterClockwiseDeg = 0;
    unlocked = false;
    hoveredBox = null;
    collapseExpandedPanel();
    updateDialVisual(0);
  };

  function onPointerDown(e) {
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;

    if (unlocked) {
      isDraggingPanel = true;
      const rect = puck.getBoundingClientRect();
      dragOffsetX = pt.clientX - (rect.left + rect.width / 2);
      dragOffsetY = pt.clientY - (rect.top + rect.height / 2);
      puck.classList.add("floating-key", "dragging");
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
        const modalTargetId = hoveredBox.getAttribute("data-modal-target");
        puck.classList.remove("floating-key");
        puck.style.left = "";
        puck.style.top = "";
        stage.appendChild(puck);

        // Automatically deactivate key upon opening / entering expanded view
        unlocked = false;
        totalCounterClockwiseDeg = 0;
        updateDialVisual(0);

        if (modalTargetId) {
          openModal(modalTargetId);
        } else {
          if (expandedElement && expandedElement !== hoveredBox) {
            expandedElement.classList.remove("expanded-fullscreen");
          }
          hoveredBox.classList.add("expanded-fullscreen");
          expandedElement = hoveredBox;
        }
      } else {
        puck.classList.remove("floating-key");
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
      resetRotaryKeyLock();
    }
  });
}

// ==================== 11. INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  buildTopRuler();
  updateClockAndDate();
  setInterval(updateClockAndDate, 1000);

  startIndicatorPointsCycle();
  buildSpectrumBars();
  buildArcDock();
  updateTelemetryCounts();
  setupModals();
  setupDiaryBox1();
  setupMediaBox2();
  setupPersonalBox3();
  setupRotaryKey();
  setupSpeechRecognition();
  startAutoVoiceAccess();
  renderVisualizers();

  executeBtn?.addEventListener("click", () => handleUserCommand(msgInput?.value || ""));
  msgInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleUserCommand(msgInput.value);
  });
  micBtn?.addEventListener("click", toggleMic);

  if (chatHistory.length > 0) {
    chatHistory.slice(-15).forEach(item => appendMessage(item.sender, item.text, false));
  } else {
    appendMessage("ai", "J.A.R.V.I.S. Mark VII Hacking HUD online, Boss. Ready for commands.", false);
  }
});
