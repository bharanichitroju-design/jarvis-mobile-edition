/* =========================================================
   STARK INDUSTRIES // J.A.R.V.I.S. HACKING WALL SCRIPT
   - Multi-Model Gemini Chain + Automatic Google Web Fallback
   - IndexedDB + Safe localStorage Persistence (Quota-Safe)
   - 6 Dock Buttons: YouTube, 3D work, Games, Voice, Exist, Clear
   - Library 1 (Diary Grid + Paragraph Editor + Inline Photo Box),
     Library 2 (Album Grid + Media),
     Library 3 (Personal + 503020 + 60s Lockout + Paragraph Editor)
   - Self-Speech Loop Guard + Single-Click (History) / Double-Click (Memory) Clear
   ========================================================= */

// ==================== 1. CONFIGURATION & STATE ====================
let GEMINI_API_KEY = localStorage.getItem("jarvis_key") || "";

function ensureGeminiApiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim().length < 10) {
    const entered = prompt("Enter your Gemini API Key, Boss:");
    if (entered && entered.trim()) {
      GEMINI_API_KEY = entered.trim();
      safeLocalStorageSet("jarvis_key", GEMINI_API_KEY);
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

const PERSONAL_PASSCODE = "503020";
const LOCKOUT_DURATION_SEC = 60;

const WRONG_PASS_QUOTES = [
  "Access denied. You are not the Boss. State your identity immediately. This system is locked down to protect sensitive data from intruders.",
  "Security breach imminent. Intruder alert logged. Your unauthorized attempt has triggered defensive protocols. Step away before countermeasures engage.",
  "Unauthorized access detected. Locking down system. Your presence has been flagged as a severe threat, and local authorities are being notified."
];

const WELCOME_BOSS_QUOTE =
  "Welcome, Boss. You are in a highly secure environment. Your personal library is now fully under your control.";

let chatHistory = safeParseJson(localStorage.getItem(STORAGE_KEYS.HISTORY), []);
let memoryStore = safeParseJson(localStorage.getItem(STORAGE_KEYS.MEMORY), []);
let diaryEntries = safeParseJson(localStorage.getItem(STORAGE_KEYS.DIARY), []);
let mediaItems = safeParseJson(localStorage.getItem(STORAGE_KEYS.MEDIA), []);
let personalDetails = safeParseJson(localStorage.getItem(STORAGE_KEYS.PERSONAL), []);

let isMicListening = false;
let isJarvisStrictMode = false;
let isSpeaking = false;
let lastSpokeEndTime = 0;
let recognition = null;
let audioWaveLevel = 0.08;

let personalUnlocked = false;
let keypadBuffer = "";
let failedAttemptsCount = 0;
let lockoutUntilMs = 0;
let lockoutIntervalId = null;
let typewriterTimerId = null;

// Editor & Album state
let activeEditorTarget = "diary"; // "diary" | "personal"
let activeEditorEditIndex = null;
let activeEditorPhoto = "";
let activeEditorPhotoName = "";
let activeAlbumIndex = null;

// ==================== 2. SAFE STORAGE & INDEXEDDB HELPER (PROBLEM 2 & 5) ====================
function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : (parsed ?? fallback);
  } catch (_) {
    return fallback;
  }
}

function safeLocalStorageSet(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    return true;
  } catch (err) {
    console.warn(`localStorage write skipped for [${key}] (quota or privacy mode):`, err);
    return false;
  }
}

let idbInstance = null;
function openVaultIndexedDB() {
  return new Promise((resolve) => {
    if (idbInstance) return resolve(idbInstance);
    if (!("indexedDB" in window)) return resolve(null);

    try {
      const req = indexedDB.open("JarvisHudVaultDB", 1);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("vault_snapshots")) {
          db.createObjectStore("vault_snapshots", { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        idbInstance = req.result;
        resolve(idbInstance);
      };
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function persistVaultSnapshot(key, dataObj) {
  const serialized = JSON.stringify(dataObj);
  safeLocalStorageSet(key, serialized);

  const db = await openVaultIndexedDB();
  if (!db) return;
  try {
    const tx = db.transaction("vault_snapshots", "readwrite");
    tx.objectStore("vault_snapshots").put({
      key,
      data: dataObj,
      updatedAt: Date.now()
    });
  } catch (_) {}
}

async function hydrateVaultsFromIndexedDB() {
  const db = await openVaultIndexedDB();
  if (!db) return;

  const keysToCheck = [
    [STORAGE_KEYS.DIARY, (v) => { diaryEntries = v; }],
    [STORAGE_KEYS.MEDIA, (v) => { mediaItems = v; }],
    [STORAGE_KEYS.PERSONAL, (v) => { personalDetails = v; }],
    [STORAGE_KEYS.MEMORY, (v) => { memoryStore = v; }]
  ];

  for (const [key, setter] of keysToCheck) {
    try {
      const record = await new Promise((res) => {
        const tx = db.transaction("vault_snapshots", "readonly");
        const getReq = tx.objectStore("vault_snapshots").get(key);
        getReq.onsuccess = () => res(getReq.result || null);
        getReq.onerror = () => res(null);
      });
      if (record && Array.isArray(record.data) && record.data.length > 0) {
        setter(record.data);
      }
    } catch (_) {}
  }

  updateTelemetryCounts();
}

// ==================== 3. DOM REFERENCES ====================
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
const rightOrb = document.getElementById("rightOrb");

const memCountEl = document.getElementById("memCount");
const file3dCountEl = document.getElementById("file3dCount");
const msgCountEl = document.getElementById("msgCount");
const mediaMiniStrip = document.getElementById("mediaMiniStrip");
const diaryLatestMeta = document.getElementById("diaryLatestMeta");
const personalLockBadge = document.getElementById("personalLockBadge");
const personalMiniPreview = document.getElementById("personalMiniPreview");

// ==================== 4. RULER, CLOCK, NODE POINTS, SPECTRUM & 6-BUTTON ARC DOCK ====================
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
      type: "click",
      action: () => {
        appendMessage("ai", "Launching YouTube, Boss.");
        window.open("https://www.youtube.com", "_blank", "noopener,noreferrer");
      }
    },
    {
      label: "3D work",
      type: "click",
      action: () => open3DWorkplaceModal()
    },
    {
      label: "Games",
      type: "click",
      action: () => openGamesModal()
    },
    {
      label: "Voice",
      type: "click",
      action: () => toggleMic()
    },
    {
      label: "Exist",
      type: "click",
      action: () => triggerExistBackAction()
    },
    {
      label: "Clear",
      type: "clear-split",
      singleAction: () => saveAndClearChat("history"),
      doubleAction: () => saveAndClearChat("memory")
    }
  ];

  dock.innerHTML = "";
  buttons.forEach((btn, idx) => {
    const slot = document.createElement("div");
    slot.className = "dock-slot";
    slot.setAttribute("role", "button");
    slot.setAttribute("tabindex", "0");
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

    if (btn.type === "clear-split") {
      let clickTimer = null;
      slot.addEventListener("click", () => {
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          btn.doubleAction();
        } else {
          clickTimer = setTimeout(() => {
            clickTimer = null;
            btn.singleAction();
          }, 260);
        }
      });
    } else {
      slot.addEventListener("click", btn.action);
    }

    slot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        slot.click();
      }
    });

    dock.appendChild(slot);
  });
}

function updateTelemetryCounts() {
  if (memCountEl) memCountEl.textContent = String(diaryEntries.length);
  if (file3dCountEl) file3dCountEl.textContent = String(mediaItems.length);
  if (msgCountEl) msgCountEl.textContent = String(chatHistory.length);

  if (diaryLatestMeta) {
    if (diaryEntries.length > 0) {
      const latest = diaryEntries[diaryEntries.length - 1];
      diaryLatestMeta.textContent = `LIBRARY 1 • ${latest.diaryName} (${latest.fileLabel})`;
    } else {
      diaryLatestMeta.textContent = "LIBRARY 1 // DIARIES & FILES • AI CONNECTED";
    }
  }

  if (mediaMiniStrip) {
    if (mediaItems.length > 0) {
      const latestMedia = mediaItems[mediaItems.length - 1];
      const albumTitle = latestMedia.albumName || latestMedia.name || "Album";
      mediaMiniStrip.textContent = `LIBRARY 2 • ${albumTitle}`;
    } else {
      mediaMiniStrip.textContent = "LIBRARY 2 // ALBUMS, PHOTOS & VIDEOS";
    }
  }

  if (personalLockBadge) {
    personalLockBadge.textContent = personalUnlocked ? "LIBRARY 3 • OPEN" : "LIBRARY 3 • LOCKED";
  }

  if (personalMiniPreview) {
    personalMiniPreview.textContent = personalUnlocked
      ? `LIBRARY 3 • ${personalDetails.length} PERSONAL DIARIES`
      : "LIBRARY 3 // SECURE VAULT • CODE PROTECTED";
  }
}

// ==================== 5. CHAT, HISTORY, MEMORY & CLEAR LOGIC ====================
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
    const trimmed = chatHistory.slice(-150);
    chatHistory = trimmed;
    safeLocalStorageSet(STORAGE_KEYS.HISTORY, JSON.stringify(trimmed));
    updateTelemetryCounts();
  }
}

function saveAndClearChat(targetMode) {
  const snapshot = chatHistory.slice();
  const formatted = snapshot
    .map(m => `[${m.sender.toUpperCase()} @ ${m.time || ""}]: ${m.text.replace(/<[^>]*>/g, "")}`)
    .join(" | ");

  if (targetMode === "memory" && formatted) {
    memoryStore.push({
      text: `Cleared Chat Saved to Memory: ${formatted.slice(0, 1400)}`,
      time: new Date().toLocaleString()
    });
    memoryStore = memoryStore.slice(-60);
    persistVaultSnapshot(STORAGE_KEYS.MEMORY, memoryStore);
  }

  safeLocalStorageSet(STORAGE_KEYS.HISTORY, JSON.stringify(chatHistory.slice(-150)));
  if (chatBox) {
    chatBox.innerHTML = "";
  }
  updateTelemetryCounts();

  const confirmation = targetMode === "memory"
    ? "Double-tap detected: Chat cleared and saved to Memory, Boss."
    : "Single-tap detected: Chat cleared and saved to History, Boss.";
  appendMessage("ai", confirmation, false);
}

function finalizeClearChat(saveToBothMemoryAndHistory) {
  saveAndClearChat(saveToBothMemoryAndHistory ? "memory" : "history");
  closeModal("clear-choice-modal");
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
  if (id === "diary-modal") renderDiaryGrid(document.getElementById("diary-search-input")?.value || "");
  if (id === "media-modal") renderAlbumGrid(document.getElementById("album-search-input")?.value || "");
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
  document.getElementById("close-entry-editor")?.addEventListener("click", () => closeModal("entry-editor-modal"));
  document.getElementById("close-album-detail")?.addEventListener("click", () => closeModal("album-detail-modal"));
  document.getElementById("close-clear-choice")?.addEventListener("click", () => closeModal("clear-choice-modal"));
  document.getElementById("close-workspace-tool")?.addEventListener("click", () => closeModal("workspace-tool-modal"));

  document.getElementById("clear-all-history")?.addEventListener("click", () => {
    chatHistory = [];
    safeLocalStorageSet(STORAGE_KEYS.HISTORY, "[]");
    updateTelemetryCounts();
    renderSavedHistory();
  });

  document.getElementById("saveClearToHistoryOnly")?.addEventListener("click", () => finalizeClearChat(false));
  document.getElementById("saveClearToMemoryAndHistory")?.addEventListener("click", () => finalizeClearChat(true));

  // Keyboard accessibility for role="button" vault boxes
  ["diaryBox", "mediaBox", "personalBox"].forEach((boxId) => {
    const el = document.getElementById(boxId);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const targetModal = el.getAttribute("data-modal-target");
        if (targetModal) openModal(targetModal);
      }
    });
  });

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

// ==================== 6. BOX 1 & BOX 3 EDITOR (PARAGRAPH FLOW + INLINE PHOTO PREVIEW BELOW TEXT) ====================
function syncEditorPhotoPreviewUI() {
  const previewBox = document.getElementById("editor-photo-preview-box");
  const previewImg = document.getElementById("editor-photo-preview-img");
  const previewLabel = document.getElementById("editor-photo-box-label");

  if (!previewBox || !previewImg) return;

  if (activeEditorPhoto) {
    previewImg.src = activeEditorPhoto;
    previewImg.alt = activeEditorPhotoName || "Attached Diary Photo";
    if (previewLabel) {
      previewLabel.textContent = `PHOTO // ${activeEditorPhotoName || "ATTACHED IMAGE"}`;
    }
    previewBox.style.display = "flex";
  } else {
    previewImg.removeAttribute("src");
    previewBox.style.display = "none";
  }
}

function openEntryEditor(targetType, existingIndex = null, presetPhoto = "", presetPhotoName = "") {
  activeEditorTarget = targetType;
  activeEditorEditIndex = existingIndex;

  activeEditorPhoto = "";
  activeEditorPhotoName = "";

  const nameInp = document.getElementById("editor-diary-name-input");
  const areaInp = document.getElementById("editor-numbered-textarea");

  const list = targetType === "personal" ? personalDetails : diaryEntries;
  if (existingIndex !== null && list[existingIndex]) {
    const item = list[existingIndex];
    if (nameInp) nameInp.value = item.diaryName || item.recordName || "";
    if (areaInp) areaInp.value = item.text || "";
    if (item.image) {
      activeEditorPhoto = item.image;
      activeEditorPhotoName = item.photoName || "Saved Photo";
    }
  } else {
    if (nameInp) nameInp.value = "";
    if (areaInp) areaInp.value = "";
  }

  if (presetPhoto) {
    activeEditorPhoto = presetPhoto;
    activeEditorPhotoName = presetPhotoName || "Uploaded Photo";
  }

  syncEditorPhotoPreviewUI();
  openModal("entry-editor-modal");

  setTimeout(() => {
    if (areaInp) {
      areaInp.focus();
      const len = areaInp.value.length;
      areaInp.setSelectionRange(len, len);
    }
  }, 50);
}

function persistEditorEntry(finalDiaryName) {
  const areaInp = document.getElementById("editor-numbered-textarea");
  const cleanText = (areaInp?.value || "").trim();

  if (!cleanText && !activeEditorPhoto) {
    appendMessage("ai", "Boss, please write diary text or upload a photo before saving.");
    return;
  }

  if (activeEditorTarget === "personal") {
    if (!personalUnlocked) {
      appendMessage("ai", "Library 3 is locked, Boss. Enter code 503020 first.");
      return;
    }
    const recordObj = {
      box: 3,
      diaryName: finalDiaryName,
      recordName: finalDiaryName,
      text: cleanText,
      image: activeEditorPhoto || "",
      photoName: activeEditorPhotoName || "",
      timestamp: new Date().toLocaleString()
    };

    if (activeEditorEditIndex !== null && personalDetails[activeEditorEditIndex]) {
      personalDetails[activeEditorEditIndex] = {
        ...personalDetails[activeEditorEditIndex],
        ...recordObj
      };
    } else {
      personalDetails.push(recordObj);
    }

    personalDetails = personalDetails.slice(-50);
    persistVaultSnapshot(STORAGE_KEYS.PERSONAL, personalDetails);

    updateTelemetryCounts();
    renderPersonalGrid(document.getElementById("personal-search-input")?.value || "");
    closeModal("entry-editor-modal");
    appendMessage("ai", `Saved [${finalDiaryName}] to YOUR PERSONAL LIBRARY (LIBRARY 3), Boss.`);
  } else {
    const fileNum = activeEditorEditIndex !== null
      ? (diaryEntries[activeEditorEditIndex]?.fileNumber || activeEditorEditIndex + 1)
      : diaryEntries.length + 1;

    const entryObj = {
      box: 1,
      fileNumber: fileNum,
      fileLabel: `File ${fileNum}`,
      diaryName: finalDiaryName,
      text: cleanText,
      image: activeEditorPhoto || "",
      photoName: activeEditorPhotoName || "",
      timestamp: new Date().toLocaleString()
    };

    if (activeEditorEditIndex !== null && diaryEntries[activeEditorEditIndex]) {
      diaryEntries[activeEditorEditIndex] = {
        ...diaryEntries[activeEditorEditIndex],
        ...entryObj
      };
    } else {
      diaryEntries.push(entryObj);
    }

    diaryEntries = diaryEntries.slice(-50);
    persistVaultSnapshot(STORAGE_KEYS.DIARY, diaryEntries);

    updateTelemetryCounts();
    renderDiaryGrid(document.getElementById("diary-search-input")?.value || "");
    closeModal("entry-editor-modal");
    appendMessage("ai", `Saved [${finalDiaryName}] to YOUR DIARY LIBRARY (LIBRARY 1), Boss.`);
  }
}

function setupSharedEntryEditor() {
  const nameInp = document.getElementById("editor-diary-name-input");
  const areaInp = document.getElementById("editor-numbered-textarea");
  const saveBtn = document.getElementById("editor-save-btn");
  const writeFullBtn = document.getElementById("editor-write-full-btn");
  const selectBtn = document.getElementById("editor-select-btn");
  const uploadPhotoBtn = document.getElementById("editor-upload-photo-btn");
  const editorImgInp = document.getElementById("editor-img-input");
  const previewImg = document.getElementById("editor-photo-preview-img");
  const removePhotoBtn = document.getElementById("editor-remove-photo-btn");

  areaInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const start = areaInp.selectionStart ?? areaInp.value.length;
      const end = areaInp.selectionEnd ?? areaInp.value.length;
      const before = areaInp.value.slice(0, start);
      const after = areaInp.value.slice(end);
      const insertion = "\n\n";
      areaInp.value = before + insertion + after;
      const newPos = start + insertion.length;
      areaInp.setSelectionRange(newPos, newPos);
    }
  });

  saveBtn?.addEventListener("click", () => {
    const typedName = (nameInp?.value || "").trim();
    if (typedName) {
      persistEditorEntry(typedName);
    } else {
      const popupName = prompt("Enter Diary Name, Boss:");
      if (!popupName || !popupName.trim()) return;
      const cleanName = popupName.trim();
      if (nameInp) nameInp.value = cleanName;
      persistEditorEntry(cleanName);
    }
  });

  writeFullBtn?.addEventListener("click", () => {
    if (!areaInp) return;
    areaInp.focus();
    const len = areaInp.value.length;
    areaInp.setSelectionRange(len, len);
  });

  selectBtn?.addEventListener("click", () => {
    if (!areaInp) return;
    areaInp.focus();
    areaInp.select();
  });

  uploadPhotoBtn?.addEventListener("click", () => {
    editorImgInp?.click();
  });

  editorImgInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      activeEditorPhoto = reader.result;
      activeEditorPhotoName = file.name;
      syncEditorPhotoPreviewUI();
    };
    reader.readAsDataURL(file);
    editorImgInp.value = "";
  });

  previewImg?.addEventListener("click", () => {
    if (!activeEditorPhoto) return;
    openLightbox(
      activeEditorPhotoName || (nameInp?.value || "").trim() || "Attached Diary Photo",
      activeEditorPhoto,
      "image"
    );
  });

  removePhotoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    activeEditorPhoto = "";
    activeEditorPhotoName = "";
    syncEditorPhotoPreviewUI();
  });
}

// ==================== 7. LIBRARY 1 (DIARY), LIBRARY 2 (ALBUM) & LIBRARY 3 (PERSONAL) ====================
function setupDiaryBox1() {
  const imgInp = document.getElementById("diary-img-input");
  const searchInp = document.getElementById("diary-search-input");
  const searchBtn = document.getElementById("diary-search-btn");

  imgInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      openEntryEditor("diary", null, reader.result, file.name);
    };
    reader.readAsDataURL(file);
    imgInp.value = "";
  });

  searchInp?.addEventListener("input", (e) => renderDiaryGrid(e.target.value));
  searchBtn?.addEventListener("click", () => renderDiaryGrid(searchInp?.value || ""));
}

function renderDiaryGrid(filter = "") {
  const grid = document.getElementById("diary-entries-list");
  if (!grid) return;
  const q = filter.trim().toLowerCase();

  const createCardHtml = `
    <div class="create-new-grid-card" onclick="openEntryEditor('diary', null)">
      <div class="create-plus-sign">+</div>
      <div class="create-card-label">CREATE NEW<br/>DIARY</div>
    </div>
  `;

  const indexed = diaryEntries.map((item, idx) => ({ item, idx }));
  const filtered = q
    ? indexed.filter(({ item }) =>
        (item.diaryName && item.diaryName.toLowerCase().includes(q)) ||
        (item.text && item.text.toLowerCase().includes(q)) ||
        (item.fileLabel && item.fileLabel.toLowerCase().includes(q))
      )
    : indexed;

  const cardsHtml = filtered.slice().reverse().map(({ item, idx }) => `
    <div class="library-item-grid-card" onclick="openEntryEditor('diary', ${idx})">
      <div class="library-card-title">${item.diaryName || item.fileLabel || "Diary"}</div>
      ${item.image ? `<img src="${item.image}" alt="${item.diaryName || "Diary"}" class="library-card-thumb" />` : ""}
      <div class="library-card-snippet">${item.text || (item.image ? `Photo: ${item.photoName || "Image"}` : "Empty diary")}</div>
      <div class="library-card-meta">${item.fileLabel || `File ${idx + 1}`} • ${item.timestamp || ""}</div>
    </div>
  `).join("");

  grid.innerHTML = createCardHtml + cardsHtml;
}

function answerFromBox1Diary(query) {
  if (!diaryEntries.length) {
    return "YOUR DIARY LIBRARY (LIBRARY 1) currently has no saved diary entries, Boss.";
  }

  const mBracket = query.match(/\[([^\]]+)\]/);
  const bracketTarget = mBracket ? mBracket[1].trim().toLowerCase() : "";
  const lower = query.toLowerCase();

  let matched = [];
  if (bracketTarget) {
    matched = diaryEntries.filter(d =>
      (d.diaryName && d.diaryName.toLowerCase().includes(bracketTarget)) ||
      (d.fileLabel && d.fileLabel.toLowerCase() === bracketTarget) ||
      (d.text && d.text.toLowerCase().includes(bracketTarget))
    );
  } else {
    const fileMatch = lower.match(/file\s*(\d+)/);
    if (fileMatch) {
      const targetNum = parseInt(fileMatch[1], 10);
      matched = diaryEntries.filter(d => d.fileNumber === targetNum);
    } else {
      matched = diaryEntries.filter(d =>
        (d.diaryName && lower.includes(d.diaryName.toLowerCase())) ||
        (d.text && d.text.toLowerCase().includes(lower.replace("your diary library", "").trim()))
      );
    }
  }

  if (!matched.length) matched = diaryEntries;

  return matched
    .map((d, idx) =>
      `<strong>File ${idx + 1} [${d.diaryName || "Diary"} — ${d.fileLabel} • ${d.timestamp}]:</strong><br/>` +
      `${(d.text || "").replace(/\n/g, "<br/>") || (d.image ? `Uploaded Photo: ${d.photoName || "Image"}` : "Empty entry")}`
    )
    .join("<br/><br/>");
}

// ==================== LIBRARY 2 (YOUR ALBUM LIBRARY) ====================
function createNewAlbumPrompt(initialFiles = []) {
  const albumName = prompt("Enter New Album Name, Boss:");
  if (!albumName || !albumName.trim()) return;
  const cleanName = albumName.trim();

  const newAlbum = {
    box: 2,
    albumName: cleanName,
    name: cleanName,
    items: [],
    timestamp: new Date().toLocaleString()
  };

  mediaItems.push(newAlbum);
  mediaItems = mediaItems.slice(-30);
  const albumIdx = mediaItems.length - 1;

  persistVaultSnapshot(STORAGE_KEYS.MEDIA, mediaItems);

  updateTelemetryCounts();
  renderAlbumGrid(document.getElementById("album-search-input")?.value || "");
  appendMessage("ai", `Created album [${cleanName}] in YOUR ALBUM LIBRARY (LIBRARY 2), Boss.`);

  if (initialFiles && initialFiles.length > 0) {
    addFilesToAlbum(albumIdx, initialFiles);
  } else {
    openAlbumDetail(albumIdx);
  }
}

function addFilesToAlbum(albumIdx, files) {
  const album = mediaItems[albumIdx];
  if (!album) return;
  if (!Array.isArray(album.items)) album.items = [];

  Array.from(files).forEach(file => {
    const isVideo = file.type.startsWith("video/");
    const reader = new FileReader();
    reader.onload = () => {
      album.items.push({
        name: file.name,
        type: isVideo ? "video" : "image",
        src: reader.result,
        timestamp: new Date().toLocaleString()
      });
      persistVaultSnapshot(STORAGE_KEYS.MEDIA, mediaItems);
      updateTelemetryCounts();
      renderAlbumGrid(document.getElementById("album-search-input")?.value || "");
      if (activeAlbumIndex === albumIdx) {
        renderAlbumDetailGrid();
      }
    };
    reader.readAsDataURL(file);
  });
}

function openAlbumDetail(albumIdx) {
  const album = mediaItems[albumIdx];
  if (!album) return;
  activeAlbumIndex = albumIdx;
  const titleEl = document.getElementById("albumDetailTitle");
  if (titleEl) titleEl.textContent = `ALBUM // ${album.albumName || album.name || "Album"}`;
  renderAlbumDetailGrid();
  openModal("album-detail-modal");
}

function renderAlbumDetailGrid() {
  const grid = document.getElementById("album-detail-grid");
  if (!grid) return;
  const album = mediaItems[activeAlbumIndex];
  if (!album) return;

  const items = Array.isArray(album.items) ? album.items : [];
  if (!items.length) {
    grid.innerHTML = `<div class="history-item" style="grid-column:1/-1;">No photos or videos in this album yet, Boss. Click "+ UPLOAD PHOTOS / VIDEOS".</div>`;
    return;
  }

  grid.innerHTML = items.map((mItem, idx) => `
    <div class="library-item-grid-card" onclick="openLightbox('${mItem.name}', '${mItem.src}', '${mItem.type}')">
      ${mItem.type === "video"
        ? `<video src="${mItem.src}" muted preload="metadata" class="library-card-thumb"></video>`
        : `<img src="${mItem.src}" alt="${mItem.name}" class="library-card-thumb" />`
      }
      <div class="library-card-title">${mItem.name || `Media ${idx + 1}`}</div>
      <div class="library-card-meta">${mItem.type.toUpperCase()} • ${mItem.timestamp || ""}</div>
    </div>
  `).join("");
}

function setupMediaBox2() {
  const mediaInp = document.getElementById("media-files-input");
  const albumItemInp = document.getElementById("album-item-files-input");
  const addMediaBtn = document.getElementById("album-add-media-btn");
  const searchInp = document.getElementById("album-search-input");
  const searchBtn = document.getElementById("album-search-btn");

  mediaInp?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!mediaItems.length) {
      createNewAlbumPrompt(files);
    } else {
      const targetIdx = activeAlbumIndex !== null && mediaItems[activeAlbumIndex]
        ? activeAlbumIndex
        : mediaItems.length - 1;
      addFilesToAlbum(targetIdx, files);
    }
    mediaInp.value = "";
  });

  addMediaBtn?.addEventListener("click", () => {
    albumItemInp?.click();
  });

  albumItemInp?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || activeAlbumIndex === null) return;
    addFilesToAlbum(activeAlbumIndex, files);
    albumItemInp.value = "";
  });

  searchInp?.addEventListener("input", (e) => renderAlbumGrid(e.target.value));
  searchBtn?.addEventListener("click", () => renderAlbumGrid(searchInp?.value || ""));
}

function renderAlbumGrid(filter = "") {
  const grid = document.getElementById("media-gallery-grid");
  if (!grid) return;
  const q = filter.trim().toLowerCase();

  const createCardHtml = `
    <div class="create-new-grid-card" onclick="createNewAlbumPrompt()">
      <div class="create-plus-sign">+</div>
      <div class="create-card-label">CREATE NEW<br/>ALBUM</div>
    </div>
  `;

  const indexed = mediaItems.map((album, idx) => ({ album, idx }));
  const filtered = q
    ? indexed.filter(({ album }) =>
        ((album.albumName || album.name || "").toLowerCase().includes(q))
      )
    : indexed;

  const cardsHtml = filtered.slice().reverse().map(({ album, idx }) => {
    const title = album.albumName || album.name || `Album ${idx + 1}`;
    const count = Array.isArray(album.items) ? album.items.length : 0;
    const firstMedia = Array.isArray(album.items) && album.items.length > 0 ? album.items[0] : null;
    return `
      <div class="library-item-grid-card" onclick="openAlbumDetail(${idx})">
        <div class="library-card-title">${title}</div>
        ${firstMedia && firstMedia.type === "image"
          ? `<img src="${firstMedia.src}" alt="${title}" class="library-card-thumb" />`
          : `<div class="library-card-snippet">${count} photo(s)/video(s)</div>`
        }
        <div class="library-card-meta">${count} items • ${album.timestamp || ""}</div>
      </div>
    `;
  }).join("");

  grid.innerHTML = createCardHtml + cardsHtml;
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
  if (!mediaItems.length) {
    return "YOUR ALBUM LIBRARY (LIBRARY 2) has no albums stored yet, Boss.";
  }

  const mBracket = query.match(/\[([^\]]+)\]/);
  const bracketTarget = mBracket ? mBracket[1].trim().toLowerCase() : "";
  const lower = query.toLowerCase();

  const matched = bracketTarget
    ? mediaItems.filter(a => ((a.albumName || a.name || "").toLowerCase().includes(bracketTarget)))
    : mediaItems.filter(a => ((a.albumName || a.name || "").toLowerCase().includes(lower)));

  const listToShow = matched.length ? matched : mediaItems;
  return listToShow
    .map((a, i) => {
      const count = Array.isArray(a.items) ? a.items.length : 0;
      return `<strong>Album ${i + 1} [${a.albumName || a.name || "Album"}]:</strong> ${count} item(s) (${a.timestamp || ""})`;
    })
    .join("<br/>");
}

// ==================== LIBRARY 3 (YOUR PERSONAL LIBRARY + 503020 + 60s LOCKOUT) ====================
function runSentinelTypewriterAndVoice(linesText, isAlert = true) {
  const boxEl = document.getElementById("sentinelTypewriterText");
  const stageEl = document.getElementById("sentinelOwlStage");
  if (stageEl) {
    stageEl.classList.toggle("alert-mode", isAlert);
  }
  if (boxEl) {
    if (typewriterTimerId) clearInterval(typewriterTimerId);
    boxEl.textContent = "";
    let idx = 0;
    typewriterTimerId = setInterval(() => {
      boxEl.textContent += linesText.charAt(idx);
      idx++;
      if (idx >= linesText.length) {
        clearInterval(typewriterTimerId);
        typewriterTimerId = null;
      }
    }, 18);
  }
  speakText(linesText);
}

function setKeypadDisabled(disabled) {
  document.querySelectorAll("#flameKeypadGrid .flame-key-btn").forEach(btn => {
    btn.disabled = disabled;
  });
}

function startLockoutCountdown() {
  const alertEl = document.getElementById("personal-danger-alert");
  setKeypadDisabled(true);

  if (lockoutIntervalId) clearInterval(lockoutIntervalId);
  const tick = () => {
    const remainingSec = Math.ceil((lockoutUntilMs - Date.now()) / 1000);
    if (remainingSec > 0) {
      if (alertEl) {
        alertEl.textContent = `LOCKDOWN ACTIVE: 1-MINUTE LOCKOUT — RETRY IN ${remainingSec}s`;
      }
    } else {
      clearInterval(lockoutIntervalId);
      lockoutIntervalId = null;
      failedAttemptsCount = 0;
      lockoutUntilMs = 0;
      setKeypadDisabled(false);
      if (alertEl) alertEl.textContent = "";
      runSentinelTypewriterAndVoice(WRONG_PASS_QUOTES[0], true);
    }
  };

  tick();
  lockoutIntervalId = setInterval(tick, 1000);
}

function setupPersonalBox3() {
  const displayEl = document.getElementById("keypadDisplay");
  const alertEl = document.getElementById("personal-danger-alert");
  const imgInp = document.getElementById("personal-img-input");
  const searchInp = document.getElementById("personal-search-input");
  const searchBtn = document.getElementById("personal-search-btn");

  function syncKeypadDisplay() {
    if (!displayEl) return;
    const slots = [0, 1, 2, 3, 4, 5].map(i => (keypadBuffer[i] ? keypadBuffer[i] : "•"));
    displayEl.textContent = slots.join(" ");
  }

  document.querySelectorAll("#flameKeypadGrid .flame-key-btn[data-digit]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (Date.now() < lockoutUntilMs) return;
      if (keypadBuffer.length < 6) {
        keypadBuffer += btn.getAttribute("data-digit");
        syncKeypadDisplay();
        if (alertEl) alertEl.textContent = "";
      }
    });
  });

  document.getElementById("keypadClearBtn")?.addEventListener("click", () => {
    if (Date.now() < lockoutUntilMs) return;
    keypadBuffer = "";
    syncKeypadDisplay();
    if (alertEl) alertEl.textContent = "";
  });

  document.getElementById("keypadEnterBtn")?.addEventListener("click", () => {
    if (Date.now() < lockoutUntilMs) return;

    if (keypadBuffer === PERSONAL_PASSCODE) {
      personalUnlocked = true;
      failedAttemptsCount = 0;
      keypadBuffer = "";
      syncKeypadDisplay();
      if (alertEl) alertEl.textContent = "";
      refreshPersonalModalState();
      updateTelemetryCounts();
      runSentinelTypewriterAndVoice(WELCOME_BOSS_QUOTE, false);
      appendMessage("ai", WELCOME_BOSS_QUOTE);
    } else {
      failedAttemptsCount += 1;
      keypadBuffer = "";
      syncKeypadDisplay();

      const quoteIdx = Math.min(failedAttemptsCount - 1, WRONG_PASS_QUOTES.length - 1);
      const selectedQuote = WRONG_PASS_QUOTES[quoteIdx];
      runSentinelTypewriterAndVoice(selectedQuote, true);

      if (failedAttemptsCount >= 3) {
        lockoutUntilMs = Date.now() + LOCKOUT_DURATION_SEC * 1000;
        startLockoutCountdown();
      } else if (alertEl) {
        alertEl.textContent = `INVALID CODE (${failedAttemptsCount}/3 ATTEMPTS BEFORE 1-MINUTE LOCKOUT)`;
      }
    }
  });

  imgInp?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!personalUnlocked) {
      appendMessage("ai", "Library 3 is locked, Boss. Enter code 503020 first.");
      imgInp.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      openEntryEditor("personal", null, reader.result, file.name);
    };
    reader.readAsDataURL(file);
    imgInp.value = "";
  });

  searchInp?.addEventListener("input", (e) => renderPersonalGrid(e.target.value));
  searchBtn?.addEventListener("click", () => renderPersonalGrid(searchInp?.value || ""));
}

function answerFromBox3Personal(query) {
  if (!personalDetails.length) {
    return "YOUR PERSONAL LIBRARY (LIBRARY 3) currently has no personal records stored, Boss.";
  }
  const mBracket = query.match(/\[([^\]]+)\]/);
  const bracketTarget = mBracket ? mBracket[1].trim().toLowerCase() : "";
  const matched = bracketTarget
    ? personalDetails.filter(p =>
        ((p.diaryName || p.recordName || "").toLowerCase().includes(bracketTarget)) ||
        (p.text && p.text.toLowerCase().includes(bracketTarget))
      )
    : personalDetails;

  const listToShow = matched.length ? matched : personalDetails;
  return `<strong>[LIBRARY 3 PERSONAL VAULT — VERIFIED]</strong><br/>` +
    listToShow
      .map((p, i) => `File ${i + 1} [${p.diaryName || p.recordName || "Record"} • ${p.timestamp}]: ${(p.text || "").replace(/\n/g, "<br/>") || (p.image ? `Photo (${p.photoName || "Image"})` : "")}`)
      .join("<br/>");
}

function refreshPersonalModalState() {
  const lockScreen = document.getElementById("personal-lock-screen");
  const unlockedContent = document.getElementById("personal-unlocked-content");
  if (!lockScreen || !unlockedContent) return;
  if (personalUnlocked) {
    lockScreen.style.display = "none";
    unlockedContent.style.display = "flex";
    renderPersonalGrid(document.getElementById("personal-search-input")?.value || "");
  } else {
    lockScreen.style.display = "block";
    unlockedContent.style.display = "none";
    if (Date.now() < lockoutUntilMs) {
      startLockoutCountdown();
    } else {
      setKeypadDisabled(false);
      runSentinelTypewriterAndVoice(WRONG_PASS_QUOTES[0], false);
    }
  }
}

function renderPersonalGrid(filter = "") {
  const grid = document.getElementById("personal-entries-list");
  if (!grid) return;
  const q = filter.trim().toLowerCase();

  const createCardHtml = `
    <div class="create-new-grid-card" onclick="openEntryEditor('personal', null)">
      <div class="create-plus-sign">+</div>
      <div class="create-card-label">CREATE NEW<br/>PERSONAL DIARY</div>
    </div>
  `;

  const indexed = personalDetails.map((p, idx) => ({ p, idx }));
  const filtered = q
    ? indexed.filter(({ p }) =>
        ((p.diaryName || p.recordName || "").toLowerCase().includes(q)) ||
        (p.text && p.text.toLowerCase().includes(q))
      )
    : indexed;

  const cardsHtml = filtered.slice().reverse().map(({ p, idx }) => `
    <div class="library-item-grid-card" onclick="openEntryEditor('personal', ${idx})">
      <div class="library-card-title">${p.diaryName || p.recordName || `Personal ${idx + 1}`}</div>
      ${p.image ? `<img src="${p.image}" alt="Personal detail" class="library-card-thumb" />` : ""}
      <div class="library-card-snippet">${p.text || (p.image ? `Photo: ${p.photoName || "Image"}` : "Empty entry")}</div>
      <div class="library-card-meta">${p.timestamp || ""}</div>
    </div>
  `).join("");

  grid.innerHTML = createCardHtml + cardsHtml;
}

// ==================== 8. 3D WORKPLACE & GAMES MODALS ====================
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

// ==================== 9. MULTI-MODEL GEMINI CHAIN + RETRY + GOOGLE WEB FALLBACK (PROBLEM 1 & 3) ====================
function getMonetizationPlanResponse() {
  return (
    `<strong>[STARK PRO / MONETIZATION ARCHITECTURE — BOSS]</strong><br/>` +
    `1. <strong>Freemium Core:</strong> Free HUD, Diary Library, Album Library &amp; Local/IndexedDB Vault.<br/>` +
    `2. <strong>Pro Pass:</strong> Encrypted Cloud Backup, Custom HUD Skins (Mark XLII / Red Pulse / Gold), and One-Click PDF/JSON Export.<br/>` +
    `3. <strong>Creator &amp; Team Packs:</strong> Ready-made Moot/Law/Study Templates &amp; Shared Vault Spaces.`
  );
}

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
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
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
      if (attempt === maxAttempts) throw err;
    }
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

  // Monetization / Pro roadmap shortcut
  if (lower.includes("monetization") || lower.includes("pro plan") || lower.includes("income model")) {
    appendMessage("ai", getMonetizationPlanResponse());
    return;
  }

  // Library 1: YOUR DIARY LIBRARY queries
  if (lower.includes("your diary library") || lower.includes("library 1") || lower.includes("box 1") || (lower.includes("diary") && lower.includes("file"))) {
    appendMessage("ai", answerFromBox1Diary(text));
    return;
  }

  // Library 2: YOUR ALBUM LIBRARY queries
  if (lower.includes("your album library") || lower.includes("library 2") || lower.includes("box 2") || lower.includes("album")) {
    appendMessage("ai", answerFromBox2Media(text));
    return;
  }

  // Library 3: YOUR PERSONAL LIBRARY queries (requires 503020 first)
  if (lower.includes("your personal library") || lower.includes("library 3") || lower.includes("box 3") || lower.includes("personal detail") || lower.includes("vault")) {
    if (!personalUnlocked) {
      const codeAttempt = prompt("Library 3 is locked. Enter security code to access personal library, Boss:");
      if (codeAttempt !== PERSONAL_PASSCODE) {
        failedAttemptsCount += 1;
        const quoteIdx = Math.min(failedAttemptsCount - 1, WRONG_PASS_QUOTES.length - 1);
        appendMessage("ai", WRONG_PASS_QUOTES[quoteIdx]);
        speakText(WRONG_PASS_QUOTES[quoteIdx]);
        if (failedAttemptsCount >= 3) {
          lockoutUntilMs = Date.now() + LOCKOUT_DURATION_SEC * 1000;
          startLockoutCountdown();
        }
        return;
      }
      personalUnlocked = true;
      failedAttemptsCount = 0;
      updateTelemetryCounts();
      appendMessage("ai", WELCOME_BOSS_QUOTE);
    }
    appendMessage("ai", answerFromBox3Personal(text));
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

// ==================== 10. VOICE RECOGNITION & SELF-SPEECH LOOP GUARD ====================
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
      lastSpokeEndTime = Date.now();
      if (speechIndicator) speechIndicator.textContent = isMicListening ? "LISTENING" : "IDLE";
    };
    utter.onerror = () => {
      isSpeaking = false;
      lastSpokeEndTime = Date.now();
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
    if (voiceStatus) voiceStatus.textContent = "ACTIVE";
    if (speechIndicator) speechIndicator.textContent = "LISTENING";
  };

  recognition.onresult = (event) => {
    const speakingNow = isSpeaking || (window.speechSynthesis && window.speechSynthesis.speaking);
    const inCooldown = (Date.now() - lastSpokeEndTime) < 1400;
    if (speakingNow || inCooldown) {
      return;
    }

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

// ==================== 11. RED SIGNAL WAVE & KEYFRAME FX DIAL ====================
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

// ==================== 12. INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", async () => {
  buildTopRuler();
  updateClockAndDate();
  setInterval(updateClockAndDate, 1000);

  startIndicatorPointsCycle();
  buildSpectrumBars();
  buildArcDock();
  updateTelemetryCounts();
  await hydrateVaultsFromIndexedDB();

  setupModals();
  setupSharedEntryEditor();
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

  if (chatHistory.length > 0) {
    chatHistory.slice(-15).forEach(item => appendMessage(item.sender, item.text, false));
  } else {
    appendMessage("ai", "J.A.R.V.I.S. Mark VII Hacking HUD online, Boss. Ready for commands.", false);
  }
});
