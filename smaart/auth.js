// షార్క్ 1.2, 1.4, 2.2, 21.2 & 29.2 పరిష్కారాలు: పాస్‌కోడ్ తనిఖీ, లాక్‌అవుట్ టైమర్ & సెషన్ సెక్యూరిటీ
import { hudState } from "./state-manager.js";
import { getPersonalLockState, savePersonalLockState } from "./storage-manager.js";
import { openLibraryModal, refreshHudCounters } from "./ui-renderer.js";

const DEFAULT_PASSCODE = "1234";
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30000; // 30 సెకన్ల లాక్‌అవుట్

let personalSessionUnlocked = false;
let currentCodeBuffer = "";
let countdownIntervalId = null;
let typewriterTimeoutId = null;

function playSentinelTypewriter(message) {
  const el = document.getElementById("sentinelTypewriterText");
  if (!el) return;
  if (typewriterTimeoutId) {
    clearTimeout(typewriterTimeoutId);
    typewriterTimeoutId = null;
  }
  el.textContent = "";
  let idx = 0;
  const step = () => {
    if (!el) return;
    el.textContent += message.charAt(idx);
    idx += 1;
    if (idx < message.length) {
      typewriterTimeoutId = setTimeout(step, 24);
    }
  };
  step();
}

function updatePasscodeDisplay() {
  const displayEl = document.getElementById("passcodeDisplayBox");
  if (!displayEl) return;
  if (!currentCodeBuffer) {
    displayEl.textContent = "------";
    return;
  }
  displayEl.textContent = "•".repeat(currentCodeBuffer.length).padEnd(6, "·");
}

function syncLockoutUi() {
  const lockState = getPersonalLockState();
  hudState.failedAttempts = lockState.failedAttempts;
  hudState.lockoutUntil = lockState.lockoutUntil;

  const now = Date.now();
  const remainingMs = Math.max(0, hudState.lockoutUntil - now);
  const badgeEl = document.getElementById("sentinelStateBadge");
  const attemptsEl = document.getElementById("sentinelAttemptsText");
  const countdownEl = document.getElementById("sentinelLockoutCountdown");

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - hudState.failedAttempts);
  if (attemptsEl) {
    attemptsEl.textContent = `ATTEMPTS LEFT: ${attemptsLeft}`;
  }

  if (remainingMs > 0) {
    if (badgeEl) badgeEl.textContent = "LOCKOUT ACTIVE";
    const secs = Math.ceil(remainingMs / 1000);
    if (countdownEl) {
      countdownEl.textContent = `అధిక తప్పు ప్రయత్నాల వల్ల లాక్ చేయబడింది. ${secs} సెకన్లలో తిరిగి ప్రయత్నించండి.`;
    }
    if (!countdownIntervalId) {
      countdownIntervalId = setInterval(() => {
        const left = hudState.lockoutUntil - Date.now();
        if (left <= 0) {
          clearInterval(countdownIntervalId);
          countdownIntervalId = null;
          hudState.failedAttempts = 0;
          hudState.lockoutUntil = 0;
          savePersonalLockState({ failedAttempts: 0, lockoutUntil: 0 });
          if (countdownEl) countdownEl.textContent = "";
          if (badgeEl) badgeEl.textContent = "LOCKED";
          if (attemptsEl) attemptsEl.textContent = `ATTEMPTS LEFT: ${MAX_ATTEMPTS}`;
          playSentinelTypewriter("లాక్‌అవుట్ ముగిసింది. పాస్‌కోడ్ నమోదు చేయండి.");
        } else if (countdownEl) {
          countdownEl.textContent = `అధిక తప్పు ప్రయత్నాల వల్ల లాక్ చేయబడింది. ${Math.ceil(left / 1000)} సెకన్లలో తిరిగి ప్రయత్నించండి.`;
        }
      }, 250);
    }
    return true;
  }

  if (countdownEl) countdownEl.textContent = "";
  if (badgeEl) badgeEl.textContent = "LOCKED";
  return false;
}

function handleKeypadAction(keyVal) {
  if (syncLockoutUi()) {
    playSentinelTypewriter("సిస్టమ్ తాత్కాలికంగా లాక్‌లో ఉంది. కౌంట్‌డౌన్ పూర్తయ్యే వరకు ఆగండి.");
    return;
  }

  if (keyVal === "CLEAR") {
    currentCodeBuffer = "";
    updatePasscodeDisplay();
    playSentinelTypewriter("ఇన్‌పుట్ క్లియర్ చేయబడింది.");
    return;
  }

  if (keyVal === "ENTER") {
    verifyEnteredPasscode();
    return;
  }

  if (currentCodeBuffer.length < 8) {
    currentCodeBuffer += String(keyVal);
    updatePasscodeDisplay();
  }
}

function verifyEnteredPasscode() {
  if (!currentCodeBuffer) {
    playSentinelTypewriter("దయచేసి పాస్‌కోడ్ నమోదు చేయండి.");
    return;
  }

  if (currentCodeBuffer === DEFAULT_PASSCODE) {
    personalSessionUnlocked = true;
    currentCodeBuffer = "";
    hudState.failedAttempts = 0;
    hudState.lockoutUntil = 0;
    savePersonalLockState({ failedAttempts: 0, lockoutUntil: 0 });
    updatePasscodeDisplay();
    refreshHudCounters();

    const modal = document.getElementById("personal-modal");
    modal?.classList.remove("open");
    openLibraryModal("personal");
    return;
  }

  hudState.failedAttempts += 1;
  currentCodeBuffer = "";
  updatePasscodeDisplay();

  if (hudState.failedAttempts >= MAX_ATTEMPTS) {
    hudState.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    savePersonalLockState({
      failedAttempts: hudState.failedAttempts,
      lockoutUntil: hudState.lockoutUntil
    });
    syncLockoutUi();
    playSentinelTypewriter("మూడుసార్లు తప్పు కోడ్ ఇచ్చారు. సెంటినెల్ గేట్ 30 సెకన్లు లాక్ చేయబడింది.");
  } else {
    savePersonalLockState({
      failedAttempts: hudState.failedAttempts,
      lockoutUntil: 0
    });
    syncLockoutUi();
    playSentinelTypewriter(`తప్పు పాస్‌కోడ్. మిగిలిన ప్రయత్నాలు: ${MAX_ATTEMPTS - hudState.failedAttempts}.`);
  }
}

export function isPersonalUnlocked() {
  return personalSessionUnlocked;
}

export function lockPersonalLibrary() {
  personalSessionUnlocked = false;
  currentCodeBuffer = "";
  updatePasscodeDisplay();
  refreshHudCounters();
}

export function openPersonalGateModal() {
  if (personalSessionUnlocked) {
    openLibraryModal("personal");
    return;
  }
  currentCodeBuffer = "";
  updatePasscodeDisplay();
  const modal = document.getElementById("personal-modal");
  modal?.classList.add("open");
  const isLockedOut = syncLockoutUi();
  playSentinelTypewriter(
    isLockedOut
      ? "సెంటినెల్ లాక్‌అవుట్ అమలులో ఉంది."
      : "వ్యక్తిగత లైబ్రరీని తెరవడానికి పాస్‌కోడ్ నమోదు చేయండి (డిఫాల్ట్: 1234)."
  );
}

export function initAuthGate() {
  const keypadGrid = document.getElementById("flameKeypadGrid");
  keypadGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-key]");
    if (!btn) return;
    handleKeypadAction(btn.getAttribute("data-key"));
  });

  document.getElementById("closePersonalModalBtn")?.addEventListener("click", () => {
    currentCodeBuffer = "";
    updatePasscodeDisplay();
    document.getElementById("personal-modal")?.classList.remove("open");
  });

  updatePasscodeDisplay();
}
