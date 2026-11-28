// షార్క్ 5.2, 5.3, 11.4 & 27.5 పరిష్కారాలు: వాయిస్ రికగ్నిషన్, లూప్ గార్డ్ & టెక్స్ట్-టు-స్పీచ్
import { hudState, appendChatBubble } from "./state-manager.js";
import { sendCommandToAssistant } from "./api-client.js";

const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recognitionInstance = null;
let manualStopRequested = false;
let restartTimerId = null;
let lastSpokenEndedAt = 0;

function updateVoiceUiState(listening, speaking = false) {
  hudState.isListening = listening;
  hudState.isSpeaking = speaking;

  const micBtn = document.getElementById("mic-btn");
  const indicator = document.getElementById("speechIndicator");
  const voiceStatus = document.getElementById("voiceStatus");
  const waveMode = document.getElementById("waveModeLabel");

  if (micBtn) {
    micBtn.classList.toggle("listening", listening);
    micBtn.textContent = listening ? "LISTENING..." : "VOICE";
  }

  if (indicator) {
    if (speaking) {
      indicator.textContent = "SPEAKING";
    } else if (listening) {
      indicator.textContent = "MIC ACTIVE";
    } else {
      indicator.textContent = "VOICE IDLE";
    }
  }

  if (voiceStatus) {
    voiceStatus.textContent = speaking
      ? "VOICE OUTPUT"
      : listening
      ? "AUDIO CAPTURE"
      : "SPECTRUM IDLE";
  }

  if (waveMode) {
    waveMode.textContent = speaking ? "TX_PULSE" : listening ? "RX_SCAN" : "STANDBY";
  }
}

function clearRestartTimer() {
  if (restartTimerId) {
    clearTimeout(restartTimerId);
    restartTimerId = null;
  }
}

export function stopAllSpeech() {
  manualStopRequested = true;
  clearRestartTimer();

  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore synthesis cancel errors
    }
  }

  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // ignore recognition stop errors
    }
  }

  updateVoiceUiState(false, false);
}

// షార్క్ 11.4 పరిష్కారం: వాయిస్‌గా చదివే ముందు HTML ట్యాగ్‌లను తొలగించి స్పష్టమైన టెక్స్ట్‌గా మార్చడం
function stripMarkupForSpeech(rawText) {
  const withoutTags = String(rawText || "").replace(/<[^>]*>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim().slice(0, 420);
}

function pickBestVoice(langCode = "te-IN") {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const exactMatch = voices.find((v) =>
    String(v.lang || "").toLowerCase().startsWith(langCode.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  const teluguMatch = voices.find((v) =>
    String(v.lang || "").toLowerCase().includes("te")
  );
  if (teluguMatch) return teluguMatch;

  return voices.find((v) => String(v.lang || "").toLowerCase().includes("en")) || voices[0];
}

export function speakHudReply(replyText) {
  if (!("speechSynthesis" in window)) return;
  const cleanText = stripMarkupForSpeech(replyText);
  if (!cleanText) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const chosenVoice = pickBestVoice("te-IN");
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || "te-IN";
    } else {
      utterance.lang = "te-IN";
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      updateVoiceUiState(hudState.isListening, true);
    };

    utterance.onend = () => {
      lastSpokenEndedAt = Date.now();
      updateVoiceUiState(hudState.isListening, false);
    };

    utterance.onerror = () => {
      lastSpokenEndedAt = Date.now();
      updateVoiceUiState(hudState.isListening, false);
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis fallback:", err);
  }
}

function createRecognition() {
  if (!SpeechRecognitionCtor) return null;

  const rec = new SpeechRecognitionCtor();
  rec.lang = "te-IN";
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    updateVoiceUiState(true, hudState.isSpeaking);
  };

  rec.onresult = async (event) => {
    // షార్క్ 5.3 పరిష్కారం: అసిస్టెంట్ మాట్లాడిన వెంటనే కూల్‌డౌన్ గార్డ్
    if (hudState.isSpeaking || Date.now() - lastSpokenEndedAt < 650) {
      return;
    }

    const transcript =
      event?.results?.[event.resultIndex]?.[0]?.transcript?.trim() || "";
    if (!transcript) return;

    appendChatBubble("user", transcript, false);
    await sendCommandToAssistant(transcript);
  };

  rec.onerror = (event) => {
    const errType = event?.error || "unknown";
    if (errType === "not-allowed" || errType === "service-not-allowed") {
      manualStopRequested = true;
      clearRestartTimer();
      updateVoiceUiState(false, false);
      appendChatBubble(
        "ai",
        "మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. దయచేసి బ్రౌజర్/డివైస్ సెట్టింగ్స్‌లో మైక్రోఫోన్ అనుమతి ఇవ్వండి.",
        false
      );
      return;
    }

    if (errType === "no-speech" || errType === "aborted") {
      return;
    }

    console.warn("Speech recognition error:", errType);
  };

  rec.onend = () => {
    const shouldRestart = !manualStopRequested && Boolean(hudState.isListening);
    updateVoiceUiState(false, hudState.isSpeaking);

    if (shouldRestart) {
      clearRestartTimer();
      restartTimerId = setTimeout(() => {
        if (!manualStopRequested && recognitionInstance) {
          try {
            recognitionInstance.start();
          } catch {
            // already started
          }
        }
      }, 450);
    }
  };

  return rec;
}

export function toggleVoiceRecognition() {
  if (!SpeechRecognitionCtor) {
    appendChatBubble(
      "ai",
      "ఈ బ్రౌజర్ లేదా WebView లో SpeechRecognition అందుబాటులో లేదు. కమాండ్ బాక్స్‌లో టైప్ చేసి వాడండి.",
      false
    );
    return;
  }

  if (hudState.isListening) {
    manualStopRequested = true;
    clearRestartTimer();
    try {
      recognitionInstance?.stop();
    } catch {
      // ignore
    }
    updateVoiceUiState(false, hudState.isSpeaking);
    return;
  }

  manualStopRequested = false;
  clearRestartTimer();
  if (!recognitionInstance) {
    recognitionInstance = createRecognition();
  }

  try {
    recognitionInstance?.start();
  } catch (err) {
    console.warn("Voice start error:", err);
    updateVoiceUiState(false, false);
  }
}

export function initVoiceSystem() {
  if ("speechSynthesis" in window && typeof window.speechSynthesis.getVoices === "function") {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    } catch {
      // ignore voice load error
    }
  }
  updateVoiceUiState(false, false);
}
