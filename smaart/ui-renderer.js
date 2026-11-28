// షార్క్ 6.1–6.5, 10.1–10.5, 13.1–13.5, 14.3 & 14.5 పరిష్కారాలు: లైబ్రరీలు, ఎడిటర్, రొటరీ డయల్ & 3D వ్యూ
import {
  hudState,
  createTimestampMeta,
  appendChatBubble
} from "./state-manager.js";
import { saveVaultSection } from "./storage-manager.js";
import { escapeHtml } from "./api-client.js";
import { isPersonalUnlocked } from "./auth.js";

let currentSearchQuery = "";
let pendingEditorMediaDataUrl = "";
let pendingEditorMediaType = "";
let waveAnimFrameId = null;
let threeAnimFrameId = null;

function getLibraryArray(type) {
  if (type === "diary") return hudState.diaryEntries;
  if (type === "album") return hudState.albumItems;
  if (type === "personal") return hudState.personalItems;
  return [];
}

function getLibrarySaveKey(type) {
  if (type === "diary") return "diaryEntries";
  if (type === "album") return "albumItems";
  if (type === "personal") return "personalItems";
  return null;
}

function getLibraryDisplayTitle(type) {
  if (type === "diary") return "01 // డైరీ లైబ్రరీ";
  if (type === "album") return "02 // ఆల్బమ్ లైబ్రరీ";
  if (type === "personal") return "03 // వ్యక్తిగత లైబ్రరీ";
  return "LIBRARY VAULT";
}

export function refreshHudCounters() {
  const diaryCount = hudState.diaryEntries.length;
  const albumCount = hudState.albumItems.length;
  const personalCount = hudState.personalItems.length;
  const memoryCount = hudState.memoryItems.length;
  const unlocked = isPersonalUnlocked();

  const diaryLabel = document.getElementById("diaryCountLabel");
  const albumLabel = document.getElementById("albumCountLabel");
  const personalLabel = document.getElementById("personalCountLabel");
  const lockBadge = document.getElementById("box3LockBadge");
  const actionHint = document.getElementById("box3ActionHint");

  if (diaryLabel) diaryLabel.textContent = `${diaryCount} ENTRIES`;
  if (albumLabel) albumLabel.textContent = `${albumCount} ITEMS`;
  if (personalLabel) {
    personalLabel.textContent = unlocked ? `${personalCount} SECRET ITEMS` : "PROTECTED";
  }
  if (lockBadge) {
    lockBadge.textContent = unlocked ? "UNLOCKED" : "LOCKED";
    lockBadge.classList.toggle("vault-badge-lock", !unlocked);
  }
  if (actionHint) actionHint.textContent = unlocked ? "OPEN" : "UNLOCK";

  // టెలిమెట్రీ కౌంటర్లు
  const telDiary = document.getElementById("telDiaryCount");
  const telAlbum = document.getElementById("telAlbumCount");
  const telPersonal = document.getElementById("telPersonalStatus");
  const telMemory = document.getElementById("telMemoryCount");
  const summaryEl = document.getElementById("telemetrySummary");

  if (telDiary) telDiary.textContent = String(diaryCount);
  if (telAlbum) telAlbum.textContent = String(albumCount);
  if (telPersonal) telPersonal.textContent = unlocked ? "OPEN" : "LOCKED";
  if (telMemory) telMemory.textContent = String(memoryCount);
  if (summaryEl) {
    summaryEl.textContent = hudState.apiKey ? "GEMINI READY" : "WEB FALLBACK";
  }

  // మినీ ప్రివ్యూ కార్డులు
  renderMiniCards("diaryMiniCards", hudState.diaryEntries, "డైరీ ఎంట్రీలు లేవు");
  renderMiniCards("albumMiniCards", hudState.albumItems, "ఆల్బమ్ మీడియా లేదు");
  renderMiniCards(
    "personalMiniCards",
    unlocked ? hudState.personalItems : [],
    unlocked ? "వ్యక్తిగత రికార్డులు లేవు" : "పాస్‌కోడ్ రక్షిత వాల్ట్"
  );
}

function renderMiniCards(containerId, items, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "vault-mini-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  items.slice(-2).reverse().forEach((item) => {
    const div = document.createElement("div");
    div.className = "vault-mini-item";
    div.textContent = item.title || item.name || "Untitled";
    container.appendChild(div);
  });
}

export function openLibraryModal(type) {
  if (type === "personal" && !isPersonalUnlocked()) {
    return;
  }
  hudState.activeLibraryType = type;
  currentSearchQuery = "";

  const modal = document.getElementById("vault-modal");
  const titleEl = document.getElementById("vaultModalTitle");
  const searchInput = document.getElementById("vaultSearchInput");

  if (titleEl) titleEl.textContent = getLibraryDisplayTitle(type);
  if (searchInput) searchInput.value = "";

  renderLibraryCards();
  modal?.classList.add("open");
}

function renderLibraryCards() {
  const grid = document.getElementById("vaultCardGrid");
  if (!grid || !hudState.activeLibraryType) return;

  const list = getLibraryArray(hudState.activeLibraryType);
  const q = currentSearchQuery.trim().toLowerCase();

  const filtered = q
    ? list.filter((entry) => {
        const title = String(entry.title || entry.name || "").toLowerCase();
        const body = String(entry.content || "").toLowerCase();
        return title.includes(q) || body.includes(q);
      })
    : list;

  grid.innerHTML = "";

  if (filtered.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "muted-note";
    emptyCard.textContent = q
      ? `"${currentSearchQuery}" కు సరిపోయే రికార్డులు లేవు.`
      : "ఇంకా ఎంట్రీలు లేవు. '+ CREATE NEW' లేదా 'UPLOAD MEDIA' వాడండి.";
    grid.appendChild(emptyCard);
    return;
  }

  filtered.slice().reverse().forEach((entry) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "library-item-card";

    const titleDiv = document.createElement("div");
    titleDiv.className = "library-item-title";
    titleDiv.textContent = entry.title || entry.name || "Untitled";

    const metaDiv = document.createElement("div");
    metaDiv.className = "library-item-meta";
    metaDiv.textContent = `#${entry.number ?? ""} • ${entry.createdAtText || ""}`;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "library-item-content";
    bodyDiv.textContent = entry.content || (entry.mediaDataUrl ? "[MEDIA ATTACHMENT]" : "");

    card.appendChild(titleDiv);
    card.appendChild(metaDiv);
    card.appendChild(bodyDiv);

    card.addEventListener("click", () => {
      if (entry.mediaDataUrl && !entry.content) {
        openMediaLightbox(entry.mediaDataUrl, entry.mediaType || "image/jpeg", entry.title || "Media");
      } else {
        openEntryEditor(entry.id);
      }
    });

    grid.appendChild(card);
  });
}

// షార్క్ 12.3 & 12.4 పరిష్కారం: ఎడిట్/క్రియేట్ ఫ్లో & ఖాళీ ఎంట్రీ నిరోధం
function openEntryEditor(existingId = null) {
  if (!hudState.activeLibraryType) return;
  hudState.editingEntryId = existingId;
  pendingEditorMediaDataUrl = "";
  pendingEditorMediaType = "";

  const modal = document.getElementById("entry-editor-modal");
  const titleInput = document.getElementById("editorTitleInput");
  const textArea = document.getElementById("editor-numbered-textarea");
  const previewBox = document.getElementById("editorPreviewBox");
  const feedback = document.getElementById("editorFeedbackMsg");

  if (feedback) feedback.textContent = "";
  if (previewBox) {
    previewBox.innerHTML = `<span class="muted-note">అటాచ్ చేసిన మీడియా ప్రివ్యూ ఇక్కడ కనిపిస్తుంది</span>`;
  }

  const list = getLibraryArray(hudState.activeLibraryType);
  const found = existingId ? list.find((item) => item.id === existingId) : null;

  if (found) {
    if (titleInput) titleInput.value = found.title || found.name || "";
    if (textArea) textArea.value = found.content || "";
    if (found.mediaDataUrl) {
      pendingEditorMediaDataUrl = found.mediaDataUrl;
      pendingEditorMediaType = found.mediaType || "image/jpeg";
      renderEditorMediaPreview(pendingEditorMediaDataUrl, pendingEditorMediaType);
    }
  } else {
    if (titleInput) titleInput.value = "";
    if (textArea) textArea.value = "";
  }

  modal?.classList.add("open");
}

function renderEditorMediaPreview(dataUrl, mimeType) {
  const previewBox = document.getElementById("editorPreviewBox");
  if (!previewBox || !dataUrl) return;

  previewBox.innerHTML = "";
  if (String(mimeType).startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = dataUrl;
    vid.controls = true;
    vid.addEventListener("click", (e) => {
      e.stopPropagation();
      openMediaLightbox(dataUrl, mimeType, "Video Preview");
    });
    previewBox.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "Attached media preview";
    img.addEventListener("click", () => {
      openMediaLightbox(dataUrl, mimeType, "Image Preview");
    });
    previewBox.appendChild(img);
  }
}

async function saveEditorEntry() {
  if (!hudState.activeLibraryType) return;
  const titleInput = document.getElementById("editorTitleInput");
  const textArea = document.getElementById("editor-numbered-textarea");
  const feedback = document.getElementById("editorFeedbackMsg");

  const titleVal = (titleInput?.value || "").trim();
  const contentVal = (textArea?.value || "").trim();

  // షార్క్ 12.4 పరిష్కారం: టెక్స్ట్ లేదా మీడియా ఏదీ లేకపోతే ఖాళీ ఎంట్రీని ఆపడం
  if (!contentVal && !pendingEditorMediaDataUrl) {
    if (feedback) {
      feedback.textContent = "ఖాళీ ఎంట్రీ సేవ్ చేయలేము. దయచేసి టెక్స్ట్ రాయండి లేదా మీడియా అటాచ్ చేయండి.";
    }
    return;
  }

  const list = getLibraryArray(hudState.activeLibraryType);
  const saveKey = getLibrarySaveKey(hudState.activeLibraryType);
  const nowMeta = createTimestampMeta();

  if (hudState.editingEntryId) {
    const idx = list.findIndex((i) => i.id === hudState.editingEntryId);
    if (idx !== -1) {
      const prevItem = list[idx];
      list[idx] = {
        ...prevItem,
        title: titleVal || prevItem.title || `Entry ${prevItem.number || idx + 1}`,
        name: titleVal || prevItem.name || `Entry ${prevItem.number || idx + 1}`,
        content: contentVal,
        mediaDataUrl: pendingEditorMediaDataUrl || prevItem.mediaDataUrl || "",
        mediaType: pendingEditorMediaType || prevItem.mediaType || "",
        updatedAtText: nowMeta.createdAtText,
        updatedAt: nowMeta.timestamp
      };
    }
  } else {
    const nextNum = list.length + 1;
    const finalTitle = titleVal || `Entry #${nextNum}`;
    list.push({
      id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: nextNum,
      title: finalTitle,
      name: finalTitle,
      content: contentVal,
      mediaDataUrl: pendingEditorMediaDataUrl || "",
      mediaType: pendingEditorMediaType || "",
      ...nowMeta
    });
  }

  if (saveKey) {
    await saveVaultSection(saveKey, list);
  }
  refreshHudCounters();
  renderLibraryCards();
  document.getElementById("entry-editor-modal")?.classList.remove("open");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function openHistoryModal() {
  const modal = document.getElementById("history-modal");
  const body = document.getElementById("historyModalBody");
  if (!body) return;

  body.innerHTML = "";

  const memHeading = document.createElement("h3");
  memHeading.className = "editor-label";
  memHeading.textContent = `SAVED MEMORY (${hudState.memoryItems.length})`;
  body.appendChild(memHeading);

  if (hudState.memoryItems.length === 0) {
    const emptyMem = document.createElement("div");
    emptyMem.className = "muted-note";
    emptyMem.textContent = "సేవ్ చేసిన మెమరీ అంశాలు ఇంకా లేవు.";
    body.appendChild(emptyMem);
  } else {
    hudState.memoryItems.slice().reverse().forEach((m) => {
      const card = document.createElement("div");
      card.className = "library-item-card";
      card.textContent = `${m.summary} (${m.createdAtText || ""})`;
      body.appendChild(card);
    });
  }

  const histHeading = document.createElement("h3");
  histHeading.className = "editor-label";
  histHeading.style.marginTop = "8px";
  histHeading.textContent = `RECENT CHAT HISTORY (${hudState.chatHistory.length})`;
  body.appendChild(histHeading);

  hudState.chatHistory.slice(-15).reverse().forEach((c) => {
    const row = document.createElement("div");
    row.className = "library-item-card";
    row.textContent = `[${String(c.role || "").toUpperCase()}] ${c.text}`;
    body.appendChild(row);
  });

  modal?.classList.add("open");
}

export function openMediaLightbox(src, mimeType, captionText = "") {
  const modal = document.getElementById("media-lightbox-modal");
  const content = document.getElementById("lightboxContent");
  const caption = document.getElementById("lightboxCaption");
  if (!modal || !content) return;

  content.innerHTML = "";
  if (String(mimeType).startsWith("video/")) {
    const vid = document.createElement("video");
    vid.src = src;
    vid.controls = true;
    vid.autoplay = true;
    content.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = src;
    img.alt = captionText || "Media preview";
    content.appendChild(img);
  }

  if (caption) caption.textContent = captionText;
  modal.classList.add("open");
}

// షార్క్ 14.5 పరిష్కారం: THREE లైబ్రరీ లేకపోయినా క్రాష్ కాకుండా సేఫ్ 3D ప్రివ్యూ
export function open3dWorkspaceModal() {
  const modal = document.getElementById("workspace-tool-modal");
  const canvas = document.getElementById("threePreviewCanvas");
  const statusEl = document.getElementById("workspace3dStatus");
  modal?.classList.add("open");

  if (threeAnimFrameId) {
    cancelAnimationFrame(threeAnimFrameId);
    threeAnimFrameId = null;
  }

  if (canvas && window.THREE) {
    try {
      const THREE = window.THREE;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(canvas.width, canvas.height, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
      camera.position.z = 3.2;

      const geo = new THREE.IcosahedronGeometry(1.05, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      if (statusEl) statusEl.textContent = "THREE.JS WIREFRAME CORE ACTIVE";

      const tick = () => {
        mesh.rotation.x += 0.008;
        mesh.rotation.y += 0.012;
        renderer.render(scene, camera);
        threeAnimFrameId = requestAnimationFrame(tick);
      };
      tick();
      return;
    } catch {
      // 2D ఫాల్‌బ్యాక్‌కు వెళ్తుంది
    }
  }

  if (canvas) {
    const ctx = canvas.getContext("2d");
    let angle = 0;
    if (statusEl) statusEl.textContent = "2D HUD VECTOR PREVIEW ACTIVE";
    const draw2d = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(-48, -48, 96, 96);
      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      angle += 0.02;
      threeAnimFrameId = requestAnimationFrame(draw2d);
    };
    draw2d();
  }
}

export function setExpandedElement(el) {
  if (!el || hudState.expandedElement === el) return;
  collapseExpandedElement();
  hudState.expandedElement = el;
  el.style.position = "fixed";
  el.style.inset = "12px";
  el.style.zIndex = "40";
  el.style.background = "#051224";
  el.style.boxShadow = "0 0 36px rgba(0, 240, 255, 0.45)";
}

export function collapseExpandedElement() {
  const el = hudState.expandedElement;
  if (!el) return;
  el.style.position = "";
  el.style.inset = "";
  el.style.zIndex = "";
  el.style.background = "";
  el.style.boxShadow = "";
  hudState.expandedElement = null;
}

function resetRotaryDialState() {
  hudState.rotaryAngleTotal = 0;
  hudState.rotaryUnlocked = false;
  const puck = document.getElementById("keyDialPuck");
  const progressText = document.getElementById("rotaryProgressText");
  const hint = document.getElementById("rotaryHint");

  if (puck) {
    puck.style.transform = "rotate(0deg)";
    puck.classList.remove("unlocked");
  }
  if (progressText) progressText.textContent = "0° / 1080°";
  if (hint) hint.textContent = "3 TURNS COUNTER-CLOCKWISE TO UNLOCK & DRAG";
}

// షార్క్ 13.1–13.4 పరిష్కారం: రొటరీ డయల్ అపసవ్య భ్రమణం & డ్రాగ్-టు-ఎక్స్‌పాండ్
function initRotaryDial() {
  const puck = document.getElementById("keyDialPuck");
  const progressText = document.getElementById("rotaryProgressText");
  const hint = document.getElementById("rotaryHint");
  if (!puck) return;

  let rotating = false;
  let draggingUnlocked = false;
  let prevAngle = null;
  let hoverTarget = null;

  const getPointerAngleDeg = (clientX, clientY) => {
    const rect = puck.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  };

  const findExpandableDropTarget = (clientX, clientY) => {
    const candidates = [
      document.getElementById("chatPanel"),
      document.getElementById("box1-diary"),
      document.getElementById("box2-album"),
      document.getElementById("box3-personal"),
      document.getElementById("skullStage")
    ].filter(Boolean);

    for (const node of candidates) {
      const r = node.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return node;
      }
    }
    return null;
  };

  puck.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    puck.setPointerCapture(e.pointerId);

    if (hudState.rotaryUnlocked) {
      draggingUnlocked = true;
      if (hint) hint.textContent = "DROP OVER A PANEL TO EXPAND";
      return;
    }

    rotating = true;
    prevAngle = getPointerAngleDeg(e.clientX, e.clientY);
  });

  puck.addEventListener("pointermove", (e) => {
    if (draggingUnlocked) {
      const target = findExpandableDropTarget(e.clientX, e.clientY);
      if (hoverTarget && hoverTarget !== target) {
        hoverTarget.style.outline = "";
      }
      hoverTarget = target;
      if (hoverTarget) {
        hoverTarget.style.outline = "2px solid #ffbe2e";
      }
      return;
    }

    if (!rotating || prevAngle === null) return;
    const currentAngle = getPointerAngleDeg(e.clientX, e.clientY);
    let delta = currentAngle - prevAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    prevAngle = currentAngle;

    // అపసవ్య దిశ (counter-clockwise) భ్రమణాన్ని లెక్కించడం
    if (delta < 0) {
      hudState.rotaryAngleTotal = Math.min(1080, hudState.rotaryAngleTotal + Math.abs(delta));
      puck.style.transform = `rotate(${-hudState.rotaryAngleTotal}deg)`;
      const rounded = Math.round(hudState.rotaryAngleTotal);
      if (progressText) progressText.textContent = `${rounded}° / 1080°`;

      if (hudState.rotaryAngleTotal >= 1080 && !hudState.rotaryUnlocked) {
        hudState.rotaryUnlocked = true;
        puck.classList.add("unlocked");
        if (hint) hint.textContent = "UNLOCKED! DRAG KEY TO ANY PANEL";
      }
    }
  });

  const finishPointer = (e) => {
    if (hoverTarget) {
      hoverTarget.style.outline = "";
    }

    if (draggingUnlocked) {
      const dropTarget = findExpandableDropTarget(e.clientX, e.clientY);
      draggingUnlocked = false;
      hoverTarget = null;
      if (dropTarget) {
        setExpandedElement(dropTarget);
        appendChatBubble("ai", `ప్యానెల్ విస్తరించబడింది. సాధారణ స్థితికి రావడానికి EXIT లేదా ESC నొక్కండి.`, false);
      }
      resetRotaryDialState();
      return;
    }

    rotating = false;
    prevAngle = null;
  };

  puck.addEventListener("pointerup", finishPointer);
  puck.addEventListener("pointercancel", finishPointer);
}

function initSpectrumBars() {
  const barsContainer = document.getElementById("spectrumBars");
  if (!barsContainer) return;
  barsContainer.innerHTML = "";
  for (let i = 0; i < 18; i += 1) {
    const bar = document.createElement("div");
    bar.className = "spec-bar";
    bar.style.height = `${20 + ((i * 11) % 65)}%`;
    barsContainer.appendChild(bar);
  }

  setInterval(() => {
    const bars = barsContainer.querySelectorAll(".spec-bar");
    bars.forEach((b, idx) => {
      if (hudState.isListening || hudState.isSpeaking) {
        const h = 25 + Math.floor(Math.random() * 75);
        b.style.height = `${h}%`;
      } else {
        b.style.height = `${16 + ((idx * 7) % 28)}%`;
      }
    });
  }, 160);
}

export function renderRedPulseWave() {
  const canvas = document.getElementById("redWaveCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let phase = 0;
  const drawWave = () => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 42, 85, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const amp = hudState.isListening || hudState.isSpeaking ? 24 : 10;
    for (let x = 0; x <= w; x += 4) {
      const y = h / 2 + Math.sin(x * 0.045 + phase) * amp * Math.sin(x * 0.015);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    phase += hudState.isListening || hudState.isSpeaking ? 0.18 : 0.06;
    waveAnimFrameId = requestAnimationFrame(drawWave);
  };
  drawWave();
}

export function initHudRenderer() {
  // టాప్ రూలర్ టిక్స్
  const ruler = document.getElementById("topRuler");
  if (ruler && ruler.childElementCount === 0) {
    for (let t = 0; t <= 12; t += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ruler-tick ${t === 0 ? "active" : ""}`;
      btn.textContent = `0${t}`.slice(-2);
      btn.addEventListener("click", () => {
        ruler.querySelectorAll(".ruler-tick").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
      });
      ruler.appendChild(btn);
    }
  }

  initSpectrumBars();
  initRotaryDial();

  // లైబ్రరీ మోడల్ నియంత్రణలు
  document.getElementById("closeVaultModalBtn")?.addEventListener("click", () => {
    document.getElementById("vault-modal")?.classList.remove("open");
  });

  document.getElementById("vaultCreateNewBtn")?.addEventListener("click", () => {
    openEntryEditor(null);
  });

  const mediaFilesInput = document.getElementById("media-files-input");
  document.getElementById("vaultUploadMediaBtn")?.addEventListener("click", () => {
    mediaFilesInput?.click();
  });

  // షార్క్ 14.3 పరిష్కారం: ఫైల్ ఎంచుకున్న తర్వాత ఇన్‌పుట్ విలువను రీసెట్ చేయడం
  mediaFilesInput?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !hudState.activeLibraryType) return;

    const list = getLibraryArray(hudState.activeLibraryType);
    const saveKey = getLibrarySaveKey(hudState.activeLibraryType);

    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const meta = createTimestampMeta();
        const nextNum = list.length + 1;
        list.push({
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          number: nextNum,
          title: file.name,
          name: file.name,
          content: "",
          mediaDataUrl: dataUrl,
          mediaType: file.type || "application/octet-stream",
          ...meta
        });
      } catch (err) {
        console.warn("Media upload failed:", err);
      }
    }

    if (saveKey) {
      await saveVaultSection(saveKey, list);
    }
    refreshHudCounters();
    renderLibraryCards();
    e.target.value = "";
  });

  document.getElementById("vaultSearchInput")?.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value || "";
    renderLibraryCards();
  });

  document.getElementById("vaultClearSearchBtn")?.addEventListener("click", () => {
    currentSearchQuery = "";
    const searchInput = document.getElementById("vaultSearchInput");
    if (searchInput) searchInput.value = "";
    renderLibraryCards();
  });

  // ఎడిటర్ మోడల్ నియంత్రణలు
  document.getElementById("closeEditorModalBtn")?.addEventListener("click", () => {
    document.getElementById("entry-editor-modal")?.classList.remove("open");
  });
  document.getElementById("editorCancelBtn")?.addEventListener("click", () => {
    document.getElementById("entry-editor-modal")?.classList.remove("open");
  });
  document.getElementById("editorSaveBtn")?.addEventListener("click", saveEditorEntry);

  const editorImgInput = document.getElementById("editor-img-input");
  document.getElementById("editorAttachMediaBtn")?.addEventListener("click", () => {
    editorImgInput?.click();
  });

  editorImgInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingEditorMediaDataUrl = await readFileAsDataUrl(file);
      pendingEditorMediaType = file.type || "image/jpeg";
      renderEditorMediaPreview(pendingEditorMediaDataUrl, pendingEditorMediaType);
    } catch (err) {
      console.warn("Editor media attach failed:", err);
    }
    e.target.value = "";
  });

  document.getElementById("editorSelectAllBtn")?.addEventListener("click", () => {
    const ta = document.getElementById("editor-numbered-textarea");
    if (ta) {
      ta.focus();
      ta.select();
    }
  });

  // హిస్టరీ & 3D & లైట్‌బాక్స్ క్లోజ్ బటన్లు
  document.getElementById("closeHistoryModalBtn")?.addEventListener("click", () => {
    document.getElementById("history-modal")?.classList.remove("open");
  });
  document.getElementById("closeWorkspaceModalBtn")?.addEventListener("click", () => {
    if (threeAnimFrameId) {
      cancelAnimationFrame(threeAnimFrameId);
      threeAnimFrameId = null;
    }
    document.getElementById("workspace-tool-modal")?.classList.remove("open");
  });
  document.getElementById("closeLightboxBtn")?.addEventListener("click", () => {
    document.getElementById("media-lightbox-modal")?.classList.remove("open");
  });
}
