// షార్క్ 12.1–12.5, 13.1–13.5 & 15.1 పరిష్కారాలు: కేంద్రక స్టేట్, సేఫ్ JSON పార్సింగ్ & మాడ్యూల్ సమన్వయం
import {
  initStorage,
  loadAllVaultData,
  saveVaultSection,
  exportBackupToJson,
  getApiKeyFromStorage,
  saveApiKeyToStorage,
  getPersonalLockState,
  savePersonalLockState
} from "./storage-manager.js";
import {
  initAuthGate,
  openPersonalGateModal,
  lockPersonalLibrary,
  isPersonalUnlocked
} from "./auth.js";
import {
  sendCommandToAssistant,
  clearChatSession
} from "./api-client.js";
import {
  initVoiceSystem,
  toggleVoiceRecognition,
  speakHudReply,
  stopAllSpeech
} from "./voice-controller.js";
import {
  initHudRenderer,
  refreshHudCounters,
  openLibraryModal,
  openHistoryModal,
  open3dWorkspaceModal,
  setExpandedElement,
  collapseExpandedElement,
  renderRedPulseWave
} from "./ui-renderer.js";

export const hudState = {
  diaryEntries: [],
  albumItems: [],
  personalItems: [],
  chatHistory: [],
  memoryItems: [],
  activeLibraryType: null,
  editingEntryId: null,
  expandedElement: null,
  rotaryAngleTotal: 0,
  rotaryUnlocked: false,
  apiKey: "",
  isListening: false,
  isSpeaking: false,
  lockoutUntil: 0,
  failedAttempts: 0
};

// షార్క్ 12.5 పరిష్కారం: చెడిపోయిన JSON స్ట్రింగ్ వచ్చినా క్రాష్ కాకుండా సురక్షిత పార్సింగ్
export function safeJsonParse(rawValue, fallbackValue = null) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return fallbackValue;
  }
  try {
    const parsed = JSON.parse(rawValue);
    return parsed ?? fallbackValue;
  } catch (err) {
    console.warn("Safe JSON parse fallback triggered:", err);
    return fallbackValue;
  }
}

// షార్క్ 12.2 పరిష్కారం: స్థానిక టైమ్‌స్ట్రింగ్‌తో పాటు పోల్చదగిన న్యూమరిక్ టైమ్‌స్టాంప్ జత చేయడం
export function createTimestampMeta(dateObj = new Date()) {
  return {
    createdAtText: dateObj.toLocaleString("te-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }),
    timestamp: dateObj.getTime()
  };
}

export function appendChatBubble(sender, htmlOrText, isHtml = false) {
  const chatEl = document.getElementById("chat");
  if (!chatEl) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${sender === "user" ? "chat-msg-user" : "chat-msg-ai"}`;
  if (isHtml) {
    bubble.innerHTML = htmlOrText;
  } else {
    bubble.textContent = String(htmlOrText ?? "");
  }
  chatEl.appendChild(bubble);
  chatEl.scrollTop = chatEl.scrollHeight;
}

export function closeAllModals() {
  document.querySelectorAll(".hud-modal-backdrop.open").forEach((modal) => {
    modal.classList.remove("open");
  });
}

async function bootstrapHudSystem() {
  await initStorage();
  const loaded = await loadAllVaultData();
  hudState.diaryEntries = loaded.diaryEntries;
  hudState.albumItems = loaded.albumItems;
  hudState.personalItems = loaded.personalItems;
  hudState.chatHistory = loaded.chatHistory;
  hudState.memoryItems = loaded.memoryItems;
  hudState.apiKey = getApiKeyFromStorage();

  const lockInfo = getPersonalLockState();
  hudState.failedAttempts = lockInfo.failedAttempts;
  hudState.lockoutUntil = lockInfo.lockoutUntil;

  initHudRenderer();
  initAuthGate();
  initVoiceSystem();
  refreshHudCounters();

  // సేవ్ చేసిన చాట్ హిస్టరీ ఉంటే చూపించడం
  hudState.chatHistory.slice(-20).forEach((item) => {
    appendChatBubble(item.role === "user" ? "user" : "ai", item.text, false);
  });

  // ప్రధాన నియంత్రణలు బైండ్ చేయడం (షార్క్ 14.1–14.4)
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send-btn");
  const micBtn = document.getElementById("mic-btn");
  const clearBtn = document.getElementById("clear-btn");
  const exitBtn = document.getElementById("dockExitBtn");
  const youtubeBtn = document.getElementById("dockYoutubeBtn");
  const threeDBtn = document.getElementById("dock3dBtn");
  const gamesBtn = document.getElementById("dockGamesBtn");

  const runSendAction = async () => {
    const query = (msgInput?.value || "").trim();
    if (!query) return;
    msgInput.value = "";
    appendChatBubble("user", query, false);
    await sendCommandToAssistant(query);
  };

  sendBtn?.addEventListener("click", runSendAction);
  msgInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runSendAction();
    }
  });

  micBtn?.addEventListener("click", () => {
    toggleVoiceRecognition();
  });

  clearBtn?.addEventListener("click", async () => {
    stopAllSpeech();
    await clearChatSession();
    const chatEl = document.getElementById("chat");
    if (chatEl) chatEl.innerHTML = "";
    refreshHudCounters();
    appendChatBubble("ai", "చాట్ హిస్టరీ శుభ్రం చేయబడింది. ముఖ్యమైన అంశాలు మెమరీలో భద్రంగా ఉన్నాయి.", false);
  });

  exitBtn?.addEventListener("click", () => {
    stopAllSpeech();
    if (hudState.expandedElement) {
      collapseExpandedElement();
      return;
    }
    closeAllModals();
    appendChatBubble("ai", "హెచ్‌యూడీ ఎగ్జిట్ / స్టాండ్‌బై మోడ్ సక్రియం చేయబడింది.", false);
  });

  youtubeBtn?.addEventListener("click", () => {
    window.open("https://www.youtube.com", "_blank", "noopener,noreferrer");
  });

  threeDBtn?.addEventListener("click", () => {
    open3dWorkspaceModal();
  });

  gamesBtn?.addEventListener("click", () => {
    openHistoryModal();
  });

  // 3 లైబ్రరీ కార్డుల ఈవెంట్లు
  document.getElementById("box1-diary")?.addEventListener("click", () => {
    openLibraryModal("diary");
  });
  document.getElementById("box2-album")?.addEventListener("click", () => {
    openLibraryModal("album");
  });
  document.getElementById("box3-personal")?.addEventListener("click", () => {
    if (isPersonalUnlocked()) {
      openLibraryModal("personal");
    } else {
      openPersonalGateModal();
    }
  });

  // యుటిలిటీ బటన్లు (బ్యాకప్, ఏపీఐ కీ, లాక్ వాల్ట్)
  document.getElementById("exportBackupBtn")?.addEventListener("click", () => {
    exportBackupToJson();
    appendChatBubble("ai", "మీ లైబ్రరీలు మరియు మెమరీ బ్యాకప్ JSON ఫైల్ డౌన్‌లోడ్ చేయబడింది.", false);
  });

  document.getElementById("setApiKeyBtn")?.addEventListener("click", () => {
    const entered = window.prompt("మీ Gemini API Key నమోదు చేయండి (ఖాళీగా వదిలితే Web Fallback పనిచేస్తుంది):", hudState.apiKey || "");
    if (entered !== null) {
      const cleaned = entered.trim();
      hudState.apiKey = cleaned;
      saveApiKeyToStorage(cleaned);
      refreshHudCounters();
      appendChatBubble("ai", cleaned ? "ఏపీఐ కీ సేవ్ చేయబడింది." : "ఏపీఐ కీ తొలగించబడింది; వెబ్ ఫాల్‌బ్యాక్ సిద్ధంగా ఉంది.", false);
    }
  });

  document.getElementById("lockPersonalBtn")?.addEventListener("click", () => {
    lockPersonalLibrary();
    refreshHudCounters();
    appendChatBubble("ai", "03 // వ్యక్తిగత లైబ్రరీ తిరిగి లాక్ చేయబడింది.", false);
  });

  // ఎస్కేప్ కీ ద్వారా మోడల్ లేదా విస్తరించిన ప్యానెల్ మూయడం (షార్క్ 7.2 & 13.3)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      stopAllSpeech();
      const openModal = document.querySelector(".hud-modal-backdrop.open");
      if (openModal) {
        openModal.classList.remove("open");
      } else if (hudState.expandedElement) {
        collapseExpandedElement();
      }
    }
  });

  // బ్యాక్‌డ్రాప్ క్లిక్ ద్వారా మోడల్ మూయడం (షార్క్ 14.4)
  document.querySelectorAll(".hud-modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
      }
    });
  });

  renderRedPulseWave();
  await saveVaultSection("chatHistory", hudState.chatHistory);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapHudSystem);
} else {
  bootstrapHudSystem();
}
