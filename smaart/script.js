/* =========================================================
   1. INITIALIZATION & CONFIGURATION
   ========================================================= */
let API_KEY = localStorage.getItem('jarvis_key') || '';

function checkApiKey() {
  if (!API_KEY) {
    API_KEY = prompt('Enter your Gemini API Key to enable AI responses, Boss:');
    if (API_KEY) localStorage.setItem('jarvis_key', API_KEY.trim());
  }
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

const SYSTEM_INSTRUCTION = `You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani (also addressed as Sir).
Behavior Guidelines:
1. Always address Bharani as "Boss" or "Sir".
2. If asked "What is your name?" or "Who are you?", respond with: "My name is Jarvis, created by Bharani (Sir)."
3. Keep answers concise, direct, and helpful. Utilize the user's saved memory files and offline notes when requested.
4. [Projection & File Control Commands]: Support commands like 'full screen f1', 'natural f1', '3d f1', 'natural all files', '3d all files', 'explain f1', 'analyze f1', 'go back', 'go home', and 'clear memory'.`;

let SESSIONS = [];
try {
  const storedSessions = JSON.parse(localStorage.getItem('jarvis_sessions') || '[]');
  if (Array.isArray(storedSessions)) {
    SESSIONS = storedSessions;
  }
} catch (e) {
  localStorage.removeItem('jarvis_sessions');
}

function format12HourTime(dateObj) {
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const day = dateObj.toLocaleDateString();
  return `${day}, ${hours}:${minutes} ${ampm}`;
}

let currentSession = {
  id: Date.now(),
  title: "New Conversation",
  date: format12HourTime(new Date()),
  messages: []
};

let pendingImageData = null;
let isJarvisSpeaking = false;
let isListeningActive = false;
let strictJarvisKeywordMode = false;
let workspaceFiles3D = [];
let totalAccessLogs = 23258;

// DOM Elements
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const executeBtn = document.getElementById('execute-btn');
const micBtn = document.getElementById('mic-btn');
const imgInput = document.getElementById('img-input');
const statusText = document.getElementById('status-text');
const statusBadge = document.getElementById('status-badge');
const systemLogs = document.getElementById('systemLogs');
const voiceStatus = document.getElementById('voiceStatus');
const modeIndicator = document.getElementById('modeIndicator');
const speechIndicator = document.getElementById('speechIndicator');

const historyModal = document.getElementById('history-modal');
const closeHistory = document.getElementById('close-history');
const historyList = document.getElementById('history-list');
const clearAllHistoryBtn = document.getElementById('clear-all-history');

const memoryModal = document.getElementById('memory-modal');
const closeMemoryModal = document.getElementById('close-memory-modal');
const memorySearchInput = document.getElementById('memory-search-input');
const customMemoryInput = document.getElementById('custom-memory-input');
const saveCustomMemory = document.getElementById('save-custom-memory');
const savedMemoryList = document.getElementById('saved-memory-list');

/* =========================================================
   1.1. SYSTEM LOGS & TELEMETRY COUNTERS
   ========================================================= */
function pushSystemLog(label, value) {
  if (!systemLogs) return;
  const li = document.createElement('li');
  li.innerHTML = `${label}: <span class="highlight">${value}</span>`;
  systemLogs.appendChild(li);
  while (systemLogs.children.length > 6) {
    systemLogs.removeChild(systemLogs.firstElementChild);
  }
}

function updateTelemetryCounters() {
  const memCountEl = document.getElementById('memCount');
  const file3dCountEl = document.getElementById('file3dCount');
  const msgCountEl = document.getElementById('msgCount');
  const accessLogsEl = document.getElementById('accessLogs');

  if (memCountEl) memCountEl.innerText = String(getCustomMemories().length);
  if (file3dCountEl) {
    const activeFiles = workspaceFiles3D.filter(f => !f.isDeleted).length;
    file3dCountEl.innerText = String(activeFiles);
  }
  if (msgCountEl) msgCountEl.innerText = String(currentSession.messages.length);
  if (accessLogsEl) accessLogsEl.innerText = totalAccessLogs.toLocaleString();
}

/* =========================================================
   1.2. IRON MAN 2 STYLE RED HACKING WHEEL (3 SPINS -> DRAG -> FULLSCREEN)
   ========================================================= */
const hackingWheelEl = document.getElementById('hackingWheel');
const hackingWheelCanvas = document.getElementById('hackingWheelCanvas');
const wheelReadoutEl = document.getElementById('wheelReadout');
const wheelLockStateEl = document.getElementById('wheelLockState');
const hackWheelDockEl = document.getElementById('hackWheelDock');

let wheelState = {
  cumulativeAngle: 0,
  visualAngle: 0,
  lastPointerAngle: null,
  isRotating: false,
  isUnlocked: false,
  isDraggingWheel: false,
  dragMovedDistance: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  wheelStartLeft: 0,
  wheelStartTop: 0,
  hoveredBox: null,
  expandedBox: null
};

const REQUIRED_DEGREES = 360 * 3;

function drawHackingWheel() {
  if (!hackingWheelCanvas) return;
  const ctx = hackingWheelCanvas.getContext('2d');
  const w = hackingWheelCanvas.width;
  const h = hackingWheelCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(cx, cy) - 4;
  const progress = Math.min(1, Math.abs(wheelState.cumulativeAngle) / REQUIRED_DEGREES);
  const rotRad = (wheelState.visualAngle * Math.PI) / 180;

  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createRadialGradient(cx, cy, maxR * 0.15, cx, cy, maxR);
  grad.addColorStop(0, wheelState.isUnlocked ? 'rgba(255, 30, 39, 0.34)' : 'rgba(255, 30, 39, 0.14)');
  grad.addColorStop(1, 'rgba(20, 2, 4, 0.05)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotRad);

  const segCount = 6;
  for (let i = 0; i < segCount; i++) {
    const startA = (i * Math.PI * 2) / segCount + 0.08;
    const endA = ((i + 1) * Math.PI * 2) / segCount - 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, maxR - 3, startA, endA);
    ctx.strokeStyle = wheelState.isUnlocked ? '#ff474e' : 'rgba(255, 30, 39, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const tickCount = 24;
  for (let t = 0; t < tickCount; t++) {
    const a = (t * Math.PI * 2) / tickCount;
    const inner = t % 4 === 0 ? maxR - 15 : maxR - 11;
    const outer = maxR - 7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.strokeStyle = t % 4 === 0 ? '#ff474e' : 'rgba(255, 30, 39, 0.45)';
    ctx.lineWidth = t % 4 === 0 ? 1.8 : 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, maxR * 0.56, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.strokeStyle = 'rgba(255, 30, 39, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(maxR * 0.52, 0);
  ctx.lineTo(maxR * 0.76, 0);
  ctx.strokeStyle = '#ff474e';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = wheelState.isUnlocked ? '#ff474e' : '#ff1e27';
  ctx.lineWidth = 3.2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ff1e27';
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function updateWheelUI() {
  const spinsDone = Math.min(3, Math.floor(Math.abs(wheelState.cumulativeAngle) / 360));
  if (wheelReadoutEl) {
    if (wheelState.expandedBox) {
      wheelReadoutEl.innerHTML = "EXIT<br>VIEW";
    } else if (wheelState.isUnlocked) {
      wheelReadoutEl.innerHTML = "DRAG<br>BOX";
    } else {
      wheelReadoutEl.innerHTML = `${spinsDone}/3`;
    }
  }

  if (wheelLockStateEl) {
    if (wheelState.expandedBox) {
      wheelLockStateEl.innerText = "FULLSCREEN";
    } else if (wheelState.isUnlocked) {
      wheelLockStateEl.innerText = "UNLOCKED";
    } else {
      wheelLockStateEl.innerText = "3x SPIN LOCK";
    }
  }

  if (hackingWheelEl) {
    hackingWheelEl.classList.toggle('unlocked', wheelState.isUnlocked);
  }

  drawHackingWheel();
}

function getPointerAngleFromWheel(clientX, clientY) {
  if (!hackingWheelEl) return 0;
  const rect = hackingWheelEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
}

function findExpandableBoxAtPoint(clientX, clientY) {
  const boxes = Array.from(document.querySelectorAll('[data-expandable="true"]'));
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box === wheelState.expandedBox) continue;
    const rect = box.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return box;
    }
  }
  return null;
}

function clearDropHighlight() {
  if (wheelState.hoveredBox) {
    wheelState.hoveredBox.classList.remove('drop-target-hover');
    wheelState.hoveredBox = null;
  }
}

function expandBoxToFullscreen(box) {
  if (!box) return;
  if (wheelState.expandedBox && wheelState.expandedBox !== box) {
    wheelState.expandedBox.classList.remove('expanded-fullscreen');
  }

  box.classList.add('expanded-fullscreen');
  wheelState.expandedBox = box;
  wheelState.isDraggingWheel = false;

  if (hackingWheelEl) {
    hackingWheelEl.classList.remove('floating-wheel', 'dragging');
    hackingWheelEl.style.left = '';
    hackingWheelEl.style.top = '';
    hackingWheelEl.classList.add('docked-return');
    if (hackingWheelEl.parentElement !== document.body) {
      document.body.appendChild(hackingWheelEl);
    }
  }

  const label = box.getAttribute('data-box-id') || 'PANEL';
  pushSystemLog("Wheel", `FULLSCREEN_${label.toUpperCase()}`);
  updateWheelUI();
  setTimeout(resizeSlowGlobeViewport, 60);
}

function restoreFullscreenBoxAndResetWheel() {
  if (wheelState.expandedBox) {
    wheelState.expandedBox.classList.remove('expanded-fullscreen');
    wheelState.expandedBox = null;
  }

  wheelState.isUnlocked = false;
  wheelState.isDraggingWheel = false;
  wheelState.cumulativeAngle = 0;
  wheelState.visualAngle = 0;
  wheelState.lastPointerAngle = null;
  clearDropHighlight();

  if (hackingWheelEl) {
    hackingWheelEl.classList.remove('docked-return', 'floating-wheel', 'dragging', 'unlocked');
    hackingWheelEl.style.left = '';
    hackingWheelEl.style.top = '';
    if (hackWheelDockEl && hackingWheelEl.parentElement !== hackWheelDockEl) {
      hackWheelDockEl.appendChild(hackingWheelEl);
    }
  }

  pushSystemLog("Wheel", "LOCKED_RESET");
  updateWheelUI();
  setTimeout(resizeSlowGlobeViewport, 60);
}

function initHackingWheelInteractions() {
  if (!hackingWheelEl) return;

  hackingWheelEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (wheelState.expandedBox) {
      restoreFullscreenBoxAndResetWheel();
      return;
    }

    wheelState.pointerStartX = e.clientX;
    wheelState.pointerStartY = e.clientY;
    wheelState.dragMovedDistance = 0;

    if (wheelState.isUnlocked) {
      wheelState.isDraggingWheel = true;
      hackingWheelEl.classList.add('dragging', 'floating-wheel');
      const rect = hackingWheelEl.getBoundingClientRect();
      if (hackingWheelEl.parentElement !== document.body) {
        document.body.appendChild(hackingWheelEl);
      }
      wheelState.wheelStartLeft = rect.left;
      wheelState.wheelStartTop = rect.top;
      hackingWheelEl.style.left = `${rect.left}px`;
      hackingWheelEl.style.top = `${rect.top}px`;
      hackingWheelEl.style.right = 'auto';
      hackingWheelEl.style.bottom = 'auto';
    } else {
      wheelState.isRotating = true;
      wheelState.lastPointerAngle = getPointerAngleFromWheel(e.clientX, e.clientY);
    }

    hackingWheelEl.setPointerCapture(e.pointerId);
  });

  hackingWheelEl.addEventListener('pointermove', (e) => {
    if (wheelState.expandedBox) return;

    const dxMove = e.clientX - wheelState.pointerStartX;
    const dyMove = e.clientY - wheelState.pointerStartY;
    wheelState.dragMovedDistance = Math.hypot(dxMove, dyMove);

    if (wheelState.isDraggingWheel && wheelState.isUnlocked) {
      const nextLeft = wheelState.wheelStartLeft + dxMove;
      const nextTop = wheelState.wheelStartTop + dyMove;
      hackingWheelEl.style.left = `${nextLeft}px`;
      hackingWheelEl.style.top = `${nextTop}px`;

      const targetBox = findExpandableBoxAtPoint(e.clientX, e.clientY);
      if (targetBox !== wheelState.hoveredBox) {
        clearDropHighlight();
        if (targetBox) {
          targetBox.classList.add('drop-target-hover');
          wheelState.hoveredBox = targetBox;
        }
      }
      return;
    }

    if (wheelState.isRotating && !wheelState.isUnlocked) {
      const currentAngle = getPointerAngleFromWheel(e.clientX, e.clientY);
      if (wheelState.lastPointerAngle !== null) {
        let delta = currentAngle - wheelState.lastPointerAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        wheelState.cumulativeAngle += delta;
        wheelState.visualAngle += delta;

        if (Math.abs(wheelState.cumulativeAngle) >= REQUIRED_DEGREES) {
          wheelState.cumulativeAngle = Math.sign(wheelState.cumulativeAngle || 1) * REQUIRED_DEGREES;
          wheelState.isUnlocked = true;
          wheelState.isRotating = false;
          pushSystemLog("Wheel", "UNLOCKED_3X");
          if (navigator.vibrate) navigator.vibrate([70, 40, 70]);
        }
      }
      wheelState.lastPointerAngle = currentAngle;
      updateWheelUI();
    }
  });

  const handlePointerFinish = (e) => {
    if (hackingWheelEl.hasPointerCapture(e.pointerId)) {
      try { hackingWheelEl.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    if (wheelState.isDraggingWheel) {
      wheelState.isDraggingWheel = false;
      hackingWheelEl.classList.remove('dragging');

      const dropBox = findExpandableBoxAtPoint(e.clientX, e.clientY) || wheelState.hoveredBox;
      clearDropHighlight();

      if (dropBox) {
        expandBoxToFullscreen(dropBox);
      } else {
        hackingWheelEl.classList.remove('floating-wheel');
        hackingWheelEl.style.left = '';
        hackingWheelEl.style.top = '';
        if (hackWheelDockEl && hackingWheelEl.parentElement !== hackWheelDockEl) {
          hackWheelDockEl.appendChild(hackingWheelEl);
        }
        updateWheelUI();
      }
    }

    wheelState.isRotating = false;
    wheelState.lastPointerAngle = null;
  };

  hackingWheelEl.addEventListener('pointerup', handlePointerFinish);
  hackingWheelEl.addEventListener('pointercancel', handlePointerFinish);

  updateWheelUI();
}

/* =========================================================
   1.3. SLOW 3D GLOBE + SPEED-SPIN/DIVE + COUNTRY/STATE MAP ENGINE
   ========================================================= */
let globeScene = null;
let globeCamera = null;
let globeRenderer = null;
let globeGroup = null;
let globeMesh = null;
let globeWireframe = null;
let globePinsGroup = null;

let globeAnimState = {
  mode: 'globe', // 'globe' | 'diving' | 'map'
  slowSpinSpeedY: 0.0022, // Very slow, natural orbit speed
  burstSpinVelY: 0,
  diveProgress: 0,
  pendingMapQuery: '',
  currentMapRegion: null,
  mapZoom: 1,
  mapPanX: 0,
  mapPanY: 0
};

function createHolographicEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Deep crimson/dark holographic ocean base
  ctx.fillStyle = '#140305';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Latitude & Longitude graticule lines
  ctx.strokeStyle = 'rgba(255, 30, 39, 0.22)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 20) {
    const x = ((lon + 180) / 360) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let lat = -80; lat <= 80; lat += 20) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Stylized continent polygons in neon crimson/red
  const continents = [
    // North America
    [[-165, 65], [-130, 70], [-95, 62], [-60, 48], [-82, 26], [-105, 19], [-125, 42]],
    // South America
    [[-78, 10], [-50, 4], [-35, -8], [-45, -25], [-68, -52], [-76, -35], [-78, -5]],
    // Europe
    [[-10, 36], [5, 46], [28, 55], [40, 68], [22, 70], [8, 56], [-8, 44]],
    // Africa
    [[-17, 15], [12, 36], [34, 31], [50, 11], [40, -18], [25, -34], [14, -22], [5, 4]],
    // Asia & India
    [[42, 40], [65, 68], [135, 68], [165, 58], [140, 35], [118, 22], [103, 4], [88, 21], [77, 8], [72, 22], [60, 25], [45, 32]],
    // India highlight / subcontinent marker
    [[68, 24], [78, 34], [89, 27], [84, 17], [77, 8], [72, 20]],
    // Australia
    [[114, -22], [132, -12], [148, -18], [152, -35], [135, -34], [115, -33]]
  ];

  continents.forEach((poly, idx) => {
    ctx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * canvas.width;
      const y = ((90 - lat) / 180) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = idx === 5 ? 'rgba(255, 71, 78, 0.42)' : 'rgba(255, 30, 39, 0.24)';
    ctx.fill();
    ctx.strokeStyle = idx === 5 ? '#ff666b' : '#ff1e27';
    ctx.lineWidth = idx === 5 ? 2.6 : 1.6;
    ctx.stroke();
  });

  // Key city / country beacons on globe
  const beacons = [
    { name: 'INDIA', lon: 78.9, lat: 20.5 },
    { name: 'AP', lon: 79.7, lat: 15.9 },
    { name: 'US', lon: -98.5, lat: 39.8 },
    { name: 'UK', lon: -1.5, lat: 52.5 },
    { name: 'JP', lon: 138.2, lat: 36.2 }
  ];

  beacons.forEach(b => {
    const x = ((b.lon + 180) / 360) * canvas.width;
    const y = ((90 - b.lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff474e';
    ctx.fill();
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffdede';
    ctx.fillText(b.name, x + 7, y + 4);
  });

  return new THREE.CanvasTexture(canvas);
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function initSlow3DGlobe() {
  const canvas = document.getElementById('slowGlobeCanvas');
  const viewport = document.getElementById('globeViewport');
  if (!canvas || !viewport || typeof THREE === 'undefined') return;

  const width = Math.max(120, viewport.clientWidth || 220);
  const height = Math.max(90, viewport.clientHeight || 120);

  globeScene = new THREE.Scene();
  globeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  globeCamera.position.set(0, 0, 6.2);

  globeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  globeRenderer.setSize(width, height, false);
  globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const ambient = new THREE.AmbientLight(0xff3b42, 1.1);
  globeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xff474e, 1.4);
  keyLight.position.set(6, 5, 8);
  globeScene.add(keyLight);

  globeGroup = new THREE.Group();
  globeScene.add(globeGroup);

  const earthTex = createHolographicEarthTexture();
  const sphereGeo = new THREE.SphereGeometry(2.15, 48, 48);
  const sphereMat = new THREE.MeshPhongMaterial({
    map: earthTex,
    emissive: new THREE.Color(0x3b0407),
    emissiveIntensity: 0.45,
    shininess: 35,
    transparent: true,
    opacity: 0.96
  });
  globeMesh = new THREE.Mesh(sphereGeo, sphereMat);
  globeGroup.add(globeMesh);

  // Subtle holographic latitude/longitude cage around the sphere
  const wireGeo = new THREE.SphereGeometry(2.18, 18, 12);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xff1e27,
    wireframe: true,
    transparent: true,
    opacity: 0.14
  });
  globeWireframe = new THREE.Mesh(wireGeo, wireMat);
  globeGroup.add(globeWireframe);

  // 3D Location markers on globe surface
  globePinsGroup = new THREE.Group();
  const points = [
    { lat: 20.5, lon: 78.9 },
    { lat: 15.9, lon: 79.7 },
    { lat: 39.8, lon: -98.5 },
    { lat: 28.6, lon: 77.2 }
  ];
  points.forEach(pt => {
    const pos = latLonToVector3(pt.lat, pt.lon, 2.2);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff666b })
    );
    dot.position.copy(pos);
    globePinsGroup.add(dot);
  });
  globeGroup.add(globePinsGroup);

  setupGlobeTouchAndMouseControls(viewport);
  animateSlowGlobe();
}

function resizeSlowGlobeViewport() {
  const viewport = document.getElementById('globeViewport');
  if (!viewport || !globeRenderer || !globeCamera) return;
  const w = Math.max(120, viewport.clientWidth || 220);
  const h = Math.max(90, viewport.clientHeight || 120);
  globeCamera.aspect = w / h;
  globeCamera.updateProjectionMatrix();
  globeRenderer.setSize(w, h, false);
}

function setupGlobeTouchAndMouseControls(viewport) {
  if (!viewport) return;

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let pinchStartDist = 0;
  let pinchStartCamZ = 6.2;

  function getDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  viewport.addEventListener('pointerdown', (e) => {
    if (globeAnimState.mode === 'map') return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!isDragging || globeAnimState.mode === 'map' || !globeGroup) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // 1-finger / pointer free ball rotation in any direction
    globeGroup.rotation.y += dx * 0.012;
    globeGroup.rotation.x += dy * 0.012;
    globeGroup.rotation.x = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, globeGroup.rotation.x));
  });

  const stopDrag = () => { isDragging = false; };
  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointercancel', stopDrag);

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      pinchStartDist = getDist(e.touches[0], e.touches[1]);
      if (globeAnimState.mode === 'map') {
        pinchStartCamZ = globeAnimState.mapZoom;
      } else if (globeCamera) {
        pinchStartCamZ = globeCamera.position.z;
      }
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      if (globeAnimState.mode === 'map') {
        globeAnimState.mapPanX += dx;
        globeAnimState.mapPanY += dy;
        applyMapTransform();
      } else if (globeGroup) {
        globeGroup.rotation.y += dx * 0.013;
        globeGroup.rotation.x += dy * 0.013;
        globeGroup.rotation.x = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, globeGroup.rotation.x));
      }
    } else if (e.touches.length === 2 && pinchStartDist > 0) {
      const curDist = getDist(e.touches[0], e.touches[1]);
      const ratio = curDist / pinchStartDist;
      if (globeAnimState.mode === 'map') {
        globeAnimState.mapZoom = Math.max(0.6, Math.min(4.5, pinchStartCamZ * ratio));
        applyMapTransform();
      } else if (globeCamera) {
        // Two fingers zoom in / zoom out
        const nextZ = pinchStartCamZ / ratio;
        globeCamera.position.z = Math.max(2.9, Math.min(11.5, nextZ));
      }
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDist = 0;
    if (e.touches.length === 0) isDragging = false;
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (globeAnimState.mode === 'map') {
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      globeAnimState.mapZoom = Math.max(0.6, Math.min(4.5, globeAnimState.mapZoom * factor));
      applyMapTransform();
    } else if (globeCamera) {
      globeCamera.position.z = Math.max(2.9, Math.min(11.5, globeCamera.position.z + e.deltaY * 0.004));
    }
  }, { passive: false });
}

function animateSlowGlobe() {
  requestAnimationFrame(animateSlowGlobe);
  if (!globeRenderer || !globeScene || !globeCamera || !globeGroup) return;

  if (globeAnimState.mode === 'globe') {
    // Smooth, slow normal speed rotation
    globeGroup.rotation.y += globeAnimState.slowSpinSpeedY;
  } else if (globeAnimState.mode === 'diving') {
    // Fast spin + zoom dive into the globe before revealing the requested map
    globeAnimState.burstSpinVelY = Math.min(0.26, globeAnimState.burstSpinVelY + 0.016);
    globeGroup.rotation.y += globeAnimState.burstSpinVelY;
    globeAnimState.diveProgress += 0.032;

    const easeT = Math.min(1, globeAnimState.diveProgress);
    globeCamera.position.z = THREE.MathUtils.lerp(6.2, 2.35, easeT);
    globeGroup.scale.setScalar(THREE.MathUtils.lerp(1, 1.55, easeT));

    if (globeAnimState.diveProgress >= 1) {
      const targetQuery = globeAnimState.pendingMapQuery;
      globeAnimState.mode = 'map';
      globeAnimState.burstSpinVelY = 0;
      globeCamera.position.z = 6.2;
      globeGroup.scale.setScalar(1);
      renderRequestedGeoMap(targetQuery);
    }
  }

  globeRenderer.render(globeScene, globeCamera);
}

function returnToSlow3DGlobe() {
  const overlay = document.getElementById('mapOverlayStage');
  const titleEl = document.getElementById('globeTitleLabel');
  const captionEl = document.getElementById('globeStatusCaption');
  const badgeEl = document.getElementById('globeModeBadge');

  if (overlay) overlay.style.display = 'none';
  if (titleEl) titleEl.innerText = 'GLOBAL_3D_SCAN';
  if (captionEl) captionEl.innerText = 'SLOW ORBIT • 1F ROTATE • 2F ZOOM';
  if (badgeEl) badgeEl.innerText = 'SLOW_3D';

  globeAnimState.mode = 'globe';
  globeAnimState.diveProgress = 0;
  globeAnimState.burstSpinVelY = 0;
  globeAnimState.mapZoom = 1;
  globeAnimState.mapPanX = 0;
  globeAnimState.mapPanY = 0;

  if (globeGroup) globeGroup.scale.setScalar(1);
  if (globeCamera) globeCamera.position.z = 6.2;

  pushSystemLog("Globe", "SLOW_ORBIT_RESTORED");
}

function applyMapTransform() {
  const wrap = document.getElementById('mapVisualCanvasWrap');
  if (!wrap) return;
  wrap.style.transform = `translate(${globeAnimState.mapPanX}px, ${globeAnimState.mapPanY}px) scale(${globeAnimState.mapZoom})`;
}

function triggerGlobeToMapTransition(rawQuery) {
  const cleaned = (rawQuery || '').trim();
  if (!cleaned) return;

  const badgeEl = document.getElementById('globeFormatBadge');
  const captionEl = document.getElementById('globeStatusCaption');
  const modeBadge = document.getElementById('globeModeBadge');

  const lower = cleaned.toLowerCase();
  const wantsStates = lower.includes('state') || lower.includes('with states') || lower.includes(', states');
  const wantsNames = lower.includes('name') || lower.includes('names') || lower.includes('with names');

  if (badgeEl) {
    if (wantsStates && wantsNames) badgeEl.innerText = 'STATES+NAMES';
    else if (wantsStates) badgeEl.innerText = 'WITH_STATES';
    else if (wantsNames) badgeEl.innerText = 'WITH_NAMES';
    else badgeEl.innerText = 'OUTLINE_ONLY';
  }

  if (captionEl) captionEl.innerText = `LOCKING TARGET: ${cleaned.toUpperCase()}...`;
  if (modeBadge) modeBadge.innerText = 'ZOOM_LOCK';

  globeAnimState.pendingMapQuery = cleaned;
  globeAnimState.diveProgress = 0;
  globeAnimState.burstSpinVelY = 0.05;
  globeAnimState.mode = 'diving';

  pushSystemLog("GeoScan", cleaned.toUpperCase());
}

function renderRequestedGeoMap(queryText) {
  const overlay = document.getElementById('mapOverlayStage');
  const mapWrap = document.getElementById('mapVisualCanvasWrap');
  const calloutLayer = document.getElementById('mapCalloutLayer');
  const titleEl = document.getElementById('globeTitleLabel');
  const captionEl = document.getElementById('globeStatusCaption');
  const modeBadge = document.getElementById('globeModeBadge');

  if (!overlay || !mapWrap || !calloutLayer) return;

  const q = queryText.toLowerCase();
  const showStates = q.includes('state') || q.includes('with states') || q.includes(', states') || q.includes('ap') || q.includes('andhra');
  const showNames = q.includes('name') || q.includes('names') || q.includes('with names') || q.includes('label');

  globeAnimState.mapZoom = 1;
  globeAnimState.mapPanX = 0;
  globeAnimState.mapPanY = 0;
  applyMapTransform();
  calloutLayer.innerHTML = '';

  let svgContent = '';
  let callouts = [];

  if (q.includes('ap') || q.includes('andhra')) {
    if (titleEl) titleEl.innerText = showNames ? 'AP_MAP // NAMES' : 'AP_MAP // REGION';
    svgContent = `
      <svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg">
        <path d="M25,65 L75,45 L130,38 L185,55 L210,85 L165,112 L120,132 L72,145 L32,115 Z"
              fill="rgba(255,30,39,0.22)" stroke="#ff1e27" stroke-width="2.5"/>
        ${showStates ? `
          <line x1="85" y1="44" x2="92" y2="140" stroke="#ff474e" stroke-width="1.2" stroke-dasharray="3,2"/>
          <line x1="135" y1="42" x2="122" y2="132" stroke="#ff474e" stroke-width="1.2" stroke-dasharray="3,2"/>
          <line x1="35" y1="95" x2="188" y2="85" stroke="#ff474e" stroke-width="1.2" stroke-dasharray="3,2"/>
        ` : ''}
        ${showNames ? `
          <text x="62" y="75" fill="#ffdede" font-size="9" font-family="monospace">Rayalaseema</text>
          <text x="115" y="72" fill="#ffdede" font-size="9" font-family="monospace">Amaravati / Guntur</text>
          <text x="145" y="102" fill="#ffdede" font-size="9" font-family="monospace">Coastal AP</text>
        ` : ''}
      </svg>
    `;
    if (showNames) {
      callouts = [
        { top: '24%', left: '54%', text: '↗ Guntur / ANU' },
        { top: '66%', left: '58%', text: '↙ Bay of Bengal' }
      ];
    }
  } else if (q.includes('us') || q.includes('usa') || q.includes('united states') || q.includes('texas') || q.includes('california')) {
    if (titleEl) titleEl.innerText = showNames ? 'US_MAP // STATES+NAMES' : (showStates ? 'US_MAP // STATES' : 'US_MAP // OUTLINE');
    svgContent = `
      <svg viewBox="0 0 260 160" xmlns="http://www.w3.org/2000/svg">
        <path d="M22,35 L195,35 L228,55 L212,102 L175,112 L152,135 L125,112 L65,112 L25,95 Z"
              fill="rgba(255,30,39,0.2)" stroke="#ff1e27" stroke-width="2.4"/>
        ${showStates ? `
          <line x1="75" y1="35" x2="75" y2="112" stroke="#ff474e" stroke-width="1.1"/>
          <line x1="135" y1="35" x2="135" y2="122" stroke="#ff474e" stroke-width="1.1"/>
          <line x1="185" y1="35" x2="185" y2="108" stroke="#ff474e" stroke-width="1.1"/>
          <line x1="25" y1="74" x2="220" y2="74" stroke="#ff474e" stroke-width="1.1"/>
        ` : ''}
        ${showNames ? `
          <text x="36" y="62" fill="#ffdede" font-size="8.5" font-family="monospace">California</text>
          <text x="112" y="96" fill="#ffdede" font-size="8.5" font-family="monospace">Texas</text>
        ` : ''}
      </svg>
    `;
    if (showNames) {
      callouts = [
        { top: '18%', left: '56%', text: '↗ New York / East' },
        { top: '70%', left: '52%', text: '↙ Gulf Coast' }
      ];
    }
  } else {
    // Default India map with configurable state borders and external callout arrows for small/compact states
    if (titleEl) {
      if (showStates && showNames) titleEl.innerText = 'INDIA // STATES + NAMES';
      else if (showStates) titleEl.innerText = 'INDIA // WITH STATES';
      else if (showNames) titleEl.innerText = 'INDIA // WITH NAMES';
      else titleEl.innerText = 'INDIA // MAP ONLY';
    }

    svgContent = `
      <svg viewBox="0 0 220 240" xmlns="http://www.w3.org/2000/svg">
        <!-- Stylized India Outline -->
        <path d="M72,18 L108,24 L118,46 L96,62 L126,84 L166,94 L156,118 L132,126 L124,154 L106,192 L88,224 L74,186 L62,152 L42,124 L54,96 L66,68 L52,42 Z"
              fill="rgba(255,30,39,0.22)" stroke="#ff1e27" stroke-width="2.5"/>
        ${showStates ? `
          <!-- State Border Divisions -->
          <path d="M56,64 L104,64" stroke="#ff474e" stroke-width="1.2"/>
          <path d="M48,96 L146,102" stroke="#ff474e" stroke-width="1.2"/>
          <path d="M52,126 L132,126" stroke="#ff474e" stroke-width="1.2"/>
          <path d="M95,62 L92,185" stroke="#ff474e" stroke-width="1.2"/>
          <path d="M126,84 L115,156" stroke="#ff474e" stroke-width="1.2"/>
          <path d="M66,152 L114,156" stroke="#ff474e" stroke-width="1.2"/>
        ` : ''}
        ${showNames ? `
          <text x="64" y="46" fill="#ffdede" font-size="8" font-family="monospace">North</text>
          <text x="62" y="114" fill="#ffdede" font-size="8" font-family="monospace">Central</text>
          <text x="116" y="112" fill="#ffdede" font-size="7.5" font-family="monospace">East</text>
          <text x="76" y="174" fill="#ffdede" font-size="8" font-family="monospace">AP / South</text>
        ` : ''}
      </svg>
    `;

    if (showNames) {
      // External arrow callouts pointing outside when labels can't fit inside small/dense zones
      callouts = [
        { top: '12%', left: '54%', text: '↗ Delhi / NCR' },
        { top: '38%', left: '58%', text: '↗ Bihar / WB' },
        { top: '72%', left: '54%', text: '↘ Andhra Pradesh' }
      ];
    }
  }

  mapWrap.innerHTML = svgContent;
  callouts.forEach(c => {
    const el = document.createElement('div');
    el.className = 'map-callout-item';
    el.style.top = c.top;
    el.style.left = c.left;
    el.innerText = c.text;
    calloutLayer.appendChild(el);
  });

  overlay.style.display = 'flex';
  if (captionEl) captionEl.innerText = `${queryText.toUpperCase()} • 1F PAN • 2F ZOOM`;
  if (modeBadge) modeBadge.innerText = 'MAP_LOCK';
}

function initGlobeSearchControls() {
  const geoInput = document.getElementById('geoQueryInput');
  const geoBtn = document.getElementById('geoSearchBtn');
  const resetBtn = document.getElementById('resetGlobeBtn');
  const quickTags = document.querySelectorAll('.geo-tag-btn');

  if (geoBtn && geoInput) {
    geoBtn.addEventListener('click', () => {
      const val = geoInput.value.trim();
      if (val) triggerGlobeToMapTransition(val);
    });

    geoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = geoInput.value.trim();
        if (val) triggerGlobeToMapTransition(val);
      }
    });
  }

  quickTags.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-geo') || '';
      if (geoInput) geoInput.value = val;
      if (val) triggerGlobeToMapTransition(val);
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', returnToSlow3DGlobe);
  }
}

/* =========================================================
   1.4. IN-APP YOUTUBE HOLOGRAPHIC WORKSPACE MODAL
   ========================================================= */
function ensureYouTubeModalExists() {
  let modal = document.getElementById('youtube-workspace-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'youtube-workspace-modal';
    modal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.88); z-index:99999; justify-content:center; align-items:center;";

    modal.innerHTML = `
      <div style="width:96%; max-width:1100px; height:90vh; background:#090204; border:2px solid #ff1e27; box-shadow:0 0 35px rgba(255,30,39,0.65); display:flex; flex-direction:column; border-radius:10px; overflow:hidden; font-family:monospace; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(30,4,7,0.96); border-bottom:1px solid #ff1e27; z-index:10;">
          <span style="color:#ff3b42; font-weight:bold; font-size:12px; letter-spacing:1px;">🔴 YOUTUBE HOLOGRAPHIC STREAM ACTIVE</span>
          <button id="close-youtube-box" style="background:none; border:none; color:#ff3366; font-size:20px; font-weight:bold; cursor:pointer;">✕</button>
        </div>
        <div style="flex:1; width:100%; background:#000; position:relative; display:flex; justify-content:center; align-items:center;">
          <iframe id="youtube-frame" src="" style="width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        <div style="padding:12px; background:rgba(20,3,5,0.96); border-top:1px solid rgba(255,30,39,0.4); display:flex; gap:10px; z-index:10;">
          <input type="text" id="youtube-search-input" placeholder="Paste YouTube video link or type search term..." style="flex:2; background:rgba(35,5,8,0.9); border:1px solid #ff1e27; color:#ffcccc; padding:9px; outline:none; font-family:monospace;">
          <button id="youtube-search-btn" style="flex:1; background:rgba(65,8,13,0.95); border:1px solid #ff1e27; color:#ff3b42; padding:9px; font-weight:bold; cursor:pointer;">PLAY / SEARCH</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-youtube-box').addEventListener('click', closeYouTubeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeYouTubeModal();
    });

    document.getElementById('youtube-search-btn').addEventListener('click', () => {
      const query = document.getElementById('youtube-search-input').value.trim();
      if (query) loadYouTubeSearch(query);
    });
  }
}

function openYouTubeModal(searchQuery = "") {
  ensureYouTubeModalExists();
  const modal = document.getElementById('youtube-workspace-modal');
  if (modal) {
    modal.style.display = 'flex';
    const searchInputEl = document.getElementById('youtube-search-input');
    if (searchQuery) {
      if (searchInputEl) searchInputEl.value = searchQuery;
      loadYouTubeSearch(searchQuery);
    } else {
      if (searchInputEl) searchInputEl.value = "";
      const iframe = document.getElementById('youtube-frame');
      if (iframe) iframe.src = "https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1";
    }
    pushSystemLog("YouTube", "OPENED");
  }
}

function closeYouTubeModal() {
  const modal = document.getElementById('youtube-workspace-modal');
  if (modal) {
    modal.style.display = 'none';
    const iframe = document.getElementById('youtube-frame');
    if (iframe) iframe.src = "";
    pushSystemLog("YouTube", "CLOSED");
  }
}

function loadYouTubeSearch(query) {
  const iframe = document.getElementById('youtube-frame');
  if (!iframe) return;
  let videoId = "";
  const cleanUrl = query.trim();

  if (cleanUrl.includes('youtube.com/watch?v=')) {
    try {
      const urlParams = new URLSearchParams(new URL(cleanUrl).search);
      videoId = urlParams.get('v');
    } catch (e) {}
  } else if (cleanUrl.includes('youtu.be/')) {
    videoId = cleanUrl.split('youtu.be/')[1]?.split('?')[0];
  } else if (cleanUrl.match(/^[a-zA-Z0-9_-]{11}$/)) {
    videoId = cleanUrl;
  }

  if (videoId) {
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
  } else {
    iframe.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(cleanUrl)}&autoplay=1`;
  }
}

/* =========================================================
   1.5. MAP POINTING PIN & BLUE HOLOGRAPHIC BLUEPRINT GENERATOR
   ========================================================= */
function createMapPinCanvas(fileLabel) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(48, 115);
  ctx.bezierCurveTo(15, 75, 8, 50, 8, 38);
  ctx.arc(48, 38, 40, Math.PI, 0, false);
  ctx.bezierCurveTo(88, 50, 81, 75, 48, 115);
  ctx.closePath();

  ctx.fillStyle = '#00f3ff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(48, 38, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#000f1e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00f3ff';
  ctx.stroke();

  ctx.fillStyle = '#00f3ff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fileLabel.toUpperCase(), 48, 38);

  return canvas;
}

function attachMapPinToMesh(mesh, fileLabel) {
  const oldPin = mesh.getObjectByName("mapPin");
  if (oldPin) mesh.remove(oldPin);

  const pinCanvas = createMapPinCanvas(fileLabel);
  const pinTexture = new THREE.CanvasTexture(pinCanvas);
  const pinGeo = new THREE.PlaneGeometry(2.2, 2.8);
  const pinMat = new THREE.MeshBasicMaterial({
    map: pinTexture,
    transparent: true,
    side: THREE.DoubleSide
  });
  const pinMesh = new THREE.Mesh(pinGeo, pinMat);
  pinMesh.name = "mapPin";
  pinMesh.position.set(0, 7.4, 0.1);
  mesh.add(pinMesh);
}

/* =========================================================
   1.6. IN-APP 3D WORKSPACE MODAL & HOLOGRAM ENGINE
   ========================================================= */
let scene3DBox, camera3DBox, renderer3DBox, desktopGroup3D;
let loadedObjects3D = [];
let selectedObject3D = null;
let touches3D = [];
let isMouseDown3D = false;
let prevMousePos3D = { x: 0, y: 0 };
let audioCtx3D = null;
let hologramRiseProgress = 0;

function playTrashSound3D() {
  try {
    if (!audioCtx3D) audioCtx3D = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx3D.state === 'suspended') audioCtx3D.resume();
    const osc = audioCtx3D.createOscillator();
    const gain = audioCtx3D.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, audioCtx3D.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx3D.currentTime + 0.3);
    gain.gain.setValueAtTime(0.5, audioCtx3D.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx3D.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx3D.destination);
    osc.start();
    osc.stop(audioCtx3D.currentTime + 0.3);
  } catch (e) {}
}

function ensure3DModalExists() {
  let modal = document.getElementById('td-workspace-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'td-workspace-modal';
    modal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.88); z-index:99999; justify-content:center; align-items:center;";

    modal.innerHTML = `
      <div style="width:96%; max-width:1100px; height:92vh; background:#000f1e; border:2px solid #00ffff; box-shadow:0 0 40px rgba(0,255,255,0.7); display:flex; flex-direction:column; border-radius:12px; overflow:hidden; font-family:monospace; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px; background:rgba(0,30,60,0.95); border-bottom:1px solid #00ffff; z-index:10;">
          <span id="td-hud-status" style="color:#00ffff; font-weight:bold; font-size:12px; letter-spacing:1px;">3D WORKSPACE EXPANDED (1-Finger Rotate | 2-Finger Move & Pinch Zoom)</span>
          <button id="close-td-box" style="background:none; border:none; color:#ff3366; font-size:20px; font-weight:bold; cursor:pointer;">✕</button>
        </div>

        <div id="td-box-viewport" style="flex:1; width:100%; background:#010814; position:relative; overflow:hidden;"></div>

        <div id="fullscreen-projection-layer" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(1,8,20,0.96); z-index:50; flex-direction:column; justify-content:space-between; padding:18px; box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #00ffff; padding-bottom:10px;">
            <span style="color:#00ffff; font-weight:bold; font-size:13px; letter-spacing:1px;">⚡ HOLOGRAPHIC PROJECTION SCREEN ACTIVE</span>
            <span style="color:#ff3366; font-size:12px; font-weight:bold;">Say 'go back' or close to exit</span>
          </div>
          <div id="projection-grid-container" style="flex:1; display:grid; gap:10px; padding:14px; overflow:hidden;"></div>
          <div id="projection-bottom-hud" style="width:100%; height:44px; background:rgba(0,30,60,0.9); border:1px solid #00ffff; border-radius:8px; display:flex; align-items:center; padding:0 14px; box-sizing:border-box; gap:10px; overflow-x:auto;">
            <span style="color:#00ffff; font-size:11px; font-weight:bold;">ACTIVE FILES:</span>
            <div id="projection-hud-badges" style="display:flex; gap:8px;"></div>
          </div>
        </div>

        <div id="td-trash-bin" title="Drag object here to delete" style="position:absolute; bottom:85px; left:50%; transform:translateX(-50%); width:48px; height:48px; background:rgba(255,0,60,0.2); border:2px dashed #ff0055; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; color:#ff0055; box-shadow:0 0 15px rgba(255,0,85,0.4); z-index:20; transition:all 0.3s ease; pointer-events:none;">🗑️</div>

        <div style="padding:14px; background:rgba(0,20,40,0.95); border-top:1px solid rgba(0,243,255,0.4); display:flex; flex-direction:column; gap:10px; z-index:10;">
          <div style="display:flex; gap:10px; width:100%;">
            <input type="text" id="td-box-input" placeholder="Type text here..." style="flex:2; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:9px; outline:none; font-family:monospace;">
            <button id="td-box-spawn" style="flex:1; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:9px; font-weight:bold; cursor:pointer;">SPAWN TEXT</button>
          </div>
          <button id="td-upload-btn" style="width:100%; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:9px; font-weight:bold; cursor:pointer;">UPLOAD BLUEPRINT IMAGE</button>
          <input type="file" id="td-file-input" accept="image/*" style="display:none;">
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-td-box').addEventListener('click', close3DWorkspaceModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close3DWorkspaceModal();
    });

    document.getElementById('td-box-spawn').addEventListener('click', spawn3DTextFromInput);
    document.getElementById('td-upload-btn').addEventListener('click', () => {
      document.getElementById('td-file-input').click();
    });
    document.getElementById('td-file-input').addEventListener('change', handle3DBlueprintUpload);
  }
}

function open3DWorkspaceModal() {
  ensure3DModalExists();
  const modal = document.getElementById('td-workspace-modal');
  if (modal) {
    modal.style.display = 'flex';
    hologramRiseProgress = 0;
    init3DBoxScene();
    pushSystemLog("3D Table", "ACTIVE");
  }
}

function close3DWorkspaceModal() {
  const modal = document.getElementById('td-workspace-modal');
  if (modal) {
    modal.style.display = 'none';
    pushSystemLog("3D Table", "IDLE");
  }
}

function init3DBoxScene() {
  const viewport = document.getElementById('td-box-viewport');
  if (!viewport || viewport.hasChildNodes() || typeof THREE === 'undefined') return;

  scene3DBox = new THREE.Scene();
  scene3DBox.background = new THREE.Color(0x010814);

  camera3DBox = new THREE.PerspectiveCamera(60, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
  camera3DBox.position.set(0, 25, 65);
  camera3DBox.lookAt(0, 0, 0);

  renderer3DBox = new THREE.WebGLRenderer({ antialias: true });
  renderer3DBox.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer3DBox.setPixelRatio(window.devicePixelRatio);
  viewport.appendChild(renderer3DBox.domElement);

  scene3DBox.add(new THREE.AmbientLight(0x00ffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(20, 40, 20);
  scene3DBox.add(dirLight);

  desktopGroup3D = new THREE.Group();
  desktopGroup3D.position.set(0, -40, 0);
  scene3DBox.add(desktopGroup3D);

  const gridHelper = new THREE.GridHelper(180, 180, 0x00ffff, 0x003355);
  desktopGroup3D.add(gridHelper);

  loadedObjects3D = [];
  selectedObject3D = null;
  workspaceFiles3D = [];

  setup3DInteractions(viewport);

  function animateBoxScene() {
    requestAnimationFrame(animateBoxScene);
    if (hologramRiseProgress < 1) {
      hologramRiseProgress += 0.03;
      desktopGroup3D.position.y = THREE.MathUtils.lerp(-40, -8, hologramRiseProgress);
    }
    if (renderer3DBox && scene3DBox && camera3DBox) {
      renderer3DBox.render(scene3DBox, camera3DBox);
    }
  }
  animateBoxScene();
}

function addBase64ImageTo3DWorkspace(base64FullData, mimeType = 'image/png', fileName = 'generated.png') {
  if (typeof THREE === 'undefined') return null;
  if (!desktopGroup3D) {
    open3DWorkspaceModal();
  }
  if (!desktopGroup3D) return null;

  const fileLabel = `f${workspaceFiles3D.length + 1}`;
  const base64DataOnly = base64FullData.includes(',') ? base64FullData.split(',')[1] : base64FullData;

  const img = new Image();
  img.src = base64FullData;
  img.onload = () => {
    const origTexture = new THREE.TextureLoader().load(base64FullData);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width || 512;
    canvas.height = img.height || 512;

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = 0;
      data[i + 1] = avg * 0.9;
      data[i + 2] = avg * 1.2;
    }
    ctx.putImageData(imgData, 0, 0);

    const threeDTexture = new THREE.CanvasTexture(canvas);
    const aspect = canvas.width / canvas.height;
    const geometry = new THREE.PlaneGeometry(14 * aspect, 14);
    const material = new THREE.MeshBasicMaterial({
      map: threeDTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 10, 0);

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.name = "outline";
    wireframe.visible = false;
    mesh.add(wireframe);

    attachMapPinToMesh(mesh, fileLabel);

    desktopGroup3D.add(mesh);
    loadedObjects3D.push(mesh);

    workspaceFiles3D.push({
      label: fileLabel,
      mesh: mesh,
      type: 'image',
      mode: '3d',
      originalTexture: origTexture,
      threeDTexture: threeDTexture,
      mimeType: mimeType,
      data: base64DataOnly,
      fileName: fileName,
      isNatural: false,
      isDeleted: false,
      originalPosition: mesh.position.clone(),
      originalScale: mesh.scale.clone()
    });

    updateTelemetryCounters();
    const hud = document.getElementById('td-hud-status');
    if (hud) hud.innerText = `IMAGE LOADED AS ${fileLabel.toUpperCase()} WITH BLUE HOLOGRAPHIC TINT.`;
  };

  return fileLabel;
}

function spawn3DTextFromInput() {
  const textInput = document.getElementById('td-box-input');
  const hud = document.getElementById('td-hud-status');
  if (!textInput || typeof THREE === 'undefined') return;
  const val = textInput.value.trim();
  if (!val) return;

  const fileLabel = `f${workspaceFiles3D.length + 1}`;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 512;

  ctx.fillStyle = '#000f1e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00ffff';
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(val, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(12, 12);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 10, 0);

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.name = "outline";
  wireframe.visible = false;
  mesh.add(wireframe);

  attachMapPinToMesh(mesh, fileLabel);

  desktopGroup3D.add(mesh);
  loadedObjects3D.push(mesh);

  workspaceFiles3D.push({
    label: fileLabel,
    mesh: mesh,
    type: 'text',
    mode: '3d',
    content: val,
    isNatural: false,
    isDeleted: false,
    originalPosition: mesh.position.clone(),
    originalScale: mesh.scale.clone()
  });

  textInput.value = '';
  updateTelemetryCounters();
  if (hud) hud.innerText = `TEXT SPAWNED AS ${fileLabel.toUpperCase()}.`;
}

function handle3DBlueprintUpload(e) {
  const file = e.target.files[0];
  if (!file || typeof THREE === 'undefined') return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    addBase64ImageTo3DWorkspace(evt.target.result, file.type, file.name);
  };
  reader.readAsDataURL(file);
  this.value = '';
}

function update3DFileDisplayMode(fileLabel, makeNormal) {
  const target = workspaceFiles3D.find(f => f.label.toLowerCase() === fileLabel.toLowerCase() && !f.isDeleted);
  if (!target || target.type !== 'image') return false;

  target.isNatural = makeNormal;
  target.mesh.material.map = makeNormal ? target.originalTexture : target.threeDTexture;
  target.mesh.material.needsUpdate = true;
  return true;
}

function updateAll3DFilesMode(makeNormal) {
  workspaceFiles3D.forEach(f => {
    if (!f.isDeleted && f.type === 'image') {
      f.isNatural = makeNormal;
      f.mesh.material.map = makeNormal ? f.originalTexture : f.threeDTexture;
      f.mesh.material.needsUpdate = true;
    }
  });
}

/* =========================================================
   1.7. FULLSCREEN PROJECTION LAYER & 3D TOUCH CONTROLS
   ========================================================= */
let activeFullscreenFilesState = [];
let fullscreenFilesNaturalMap = {};

function handleFullscreenFiles(labelsArray, isNatural = false) {
  const activeFiles = workspaceFiles3D.filter(f => !f.isDeleted && labelsArray.includes(f.label.toLowerCase()));
  if (activeFiles.length === 0) return false;

  activeFullscreenFilesState = activeFiles;
  activeFiles.forEach(f => {
    const key = f.label.toLowerCase();
    if (fullscreenFilesNaturalMap[key] === undefined || isNatural !== undefined) {
      fullscreenFilesNaturalMap[key] = isNatural;
    }
  });

  const projLayer = document.getElementById('fullscreen-projection-layer');
  const gridContainer = document.getElementById('projection-grid-container');
  if (!projLayer || !gridContainer) return false;

  projLayer.style.display = 'flex';
  renderFullscreenGrid();
  return true;
}

function updateFullscreenSingleFileMode(fileLabel, makeNormal) {
  const target = activeFullscreenFilesState.find(f => f.label.toLowerCase() === fileLabel.toLowerCase());
  if (target) {
    fullscreenFilesNaturalMap[fileLabel.toLowerCase()] = makeNormal;
    renderFullscreenGrid();
    return true;
  }
  return false;
}

function updateFullscreenAllFilesMode(makeNormal) {
  activeFullscreenFilesState.forEach(f => {
    fullscreenFilesNaturalMap[f.label.toLowerCase()] = makeNormal;
  });
  renderFullscreenGrid();
}

function renderFullscreenGrid() {
  const gridContainer = document.getElementById('projection-grid-container');
  const hudBadges = document.getElementById('projection-hud-badges');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';
  if (hudBadges) hudBadges.innerHTML = '';

  const activeFiles = activeFullscreenFilesState;
  const count = activeFiles.length;

  if (count === 1) {
    gridContainer.style.gridTemplateColumns = '1fr';
    gridContainer.style.gridTemplateRows = '1fr';
  } else if (count === 2) {
    gridContainer.style.gridTemplateColumns = '1fr 1fr';
    gridContainer.style.gridTemplateRows = '1fr';
  } else if (count === 3 || count === 4) {
    gridContainer.style.gridTemplateColumns = '1fr 1fr';
    gridContainer.style.gridTemplateRows = '1fr 1fr';
  } else {
    gridContainer.style.gridTemplateColumns = '1fr 1fr';
    gridContainer.style.gridTemplateRows = '1fr 1fr 1fr';
  }

  activeFiles.forEach((fileObj) => {
    const card = document.createElement('div');
    card.style.cssText = "background:rgba(0,30,60,0.85); border:2px solid #00ffff; box-shadow:0 0 20px rgba(0,255,255,0.4); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; overflow:hidden; padding:10px;";

    let contentHTML = '';
    const isNaturalFile = fullscreenFilesNaturalMap[fileObj.label.toLowerCase()] || false;

    if (fileObj.type === 'text') {
      contentHTML = `<div style="color:#00ffff; font-size:18px; font-weight:bold; text-align:center; padding:10px; font-family:monospace;">${fileObj.content}</div>`;
    } else {
      let imgSrc = '';
      if (isNaturalFile) {
        imgSrc = fileObj.originalTexture && fileObj.originalTexture.image ? fileObj.originalTexture.image.src : `data:${fileObj.mimeType};base64,${fileObj.data}`;
      } else {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        const img = new Image();
        img.src = `data:${fileObj.mimeType};base64,${fileObj.data}`;
        tempCanvas.width = img.width || 500;
        tempCanvas.height = img.height || 500;
        tempCtx.drawImage(img, 0, 0);
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = 0;
          data[i + 1] = avg * 0.9;
          data[i + 2] = avg * 1.2;
        }
        tempCtx.putImageData(imgData, 0, 0);
        imgSrc = tempCanvas.toDataURL();
      }
      contentHTML = `<img src="${imgSrc}" style="max-width:100%; max-height:85%; object-fit:contain; border-radius:4px; border:1px solid rgba(0,243,255,0.6);" />`;
    }

    card.innerHTML = `
      <div style="position:absolute; top:8px; left:10px; background:rgba(0,15,30,0.9); border:1px solid #00ffff; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; color:#00ffff; font-weight:bold; font-size:12px;">${fileObj.label.toUpperCase()}</div>
      ${contentHTML}
    `;
    gridContainer.appendChild(card);

    if (hudBadges) {
      const badge = document.createElement('span');
      badge.style.cssText = "background:rgba(0,243,255,0.2); border:1px solid #00ffff; color:#00ffff; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:bold;";
      badge.innerText = fileObj.label.toUpperCase();
      hudBadges.appendChild(badge);
    }
  });
}

function closeFullscreenProjection() {
  const projLayer = document.getElementById('fullscreen-projection-layer');
  if (projLayer) projLayer.style.display = 'none';
  activeFullscreenFilesState = [];
  fullscreenFilesNaturalMap = {};
}

function checkTrashCollision3D(clientX, clientY) {
  const trashBin = document.getElementById('td-trash-bin');
  if (!trashBin) return false;
  const rect = trashBin.getBoundingClientRect();
  return (
    clientX >= rect.left - 20 &&
    clientX <= rect.right + 20 &&
    clientY >= rect.top - 20 &&
    clientY <= rect.bottom + 20
  );
}

function deleteSelectedObject3D() {
  if (!selectedObject3D) return;
  playTrashSound3D();
  const found = workspaceFiles3D.find(f => f.mesh === selectedObject3D);
  if (found) found.isDeleted = true;
  desktopGroup3D.remove(selectedObject3D);
  const index = loadedObjects3D.indexOf(selectedObject3D);
  if (index > -1) loadedObjects3D.splice(index, 1);
  selectedObject3D = null;
  updateTelemetryCounters();
  const hud = document.getElementById('td-hud-status');
  if (hud) hud.innerText = "OBJECT DELETED. 3D WORKSPACE";
}

function setup3DInteractions(viewport) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  viewport.addEventListener('dblclick', (e) => {
    const rect = viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouse.x = (x / viewport.clientWidth) * 2 - 1;
    mouse.y = -(y / viewport.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera3DBox);
    const intersects = raycaster.intersectObjects(loadedObjects3D);
    const hud = document.getElementById('td-hud-status');
    if (intersects.length > 0) {
      if (selectedObject3D) deselect3D();
      selectedObject3D = intersects[0].object;
      const outline = selectedObject3D.getObjectByName("outline");
      if (outline) outline.visible = true;
      if (hud) hud.innerText = "OBJECT MODE (1-Finger Place | 2-Finger Pinch Zoom)";
    } else {
      deselect3D();
    }
  });

  function deselect3D() {
    if (selectedObject3D) {
      const outline = selectedObject3D.getObjectByName("outline");
      if (outline) outline.visible = false;
      selectedObject3D = null;
      const hud = document.getElementById('td-hud-status');
      if (hud) hud.innerText = "3D WORKSPACE (1-Finger Rotate | 2-Finger Move & Pinch Zoom)";
    }
  }

  function getPinchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let lastTClientX = 0;
  let lastTClientY = 0;
  let initialPinchDist = null;
  let initialScale = 1;

  viewport.addEventListener('touchstart', (e) => {
    touches3D = e.touches;
    if (e.touches.length === 1) {
      lastTClientX = e.touches[0].clientX;
      lastTClientY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      initialPinchDist = getPinchDist(e.touches[0], e.touches[1]);
      if (selectedObject3D) initialScale = selectedObject3D.scale.x;
    }
  });

  viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const curTouches = e.touches;

    if (curTouches.length === 1) {
      const t = curTouches[0];
      lastTClientX = t.clientX;
      lastTClientY = t.clientY;
      const prevT = touches3D[0] || t;
      const dx = t.clientX - prevT.clientX;
      const dy = t.clientY - prevT.clientY;

      if (selectedObject3D) {
        selectedObject3D.position.x += dx * 0.05;
        selectedObject3D.position.y -= dy * 0.05;
        if (selectedObject3D.position.y < 1) selectedObject3D.position.y = 1;
      } else {
        desktopGroup3D.rotation.y += dx * 0.008;
        desktopGroup3D.rotation.x += dy * 0.008;
        desktopGroup3D.rotation.x = Math.max(-Math.PI / 12, Math.min(Math.PI / 2, desktopGroup3D.rotation.x));
      }
    } else if (curTouches.length === 2) {
      const currentPinchDist = getPinchDist(curTouches[0], curTouches[1]);
      if (initialPinchDist) {
        const ratio = currentPinchDist / initialPinchDist;
        if (selectedObject3D) {
          const newScale = Math.max(0.2, Math.min(5, initialScale * ratio));
          selectedObject3D.scale.set(newScale, newScale, newScale);
        } else {
          const delta = initialPinchDist - currentPinchDist;
          camera3DBox.position.z = Math.max(10, Math.min(120, camera3DBox.position.z + delta * 0.1));
          initialPinchDist = currentPinchDist;
        }
      }
    }
    touches3D = curTouches;
  }, { passive: false });

  viewport.addEventListener('touchend', () => {
    if (selectedObject3D && checkTrashCollision3D(lastTClientX, lastTClientY)) {
      deleteSelectedObject3D();
    }
  });

  viewport.addEventListener('mousedown', (e) => {
    isMouseDown3D = true;
    prevMousePos3D = { x: e.clientX, y: e.clientY };
  });

  viewport.addEventListener('mousemove', (e) => {
    if (!isMouseDown3D) return;
    const dx = e.clientX - prevMousePos3D.x;
    const dy = e.clientY - prevMousePos3D.y;

    if (selectedObject3D) {
      selectedObject3D.position.x += dx * 0.05;
      selectedObject3D.position.y -= dy * 0.05;
    } else {
      desktopGroup3D.rotation.y += dx * 0.008;
      desktopGroup3D.rotation.x += dy * 0.008;
    }
    prevMousePos3D = { x: e.clientX, y: e.clientY };
  });

  viewport.addEventListener('mouseup', () => {
    isMouseDown3D = false;
  });
}

/* =========================================================
   2. CONTINUOUS VIBRATING CIRCULAR WAVEFORM OVER THE 3 RINGS
   ========================================================= */
let waveBoostLevel = 0.25;

function initCircularVibrationGraph() {
  const canvas = document.getElementById('circularVibrationCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function renderCircleWave() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.37;
    const segments = 96;
    const now = Date.now() * 0.008;

    const targetBoost = isJarvisSpeaking ? 1.0 : (isListeningActive ? 0.72 : 0.28);
    waveBoostLevel += (targetBoost - waveBoostLevel) * 0.12;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const harmonic1 = Math.sin(angle * 8 + now * 1.6);
      const harmonic2 = Math.cos(angle * 5 - now * 1.2);
      const jitter = Math.sin(now * 3.1 + i * 0.7) * 0.35;
      const amplitude = (5 + waveBoostLevel * 14) * (0.55 + 0.45 * harmonic2 + jitter * 0.25);
      const r = baseRadius + harmonic1 * amplitude;

      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#ff1e27';
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff1e27';
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const pulse = Math.cos(angle * 12 - now * 2.1) * (2.5 + waveBoostLevel * 7);
      const r = baseRadius * 0.84 + pulse;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 71, 78, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 4;
    ctx.stroke();

    requestAnimationFrame(renderCircleWave);
  }

  renderCircleWave();
}

window.addEventListener('DOMContentLoaded', () => {
  initCircularVibrationGraph();
  initHackingWheelInteractions();
  initSlow3DGlobe();
  initGlobeSearchControls();
  updateTelemetryCounters();

  setTimeout(() => {
    const welcomeText = "Hi Sir, Your Jarvis was activated, ఏం చేద్దామో చెప్పండి సార్";
    addMessage(`Jarvis: ${welcomeText}`, 'ai');
    currentSession.messages.push({ role: 'model', text: welcomeText, time: format12HourTime(new Date()) });
    updateTelemetryCounters();
    speak(welcomeText);
    if (typeof startJarvisListening === 'function') startJarvisListening();
  }, 800);
});

/* =========================================================
   3. TEXT-TO-SPEECH (TTS) WITH INTERRUPT SUPPORT (ORIGINAL)
   ========================================================= */
function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[\*\#\`\_]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 0.95;

    utterance.onstart = () => {
      isJarvisSpeaking = true;
      if (statusText) statusText.innerText = "SPEAKING";
      if (speechIndicator) speechIndicator.innerText = "ACTIVE";
    };

    utterance.onend = () => {
      isJarvisSpeaking = false;
      if (statusText) statusText.innerText = isListeningActive ? "LISTENING..." : "SYSTEM ONLINE";
      if (speechIndicator) speechIndicator.innerText = "IDLE";
    };

    utterance.onerror = () => {
      isJarvisSpeaking = false;
      if (statusText) statusText.innerText = isListeningActive ? "LISTENING..." : "SYSTEM ONLINE";
      if (speechIndicator) speechIndicator.innerText = "IDLE";
    };

    window.speechSynthesis.speak(utterance);
  }
}

/* =========================================================
   4. UI & CHAT RENDERERS
   ========================================================= */
function saveSessions() {
  localStorage.setItem('jarvis_sessions', JSON.stringify(SESSIONS));
}

function addMessage(text, sender, imageDataUrl = null) {
  if (!chat) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;

  if (imageDataUrl) {
    const textSpan = document.createElement('div');
    textSpan.innerText = text;
    msgDiv.appendChild(textSpan);

    const imgEl = document.createElement('img');
    imgEl.src = imageDataUrl;
    imgEl.alt = 'Generated Image';
    imgEl.style.cssText = "max-width:100%; max-height:240px; border-radius:6px; margin-top:6px; border:1px solid #00ffff; display:block;";
    msgDiv.appendChild(imgEl);

    const load3DBtn = document.createElement('button');
    load3DBtn.innerText = "SEND TO 3D WORKSPACE";
    load3DBtn.style.cssText = "margin-top:6px; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:4px 8px; font-size:10px; font-family:monospace; cursor:pointer; border-radius:4px;";
    load3DBtn.addEventListener('click', () => {
      const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      addBase64ImageTo3DWorkspace(imageDataUrl, mime, 'jarvis-generated.png');
    });
    msgDiv.appendChild(load3DBtn);
  } else {
    msgDiv.innerText = text;
  }

  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
  updateTelemetryCounters();
}

/* =========================================================
   4.5. CLEAR MEMORY -> SAVE TO HISTORY & CLEAR CHAT
   ========================================================= */
function archiveCurrentChatToHistoryAndClear() {
  if (currentSession.messages.length > 0) {
    const snapshot = {
      id: Date.now(),
      title: currentSession.title !== "New Conversation" ? currentSession.title : `Session (${currentSession.messages.length} msgs)`,
      date: format12HourTime(new Date()),
      messages: [...currentSession.messages]
    };
    SESSIONS.unshift(snapshot);
    saveSessions();
  }

  currentSession = {
    id: Date.now() + 1,
    title: "New Conversation",
    date: format12HourTime(new Date()),
    messages: []
  };

  if (chat) chat.innerHTML = '';
  if (input) input.value = '';
  updateTelemetryCounters();
  pushSystemLog("Memory", "SAVED_TO_HISTORY");
}

/* =========================================================
   5. LOCAL MEMORY STORAGE HANDLERS
   ========================================================= */
function getCustomMemories() {
  return JSON.parse(localStorage.getItem('jarvis_custom_memories') || '[]');
}

function renderCustomMemories(filterText = '') {
  if (!savedMemoryList) return;
  savedMemoryList.innerHTML = '';
  const mems = getCustomMemories();
  const filtered = mems.filter(m => m.toLowerCase().includes(filterText.toLowerCase()));

  if (filtered.length === 0) {
    savedMemoryList.innerHTML = '<div style="color:#ffdede; font-size:11px; opacity:0.65; text-align:center;">No memory records found, Boss.</div>';
    return;
  }

  filtered.forEach((m, idx) => {
    const item = document.createElement('div');
    item.style.cssText = "font-size:11px; color:#ffdede; margin-bottom:6px; border-bottom:1px dashed rgba(255,30,39,0.35); padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;";
    item.innerHTML = `<span>📄 ${m}</span> <span style="color:#ff3366; cursor:pointer; font-weight:bold; padding:2px 6px;" onclick="deleteCustomMemory(${idx})">✕</span>`;
    savedMemoryList.appendChild(item);
  });
}

if (memorySearchInput) {
  memorySearchInput.addEventListener('input', (e) => {
    renderCustomMemories(e.target.value);
  });
}

window.deleteCustomMemory = function(index) {
  let mems = getCustomMemories();
  mems.splice(index, 1);
  localStorage.setItem('jarvis_custom_memories', JSON.stringify(mems));
  renderCustomMemories(memorySearchInput ? memorySearchInput.value : '');
  updateTelemetryCounters();
};

if (saveCustomMemory) {
  saveCustomMemory.addEventListener('click', () => {
    const valFromSearch = memorySearchInput ? memorySearchInput.value.trim() : '';
    const valFromTextarea = customMemoryInput ? customMemoryInput.value.trim() : '';
    const finalVal = valFromTextarea || valFromSearch;
    if (finalVal) {
      let mems = getCustomMemories();
      mems.push(finalVal);
      localStorage.setItem('jarvis_custom_memories', JSON.stringify(mems));
      if (customMemoryInput) customMemoryInput.value = '';
      if (memorySearchInput) memorySearchInput.value = '';
      renderCustomMemories();
      updateTelemetryCounters();
      pushSystemLog("Memory", "SAVED");
      speak("Details saved to your local memory matrix, Boss.");
    }
  });
}

/* =========================================================
   5.5. JARVIS MODE TOGGLE CONTROLLER
   ========================================================= */
function setJarvisModeState(enabled, announce = true) {
  strictJarvisKeywordMode = Boolean(enabled);
  const rightOrb = document.getElementById('rightOrb');

  if (modeIndicator) {
    modeIndicator.innerText = strictJarvisKeywordMode ? "STRICT" : "STANDARD";
  }
  if (rightOrb) {
    if (strictJarvisKeywordMode) rightOrb.classList.add('jarvis-mode-active');
    else rightOrb.classList.remove('jarvis-mode-active');
  }

  pushSystemLog("Mode", strictJarvisKeywordMode ? "JARVIS_ON" : "STANDARD");

  if (announce) {
    const msg = strictJarvisKeywordMode
      ? "Jarvis Mode activated, Boss. Only 'Jarvis' commands will trigger."
      : "Jarvis Mode deactivated, Boss. Standard voice mode active.";
    addMessage(`Jarvis: ${msg}`, 'ai');
    currentSession.messages.push({ role: 'model', text: msg, time: format12HourTime(new Date()) });
    saveSessions();
    speak(msg);
  }
}

function toggleJarvisMode() {
  setJarvisModeState(!strictJarvisKeywordMode, true);
}

/* =========================================================
   6. VOICE / TEXT COMMAND ROUTING
   ========================================================= */
function handleHardcoded(text) {
  if (!text) return null;
  const query = text.toLowerCase().trim();

  if (query.includes("clear memory") || query === "clear memory") {
    archiveCurrentChatToHistoryAndClear();
    return "Previous conversation saved to History and cleared, Boss.";
  }

  if (query.includes("explain") || query.includes("analyze") || query.includes("what is") || query.includes("matter")) {
    return null;
  }

  if (query.includes("jarvis mode activate") || query === "jarvis mode" || query === "jarvis on" || query === "jarvis activate") {
    setJarvisModeState(true, false);
    return "Jarvis Mode activated, Boss.";
  }

  if (query.includes("jarvis mode off") || query.includes("jarvis off") || query.includes("close jarvis") || query === "normal mode") {
    setJarvisModeState(false, false);
    return "Jarvis Mode deactivated, Boss.";
  }

  if (query === "clear jarvis" || query.includes("clear jarvis")) {
    archiveCurrentChatToHistoryAndClear();
    return "Chat display saved to History and cleared, Boss.";
  }

  if (query.includes("smart open three dimensional") || query.includes("open three dimensional") || query.includes("open 3d") || query.includes("3d workspace")) {
    open3DWorkspaceModal();
    return "Initializing Expanded 3D Workspace Table, Boss.";
  }

  if (query.includes("go back") || query.includes("back")) {
    if (wheelState.expandedBox) {
      restoreFullscreenBoxAndResetWheel();
      return "Exited fullscreen box view, Boss.";
    }

    const projLayer = document.getElementById('fullscreen-projection-layer');
    const tdModal = document.getElementById('td-workspace-modal');
    const ytModal = document.getElementById('youtube-workspace-modal');

    if (projLayer && projLayer.style.display === 'flex') {
      closeFullscreenProjection();
      return "Returned from fullscreen projection, Boss.";
    } else if (tdModal && tdModal.style.display === 'flex') {
      close3DWorkspaceModal();
      return "Returned from 3D workspace, Boss.";
    } else if (ytModal && ytModal.style.display === 'flex') {
      closeYouTubeModal();
      return "YouTube workspace closed, Boss.";
    } else if (historyModal && historyModal.style.display === 'block') {
      historyModal.style.display = 'none';
      return "History closed, Boss.";
    } else if (memoryModal && memoryModal.style.display === 'block') {
      memoryModal.style.display = 'none';
      return "Memory closed, Boss.";
    } else if (globeAnimState.mode === 'map') {
      returnToSlow3DGlobe();
      return "Returned to slow 3D globe, Boss.";
    }
    return "Already at base screen, Boss.";
  }

  if (query.includes("go to home") || query.includes("go home") || query.includes("home")) {
    restoreFullscreenBoxAndResetWheel();
    returnToSlow3DGlobe();
    if (historyModal) historyModal.style.display = 'none';
    if (memoryModal) memoryModal.style.display = 'none';
    close3DWorkspaceModal();
    closeFullscreenProjection();
    closeYouTubeModal();
    return "Returned to home screen, Boss.";
  }

  if (query.includes("open memory") || query.includes("memory")) {
    renderCustomMemories();
    if (memoryModal) memoryModal.style.display = 'block';
    pushSystemLog("Memory", "OPENED");
    return "Opening your Memory Box, Boss.";
  }

  if (query.includes("open gallery") || query.includes("gallery")) {
    if (imgInput) { imgInput.removeAttribute('capture'); imgInput.click(); }
    pushSystemLog("Gallery", "OPENED");
    return "Opening Gallery to attach image, Boss.";
  }

  if (query.includes("open history") || query.includes("history")) {
    renderHistoryFolders();
    if (historyModal) historyModal.style.display = 'block';
    pushSystemLog("History", "OPENED");
    return "Opening History Folders, Boss.";
  }

  if (query.includes("open youtube") || query.includes("youtube")) {
    openYouTubeModal();
    return "Opening YouTube Holographic Stream, Boss.";
  }

  if (query.includes("close youtube") || query.includes("exit youtube")) {
    closeYouTubeModal();
    return "YouTube workspace closed, Boss.";
  }

  const isFullscreenModalOpen = document.getElementById('fullscreen-projection-layer')?.style.display === 'flex';
  const is3DModalOpen = document.getElementById('td-workspace-modal')?.style.display === 'flex';

  if (query.includes("full screen") || query.includes("fullscreen") || query.includes("show")) {
    const labelMatches = query.match(/f\d+/gi);
    if (labelMatches) {
      const isNatural = query.includes("natural") || query.includes("normal");
      const success = handleFullscreenFiles(labelMatches.map(l => l.toLowerCase()), isNatural);
      if (success) return `Projecting files [${labelMatches.join(', ').toUpperCase()}] in fullscreen, Boss.`;
    }
  }

  if (query.includes("all files") || query.includes("all file")) {
    const makeNormal = query.includes("natural") || query.includes("normal");
    if (isFullscreenModalOpen) {
      updateFullscreenAllFilesMode(makeNormal);
      return `All fullscreen files switched to ${makeNormal ? 'natural' : '3D blue'} view, Boss.`;
    } else if (is3DModalOpen) {
      updateAll3DFilesMode(makeNormal);
      return `All 3D workspace files switched to ${makeNormal ? 'natural' : '3D blue'} view, Boss.`;
    }
  }

  if (query.includes("natural") || query.includes("normal") || query.includes("3d")) {
    const labelMatches = query.match(/f\d+/gi);
    if (labelMatches && labelMatches.length > 0) {
      const targetLabel = labelMatches[0].toLowerCase();
      const makeNormal = query.includes("natural") || query.includes("normal");

      if (isFullscreenModalOpen) {
        const success = updateFullscreenSingleFileMode(targetLabel, makeNormal);
        if (success) return `Fullscreen file ${targetLabel.toUpperCase()} switched to ${makeNormal ? 'natural' : '3D blue'} view, Boss.`;
      } else if (is3DModalOpen) {
        const success = update3DFileDisplayMode(targetLabel, makeNormal);
        if (success) return `3D workspace file ${targetLabel.toUpperCase()} switched to ${makeNormal ? 'natural' : '3D blue'} view, Boss.`;
      }
    }
  }

  return null;
}

/* =========================================================
   7. GEMINI AI ENGINE (TEXT + IMAGE GENERATION + FILE ANALYSIS)
   ========================================================= */
function isImageGenerationRequest(text) {
  if (!text) return false;
  return /\b(generate|create|draw|make|design)\b.*\b(image|picture|photo|artwork|illustration|logo|wallpaper|scene)\b/i.test(text) ||
         /\b(image|picture|photo)\b.*\b(of|for)\b/i.test(text);
}

async function generateImageWithGemini(promptText, activeKey) {
  const parts = [{ text: promptText }];
  if (pendingImageData) {
    parts.push({
      inline_data: {
        mime_type: pendingImageData.mimeType,
        data: pendingImageData.data
      }
    });
  }

  let lastStatusError = null;

  for (const imgModel of IMAGE_MODELS) {
    try {
      pushSystemLog("ImgModel", `TRY_${imgModel.toUpperCase()}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${imgModel}:generateContent?key=${activeKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const candidateParts = data.candidates?.[0]?.content?.parts || [];
        let caption = "Here is the generated image, Boss.";
        let imageDataUrl = null;

        for (const part of candidateParts) {
          if (part.text) {
            caption = part.text.trim();
          }
          const inline = part.inlineData || part.inline_data;
          if (inline && inline.data) {
            const mime = inline.mimeType || inline.mime_type || "image/png";
            imageDataUrl = `data:${mime};base64,${inline.data}`;
          }
        }

        if (imageDataUrl) {
          pendingImageData = null;
          pushSystemLog("ImgModel", imgModel.toUpperCase());
          return { text: caption, imageDataUrl, errorReason: null };
        } else {
          lastStatusError = `${imgModel} returned no image data`;
        }
      } else {
        const errBody = await res.text().catch(() => '');
        lastStatusError = `${imgModel} HTTP ${res.status}: ${errBody.slice(0, 120)}`;
        console.warn("Image model response error:", lastStatusError);
      }
    } catch (e) {
      lastStatusError = `${imgModel} request failed: ${e.message || e}`;
      console.warn("Image model attempt failed:", imgModel, e);
    }
  }

  pushSystemLog("ImgModel", "UNAVAILABLE");
  return { text: null, imageDataUrl: null, errorReason: lastStatusError };
}

async function callGemini(text) {
  let activeKey = API_KEY || localStorage.getItem('jarvis_key');
  if (!activeKey) {
    checkApiKey();
    activeKey = API_KEY || localStorage.getItem('jarvis_key');
    if (!activeKey) return { text: "API Key is required to connect with AI online, Boss.", imageDataUrl: null };
  }

  if (statusText) statusText.innerText = "PROCESSING...";
  pushSystemLog("Gemini", "QUERYING");

  if (isImageGenerationRequest(text)) {
    const imgResult = await generateImageWithGemini(text, activeKey);
    if (imgResult && imgResult.imageDataUrl) {
      return imgResult;
    }
    pendingImageData = null;
    return {
      text: `Boss, image generation could not complete (${imgResult?.errorReason || 'image model unavailable on this key/endpoint'}). Please check your Gemini API key access for image models.`,
      imageDataUrl: null
    };
  }

  const customMems = getCustomMemories();
  let contextualInstruction = SYSTEM_INSTRUCTION;
  contextualInstruction += `\n\n[YouTube Play Protocol]: When the Boss asks to play a video, song, or music, provide a valid working YouTube watch URL or search query string so the player opens instantly.`;

  let targetFile = null;
  if (text) {
    const lowerText = text.toLowerCase();
    const match = lowerText.match(/f\d+/i);
    if (match && workspaceFiles3D.length > 0) {
      const labelQuery = match[0].toLowerCase();
      targetFile = workspaceFiles3D.find(f => f.label.toLowerCase() === labelQuery && !f.isDeleted);
    } else if (workspaceFiles3D.length > 0 && (lowerText.includes("explain") || lowerText.includes("analyze") || lowerText.includes("what is"))) {
      targetFile = workspaceFiles3D.filter(f => !f.isDeleted).slice(-1)[0];
    }
  }

  if (targetFile) {
    if (targetFile.type === 'image') {
      pendingImageData = { mimeType: targetFile.mimeType, data: targetFile.data };
      contextualInstruction += `\n\n[Active Target File Analysis]: Thoroughly analyze and explain the image in file ${targetFile.label.toUpperCase()}. Read any text visible and describe its details.`;
    } else if (targetFile.type === 'text') {
      contextualInstruction += `\n\n[Active Target File Analysis]: Explain text from file ${targetFile.label.toUpperCase()}: "${targetFile.content}".`;
    }
  }

  if (customMems.length > 0) {
    contextualInstruction += `\n\nUser's Saved Details:\n- ${customMems.join("\n- ")}`;
  }

  const contents = currentSession.messages.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  const userParts = [];

  if (text) userParts.push({ text: text });
  else if (pendingImageData) userParts.push({ text: "Please analyze and explain this file, Boss." });

  if (pendingImageData) {
    userParts.push({ inline_data: { mime_type: pendingImageData.mimeType, data: pendingImageData.data } });
  }

  contents.push({ role: 'user', parts: userParts });

  for (let model of TEXT_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents, system_instruction: { parts: [{ text: contextualInstruction }] } }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        pendingImageData = null;
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const aiResponseText = data.candidates[0].content.parts[0].text;
          pushSystemLog("Model", model.toUpperCase());

          const ytLinkMatch = aiResponseText.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11})/i);
          const isPlayIntent = /play|youtube|song|bgm|music/i.test(text || '');

          if (ytLinkMatch) {
            setTimeout(() => { openYouTubeModal(ytLinkMatch[1]); }, 300);
          } else if (isPlayIntent) {
            const cleanQuery = (text || '').replace(/open|youtube|and|play|music|song|video|can|you/gi, "").trim();
            setTimeout(() => { openYouTubeModal(cleanQuery || text); }, 300);
          }

          return { text: aiResponseText, imageDataUrl: null };
        }
      }
    } catch (e) {
      console.warn("Model attempt failed: " + model, e);
    }
  }

  pendingImageData = null;
  pushSystemLog("Gemini", "OFFLINE");
  return {
    text: "Network connection unavailable or API limit reached, Boss. Please verify your API Key.",
    imageDataUrl: null
  };
}

/* =========================================================
   8. COMMAND DISPATCHER
   ========================================================= */
async function handleUserCommand() {
  const text = input ? input.value.trim() : '';
  if (!text && !pendingImageData) return;

  totalAccessLogs += 1;
  const currentImageData = pendingImageData;
  const timeStr = format12HourTime(new Date());

  let userMsgText = text;
  if (currentImageData) {
    userMsgText = text ? `[Image Uploaded] ${text}` : '[Uploaded Image for Analysis]';
  }

  addMessage(`You: ${userMsgText}`, 'user');
  currentSession.messages.push({ role: 'user', text: userMsgText, time: timeStr });

  if (currentSession.title === "New Conversation" && text) {
    currentSession.title = text.length > 35 ? text.substring(0, 35) + "..." : text;
  }

  if (input) input.value = '';

  if (!currentImageData) {
    const hcReply = handleHardcoded(text);
    if (hcReply) {
      addMessage(`Jarvis: ${hcReply}`, 'ai');
      currentSession.messages.push({ role: 'model', text: hcReply, time: format12HourTime(new Date()) });
      saveSessions();
      speak(hcReply);
      return;
    }
  }

  if (statusText) statusText.innerText = "PROCESSING...";

  try {
    const result = await callGemini(text);
    const replyText = typeof result === 'string' ? result : result.text;
    const imageDataUrl = typeof result === 'object' ? result.imageDataUrl : null;

    addMessage(`Jarvis: ${replyText}`, 'ai', imageDataUrl);
    currentSession.messages.push({
      role: 'model',
      text: imageDataUrl ? `${replyText} [Generated Image]` : replyText,
      time: format12HourTime(new Date())
    });
    saveSessions();
    speak(replyText);
  } catch (err) {
    addMessage(`Jarvis: Error executing requested protocols.`, 'ai');
    speak(`Error executing requested protocols, Boss.`);
    pendingImageData = null;
  } finally {
    if (!isJarvisSpeaking && statusText) {
      statusText.innerText = isListeningActive ? "LISTENING..." : "SYSTEM ONLINE";
    }
  }
}

/* =========================================================
   9. HISTORY & SESSIONS MANAGEMENT
   ========================================================= */
function renderHistoryFolders() {
  if (!historyList) return;
  historyList.innerHTML = '';

  let allFolders = [...SESSIONS];
  if (currentSession.messages.length > 0 && !allFolders.some(s => s.id === currentSession.id)) {
    allFolders.unshift(currentSession);
  }

  if (allFolders.length === 0) {
    historyList.innerHTML = '<div style="color:#ffdede; opacity:0.65; text-align:center;">No history folders found.</div>';
    return;
  }

  allFolders.forEach((session) => {
    const folderCard = document.createElement('div');
    folderCard.className = 'history-item';

    const folderHeader = document.createElement('div');
    folderHeader.style.cssText = "width:100%; display:flex; justify-content:space-between; align-items:center; cursor:pointer; border-bottom:1px solid rgba(255,30,39,0.25); padding-bottom:4px; margin-bottom:4px;";
    folderHeader.innerHTML = `<div>
                                <span style="font-size:10px; color:#ff666b; font-weight:bold;">📁 ${session.date}</span><br>
                                <span style="font-size:11px; color:#ffdede; font-weight:bold;">🔑 ${session.title}</span>
                              </div>
                              <span style="color:#ff3366; cursor:pointer; font-size:14px; padding:2px 6px;" title="Delete Folder" onclick="deleteSession(${session.id})">✕</span>`;

    const folderContent = document.createElement('div');
    folderContent.style.cssText = "width:100%; display:none; margin-top:4px; max-height:120px; overflow-y:auto; padding-left:4px;";

    session.messages.forEach(m => {
      const msgLine = document.createElement('div');
      msgLine.style.cssText = "font-size:10px; margin-bottom:3px; color:#ffffff;";
      msgLine.innerHTML = `<b>${m.role === 'user' ? 'You' : 'Jarvis'}:</b> ${m.text} <span style="font-size:8px; opacity:0.65;">[${m.time}]</span>`;
      folderContent.appendChild(msgLine);
    });

    folderHeader.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN' && e.target.innerText === '✕') return;
      folderContent.style.display = folderContent.style.display === 'none' ? 'block' : 'none';
    });

    folderCard.appendChild(folderHeader);
    folderCard.appendChild(folderContent);
    historyList.appendChild(folderCard);
  });
}

window.deleteSession = function(sessionId) {
  SESSIONS = SESSIONS.filter(s => s.id !== sessionId);
  if (currentSession.id === sessionId) {
    currentSession = { id: Date.now(), title: "New Conversation", date: format12HourTime(new Date()), messages: [] };
    if (chat) chat.innerHTML = '';
  }
  saveSessions();
  renderHistoryFolders();
  updateTelemetryCounters();
};

if (clearAllHistoryBtn) {
  clearAllHistoryBtn.addEventListener('click', () => {
    SESSIONS = [];
    currentSession = { id: Date.now(), title: "New Conversation", date: format12HourTime(new Date()), messages: [] };
    saveSessions();
    renderHistoryFolders();
    updateTelemetryCounters();
    if (chat) chat.innerHTML = '';
  });
}

/* =========================================================
   10. EVENT LISTENERS & GALLERY ATTACHMENT
   ========================================================= */
if (executeBtn) executeBtn.addEventListener('click', handleUserCommand);
if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUserCommand(); });

if (closeHistory) closeHistory.addEventListener('click', () => historyModal.style.display = 'none');
if (closeMemoryModal) closeMemoryModal.addEventListener('click', () => memoryModal.style.display = 'none');

if (imgInput) {
  imgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Data = evt.target.result.split(',')[1];
        pendingImageData = { mimeType: file.type, data: base64Data };
        addMessage(`You: [Attached Gallery Image: ${file.name}]`, 'user');
        handleUserCommand();
      };
      reader.readAsDataURL(file);
    }
  });
}

window.addEventListener('click', (e) => {
  if (e.target === historyModal) historyModal.style.display = 'none';
  if (e.target === memoryModal) memoryModal.style.display = 'none';
});

window.addEventListener('resize', resizeSlowGlobeViewport);

/* =========================================================
   11. CONTINUOUS VOICE RECOGNITION + VIBE PANEL + TELEMETRY (ORIGINAL)
   ========================================================= */
let startJarvisListening = function() {};

function toggleVoiceAssistant() {
  isListeningActive = !isListeningActive;
  const leftOrb = document.getElementById('leftOrb');
  const rightOrb = document.getElementById('rightOrb');
  const voicePanel = document.getElementById('voicePanel');

  if (isListeningActive) {
    if (leftOrb) leftOrb.classList.add('listening');
    if (rightOrb) rightOrb.classList.add('listening');
    if (micBtn) micBtn.classList.add('active-mic');
    if (voiceStatus) voiceStatus.innerText = 'ACTIVE';
    if (statusBadge) statusBadge.innerText = '[VOICE_ON]';

    if (navigator.vibrate) {
      navigator.vibrate([110, 50, 110, 50, 180]);
    }
    if (voicePanel) {
      voicePanel.classList.add('glitch-active');
      setTimeout(() => voicePanel.classList.remove('glitch-active'), 450);
    }
    pushSystemLog("Voice Link", "LISTENING");
    if (typeof startJarvisListening === 'function') startJarvisListening();
  } else {
    if (leftOrb) leftOrb.classList.remove('listening');
    if (rightOrb) rightOrb.classList.remove('listening');
    if (micBtn) micBtn.classList.remove('active-mic');
    if (voiceStatus) voiceStatus.innerText = 'STANDBY';
    if (statusBadge) statusBadge.innerText = '[ONLINE]';
    if (navigator.vibrate) navigator.vibrate(0);
    pushSystemLog("Voice Link", "STANDBY");
  }
}

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      if (statusText) statusText.innerText = "LISTENING...";
      if (micBtn) micBtn.classList.add('active-mic');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      const rawTranscript = finalTranscript.trim();
      if (!rawTranscript) return;

      const lowerTranscript = rawTranscript.toLowerCase();

      if (isJarvisSpeaking && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        isJarvisSpeaking = false;
      }

      if (input) input.value = rawTranscript;

      if (strictJarvisKeywordMode && !lowerTranscript.includes("jarvis")) {
        if (input) input.value = '';
        return;
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      if (lowerTranscript.includes("smart stop listening") || lowerTranscript.includes("stop listening")) {
        isListeningActive = false;
        try { recognition.stop(); } catch (e) {}
        addMessage(`You: ${rawTranscript}`, 'user');
        addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
        speak('Stopped Listening, Boss.');
        return;
      }

      handleUserCommand();
    };

    recognition.onerror = () => {
      if (!isJarvisSpeaking && statusText) {
        statusText.innerText = isListeningActive ? "LISTENING..." : "SYSTEM ONLINE";
      }
    };

    recognition.onend = () => {
      if (isListeningActive) {
        try {
          recognition.start();
        } catch (e) {
          setTimeout(() => { try { recognition.start(); } catch (err) {} }, 250);
        }
      } else {
        if (!isJarvisSpeaking && statusText) statusText.innerText = "SYSTEM ONLINE";
        if (micBtn) micBtn.classList.remove('active-mic');
      }
    };
  }

  initRecognition();

  startJarvisListening = function() {
    isListeningActive = true;
    if (micBtn) micBtn.classList.add('active-mic');
    try { recognition.start(); } catch (err) {}
  };

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (!isListeningActive) {
        startJarvisListening();
        addMessage(`Jarvis: Active and listening continuously, Boss...`, 'ai');
        speak('Listening continuously, Boss.');
      } else {
        isListeningActive = false;
        try { recognition.stop(); } catch (err) {}
        if (micBtn) micBtn.classList.remove('active-mic');
        addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
        speak('Stopped Listening, Boss.');
      }
    });
  }
}

// Equalizer Bars & Continuous Telemetry Loop
const eqContainer = document.getElementById('equalizer');
const barCount = 36;
const bars = [];
if (eqContainer) {
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'eq-bar';
    eqContainer.appendChild(bar);
    bars.push(bar);
  }
}

function pulseEqualizer() {
  if (!bars.length) return;
  const now = Date.now();
  bars.forEach((bar, idx) => {
    const centerDist = Math.abs(idx - barCount / 2) / (barCount / 2);
    const wave = Math.sin(now * 0.012 + idx * 0.35) * 0.5 + 0.5;
    const activeFactor = isJarvisSpeaking ? 1.0 : (isListeningActive ? 0.72 : 0.32);
    const height = (wave * (1 - centerDist * 0.35) * 78 * activeFactor) + 12;
    bar.style.height = `${Math.min(100, Math.max(10, height))}%`;
  });
}

let decryptProg = 30;
setInterval(() => {
  pulseEqualizer();
  updateTelemetryCounters();

  decryptProg = decryptProg >= 100 ? 12 : decryptProg + 1;
  const decEl = document.getElementById('decryptPercent');
  if (decEl) decEl.innerHTML = `SYNC<br>${decryptProg}%`;

  const tempEl = document.getElementById('coreTemp');
  if (tempEl) tempEl.textContent = `${(37.5 + Math.random() * 2.4).toFixed(1)}°C`;

  const randBin = () => Array.from({ length: 8 }, () => Math.round(Math.random())).join('');
  const binEl = document.getElementById('binaryStream');
  if (binEl) binEl.innerHTML = `${randBin()} ${randBin()}<br>${randBin()} ${randBin()}`;
}, 350);
