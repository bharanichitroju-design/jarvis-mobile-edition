// షార్క్ 2.1–2.5, 3.1–3.5, 12.1–12.5 & 21.3 పరిష్కారాలు: IndexedDB + LocalStorage డేటా & బ్యాకప్ మేనేజర్
import { safeJsonParse } from "./state-manager.js";

const DB_NAME = "StarkHudVaultDB";
const DB_VERSION = 1;
const STORE_NAME = "hud_sections";

const LS_KEYS = {
  diary: "hud_diary_entries_v1",
  album: "hud_album_items_v1",
  personal: "hud_personal_items_v1",
  chat: "hud_chat_history_v1",
  memory: "hud_memory_items_v1",
  apiKey: "hud_gemini_api_key_v1",
  lockState: "hud_personal_lock_v1"
};

let dbInstance = null;

function openIndexedDb() {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function idbPut(key, value) {
  return new Promise((resolve) => {
    if (!dbInstance) {
      resolve(false);
      return;
    }
    try {
      const tx = dbInstance.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbGet(key) {
  return new Promise((resolve) => {
    if (!dbInstance) {
      resolve(undefined);
      return;
    }
    try {
      const tx = dbInstance.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function initStorage() {
  dbInstance = await openIndexedDb();
}

function writeLocalStorageSafe(key, serialized) {
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    // షార్క్ 3.2 పరిష్కారం: కోటా/స్టోరేజ్ పరిమితి వచ్చినప్పుడు క్రాష్ కాకుండా సురక్షితంగా హ్యాండిల్ చేయడం
    console.warn("LocalStorage quota or write issue:", err);
    return false;
  }
}

export async function saveVaultSection(sectionKey, dataArray) {
  const safeArray = Array.isArray(dataArray) ? dataArray : [];
  const lsKeyMap = {
    diaryEntries: LS_KEYS.diary,
    albumItems: LS_KEYS.album,
    personalItems: LS_KEYS.personal,
    chatHistory: LS_KEYS.chat,
    memoryItems: LS_KEYS.memory
  };
  const targetLsKey = lsKeyMap[sectionKey];
  if (targetLsKey) {
    try {
      writeLocalStorageSafe(targetLsKey, JSON.stringify(safeArray));
    } catch {
      // పెద్ద మీడియా డేటా ఉంటే IndexedDB లో భద్రపరుస్తాం
    }
  }
  await idbPut(sectionKey, safeArray);
}

async function loadSectionArray(sectionKey, lsKey) {
  const idbVal = await idbGet(sectionKey);
  if (Array.isArray(idbVal)) {
    return idbVal;
  }
  try {
    const raw = localStorage.getItem(lsKey);
    const parsed = safeJsonParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadAllVaultData() {
  const [diaryEntries, albumItems, personalItems, chatHistory, memoryItems] = await Promise.all([
    loadSectionArray("diaryEntries", LS_KEYS.diary),
    loadSectionArray("albumItems", LS_KEYS.album),
    loadSectionArray("personalItems", LS_KEYS.personal),
    loadSectionArray("chatHistory", LS_KEYS.chat),
    loadSectionArray("memoryItems", LS_KEYS.memory)
  ]);

  return {
    diaryEntries,
    albumItems,
    personalItems,
    chatHistory,
    memoryItems
  };
}

export function getApiKeyFromStorage() {
  try {
    return localStorage.getItem(LS_KEYS.apiKey) || "";
  } catch {
    return "";
  }
}

export function saveApiKeyToStorage(key) {
  writeLocalStorageSafe(LS_KEYS.apiKey, key || "");
}

export function getPersonalLockState() {
  try {
    const raw = localStorage.getItem(LS_KEYS.lockState);
    const parsed = safeJsonParse(raw, { failedAttempts: 0, lockoutUntil: 0 });
    return {
      failedAttempts: Number(parsed?.failedAttempts) || 0,
      lockoutUntil: Number(parsed?.lockoutUntil) || 0
    };
  } catch {
    return { failedAttempts: 0, lockoutUntil: 0 };
  }
}

export function savePersonalLockState(stateObj) {
  writeLocalStorageSafe(
    LS_KEYS.lockState,
    JSON.stringify({
      failedAttempts: Number(stateObj?.failedAttempts) || 0,
      lockoutUntil: Number(stateObj?.lockoutUntil) || 0
    })
  );
}

// షార్క్ 21.3 పరిష్కారం: యూజర్ డేటాను సురక్షితంగా JSON బ్యాకప్ ఫైల్‌గా ఎగుమతి చేయడం
export async function exportBackupToJson() {
  const allData = await loadAllVaultData();
  const payload = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    data: allData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stark-hud-backup-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
