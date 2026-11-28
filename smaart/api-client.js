// షార్క్ 3.1–3.5, 7.2, 8.1–8.5 & 11.1–11.5 పరిష్కారాలు: Gemini API చైన్, లోకల్ కమాండ్లు & వెబ్ ఫాల్‌బ్యాక్
import { hudState, appendChatBubble, createTimestampMeta } from "./state-manager.js";
import { saveVaultSection } from "./storage-manager.js";
import { openLibraryModal, refreshHudCounters } from "./ui-renderer.js";
import { openPersonalGateModal, isPersonalUnlocked } from "./auth.js";
import { speakHudReply } from "./voice-controller.js";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

const REQUEST_TIMEOUT_MS = 12000;

// షార్క్ 3.2 పరిష్కారం: బాహ్య/డైనమిక్ టెక్స్ట్‌ను HTML లో చేర్చే ముందు ఎస్కేప్ చేయడం
export function escapeHtml(unsafeStr) {
  return String(unsafeStr ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setHudStatus(text, isBusy = false) {
  const statusEl = document.getElementById("statusText");
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = isBusy ? "status-busy" : "status-online";
}

function handleLocalVaultCommand(lowerQuery) {
  if (lowerQuery.includes("డైరీ") || lowerQuery.includes("diary")) {
    openLibraryModal("diary");
    return "01 // డైరీ లైబ్రరీ తెరవబడింది, బాస్.";
  }
  if (lowerQuery.includes("ఆల్బమ్") || lowerQuery.includes("album") || lowerQuery.includes("ఫోటో")) {
    openLibraryModal("album");
    return "02 // ఆల్బమ్ లైబ్రరీ తెరవబడింది, బాస్.";
  }
  if (lowerQuery.includes("వ్యక్తిగత") || lowerQuery.includes("personal") || lowerQuery.includes("వాల్ట్")) {
    if (isPersonalUnlocked()) {
      openLibraryModal("personal");
      return "03 // వ్యక్తిగత లైబ్రరీ తెరవబడింది, బాస్.";
    }
    openPersonalGateModal();
    return "03 // వ్యక్తిగత లైబ్రరీ లాక్ గేట్ తెరవబడింది. దయచేసి పాస్‌కోడ్ ఇవ్వండి.";
  }
  return null;
}

function buildCompactMemoryContext(query) {
  if (!Array.isArray(hudState.memoryItems) || hudState.memoryItems.length === 0) {
    return "";
  }
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const matched = hudState.memoryItems.filter((item) => {
    const hay = String(item.summary || "").toLowerCase();
    return words.some((w) => hay.includes(w));
  });

  const selected = (matched.length > 0 ? matched : hudState.memoryItems).slice(-3);
  return selected.map((m) => `- ${m.summary}`).join("\n");
}

async function callSingleGeminiModel(modelName, promptText, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const memoryBlock = buildCompactMemoryContext(promptText);
    const systemInstruction =
      "You are J.A.R.V.I.S., a sharp, helpful personal HUD assistant. Reply clearly, concisely, and in Telugu unless asked otherwise." +
      (memoryBlock ? `\nRelevant saved context:\n${memoryBlock}` : "");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text || "")
        .join("")
        .trim() || "";

    if (!candidateText) {
      throw new Error("Empty model response");
    }
    return candidateText;
  } finally {
    clearTimeout(timeoutId);
  }
}

// షార్క్ 3.1, 3.3 & 3.5 పరిష్కారం: మల్టీ-మోడల్ చైన్ విఫలమైతే సురక్షిత వెబ్ సెర్చ్ ఫాల్‌బ్యాక్ ఇవ్వడం
async function runWebSearchFallback(query) {
  const safeQuery = escapeHtml(query);
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    if (res.ok) {
      const info = await res.json();
      if (info && typeof info.AbstractText === "string" && info.AbstractText.trim()) {
        const safeAbstract = escapeHtml(info.AbstractText.trim());
        const safeHref = escapeHtml(info.AbstractURL || searchUrl);
        return `<div><strong>[WEB FALLBACK]</strong> "${safeQuery}" పై లభించిన సమాచారం:</div><div>${safeAbstract}</div><a class="web-fallback-link" href="${safeHref}" target="_blank" rel="noopener noreferrer">మరిన్ని ఫలితాలు చూడండి ↗</a>`;
      }
    }
  } catch {
    // నెట్‌వర్క్/CORS పరిమితి వస్తే నేరుగా గూగుల్ సెర్చ్ లింక్ ఇస్తాం
  }

  const safeSearchHref = escapeHtml(searchUrl);
  return `<div><strong>[WEB FALLBACK]</strong> ఏఐ మోడల్ అందుబాటులో లేదు. "${safeQuery}" కోసం వెబ్ ఫలితాలు చూడండి:</div><a class="web-fallback-link" href="${safeSearchHref}" target="_blank" rel="noopener noreferrer">Google లో శోధించండి ↗</a>`;
}

export async function sendCommandToAssistant(userQuery) {
  const trimmed = String(userQuery || "").trim();
  if (!trimmed) return;

  const meta = createTimestampMeta();
  hudState.chatHistory.push({
    role: "user",
    text: trimmed,
    ...meta
  });
  if (hudState.chatHistory.length > 80) {
    hudState.chatHistory = hudState.chatHistory.slice(-80);
  }
  await saveVaultSection("chatHistory", hudState.chatHistory);

  const localReply = handleLocalVaultCommand(trimmed.toLowerCase());
  if (localReply) {
    appendChatBubble("ai", localReply, false);
    hudState.chatHistory.push({
      role: "assistant",
      text: localReply,
      ...createTimestampMeta()
    });
    await saveVaultSection("chatHistory", hudState.chatHistory);
    refreshHudCounters();
    speakHudReply(localReply);
    return;
  }

  setHudStatus("SCANNING", true);

  let aiAnswerText = "";
  if (hudState.apiKey) {
    for (const modelName of GEMINI_MODELS) {
      try {
        aiAnswerText = await callSingleGeminiModel(modelName, trimmed, hudState.apiKey);
        break;
      } catch (err) {
        console.warn(`Model ${modelName} failed:`, err);
      }
    }
  }

  setHudStatus("ONLINE", false);

  if (aiAnswerText) {
    appendChatBubble("ai", aiAnswerText, false);
    hudState.chatHistory.push({
      role: "assistant",
      text: aiAnswerText,
      ...createTimestampMeta()
    });
    await saveVaultSection("chatHistory", hudState.chatHistory);
    refreshHudCounters();
    speakHudReply(aiAnswerText);
    return;
  }

  const fallbackHtml = await runWebSearchFallback(trimmed);
  appendChatBubble("ai", fallbackHtml, true);
  const plainFallbackRecord = `[WEB FALLBACK] ${trimmed}`;
  hudState.chatHistory.push({
    role: "assistant",
    text: plainFallbackRecord,
    ...createTimestampMeta()
  });
  await saveVaultSection("chatHistory", hudState.chatHistory);
  refreshHudCounters();
}

// షార్క్ 2.5 & 8.5 పరిష్కారం: చాట్ క్లియర్ చేసేటప్పుడు చివరి ముఖ్యమైన అంశాలను మెమరీలో దాచడం
export async function clearChatSession() {
  if (Array.isArray(hudState.chatHistory) && hudState.chatHistory.length > 0) {
    const recentSlice = hudState.chatHistory.slice(-4);
    const combinedSummary = recentSlice
      .map((m) => `${m.role === "user" ? "Q" : "A"}: ${String(m.text || "").slice(0, 120)}`)
      .join(" | ");

    hudState.memoryItems.push({
      id: `mem_${Date.now()}`,
      summary: combinedSummary,
      ...createTimestampMeta()
    });
    if (hudState.memoryItems.length > 30) {
      hudState.memoryItems = hudState.memoryItems.slice(-30);
    }
    await saveVaultSection("memoryItems", hudState.memoryItems);
  }

  hudState.chatHistory = [];
  await saveVaultSection("chatHistory", []);
}
