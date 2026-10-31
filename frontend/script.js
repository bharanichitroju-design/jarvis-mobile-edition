/* =========================================================
   1. INITIALIZATION & CONFIGURATION
   ========================================================= */
let API_KEY = localStorage.getItem('jarvis_key') || '';

function checkApiKey() {
  if (!API_KEY) {
    API_KEY = prompt('Enter your Gemini API Key to enable AI responses, Boss:');
    if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
  }
}

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-3.6-flash", 
  "gemini-3.5-flash-lite", 
  "gemini-flash-latest"
];

const SYSTEM_INSTRUCTION = `You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani (also addressed as Sir).
Behavior Guidelines:
1. Always address Bharani as "Boss" or "Sir".
2. If asked "What is your name?" or "Who are you?", respond with: "My name is Jarvis, created by Bharani (Sir)."
3. Keep answers concise, direct, and helpful. Utilize the user's saved memory files and offline notes when requested.
4. [Projection & File Control Commands]: Support commands like 'full screen f1', 'natural f1', '3d f1', 'natural all files', '3d all files', 'explain f1', 'analyze f1', 'go back', and 'go home'.`;

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
let strictJarvisKeywordMode = false;

let workspaceFiles3D = []; 

// DOM Elements
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const executeBtn = document.getElementById('execute-btn');
const micBtn = document.getElementById('mic-btn');
const galleryBtn = document.getElementById('gallery-btn');
const memoryBtn = document.getElementById('memory-btn') || document.getElementById('files-btn');
const clearBtn = document.getElementById('clear-btn');
const imgInput = document.getElementById('img-input');
const apiKeyBtn = document.getElementById('api-key-btn');
const statusText = document.getElementById('status-text');

const settingsBtn = document.getElementById('settings-btn');
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
   1.2. IN-APP YOUTUBE HOLOGRAPHIC WORKSPACE MODAL
   ========================================================= */
function ensureYouTubeModalExists() {
  let modal = document.getElementById('youtube-workspace-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'youtube-workspace-modal';
    modal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; justify-content:center; align-items:center;";
    
    modal.innerHTML = `
      <div style="width:96%; max-width:1100px; height:92vh; background:#000f1e; border:2px solid #ff0000; box-shadow:0 0 40px rgba(255,0,0,0.7); display:flex; flex-direction:column; border-radius:12px; overflow:hidden; font-family:monospace; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:rgba(30,0,0,0.95); border-bottom:1px solid #ff0000; z-index:10;">
          <span style="color:#ff3333; font-weight:bold; font-size:12px; letter-spacing:1px;">🔴 YOUTUBE HOLOGRAPHIC STREAM ACTIVE</span>
          <button id="close-youtube-box" style="background:none; border:none; color:#ff3366; font-size:20px; font-weight:bold; cursor:pointer;">✕</button>
        </div>
        <div style="flex:1; width:100%; background:#000; position:relative; display:flex; justify-content:center; align-items:center;">
          <iframe id="youtube-frame" src="" style="width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        <div style="padding:15px; background:rgba(20,0,0,0.95); border-top:1px solid rgba(255,0,0,0.4); display:flex; gap:10px; z-index:10;">
          <input type="text" id="youtube-search-input" placeholder="Paste YouTube video link or type search term..." style="flex:2; background:rgba(30,0,0,0.9); border:1px solid #ff0000; color:#ff3333; padding:10px; outline:none; font-family:monospace;">
          <button id="youtube-search-btn" style="flex:1; background:rgba(50,0,0,0.9); border:1px solid #ff0000; color:#ff3366; padding:10px; font-weight:bold; cursor:pointer;">PLAY / SEARCH</button>
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
  }
}

function closeYouTubeModal() {
  const modal = document.getElementById('youtube-workspace-modal');
  if (modal) {
    modal.style.display = 'none';
    const iframe = document.getElementById('youtube-frame');
    if (iframe) iframe.src = ""; 
  }
}

function loadYouTubeSearch(query) {
  const iframe = document.getElementById('youtube-frame');
  if (!iframe) return;
  let videoId = "";
  let cleanUrl = query.trim();

  if (cleanUrl.includes('youtube.com/watch?v=')) {
    try {
      const urlParams = new URLSearchParams(new URL(cleanUrl).search);
      videoId = urlParams.get('v');
    } catch(e) {}
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
   1.3. MAP POINTING PIN & BLUE HOLOGRAPHIC BLUEPRINT GENERATOR
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
   1.5. IN-APP 3D WORKSPACE MODAL & HOLOGRAM ENGINE
   ========================================================= */
let scene3DBox, camera3DBox, renderer3DBox;
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
  } catch (e) {
    console.log("Audio not supported", e);
  }
}

function ensure3DModalExists() {
  let modal = document.getElementById('td-workspace-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'td-workspace-modal';
    modal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; justify-content:center; align-items:center;";
    
    modal.innerHTML = `
      <div style="width:96%; max-width:1100px; height:92vh; background:#000f1e; border:2px solid #00ffff; box-shadow:0 0 40px rgba(0,255,255,0.7); display:flex; flex-direction:column; border-radius:12px; overflow:hidden; font-family:monospace; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:rgba(0,30,60,0.95); border-bottom:1px solid #00ffff; z-index:10;">
          <span id="td-hud-status" style="color:#00ffff; font-weight:bold; font-size:12px; letter-spacing:1px;">3D WORKSPACE EXPANDED (1-Finger Rotate | 2-Finger Move & Pinch Zoom)</span>
          <button id="close-td-box" style="background:none; border:none; color:#ff3366; font-size:20px; font-weight:bold; cursor:pointer;">✕</button>
        </div>
        
        <div id="td-box-viewport" style="flex:1; width:100%; background:#010814; position:relative; overflow:hidden;"></div>

        <!-- Fullscreen Dynamic Projection Layer Overlay -->
        <div id="fullscreen-projection-layer" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(1,8,20,0.95); z-index:50; flex-direction:column; justify-content:space-between; padding:20px; box-sizing:border-box;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #00ffff; padding-bottom:10px;">
            <span style="color:#00ffff; font-weight:bold; font-size:14px; letter-spacing:1px;">⚡ HOLOGRAPHIC PROJECTION SCREEN ACTIVE</span>
            <span style="color:#ff3366; font-size:12px; font-weight:bold;">Say 'go back' or close to exit</span>
          </div>
          <div id="projection-grid-container" style="flex:1; display:grid; gap:10px; padding:15px; align-center; justify-center; overflow:hidden;"></div>
          <div id="projection-bottom-hud" style="width:100%; height:45px; background:rgba(0,30,60,0.9); border:1px solid #00ffff; border-radius:8px; display:flex; align-items:center; padding:0 15px; box-sizing:border-box; gap:10px; overflow-x:auto;">
            <span style="color:#00ffff; font-size:11px; font-weight:bold;">ACTIVE FILES:</span>
            <div id="projection-hud-badges" style="display:flex; gap:8px;"></div>
          </div>
        </div>

        <div id="td-trash-bin" title="Drag object here to delete" style="position:absolute; bottom:80px; left:50%; transform:translateX(-50%); width:50px; height:50px; background:rgba(255,0,60,0.2); border:2px dashed #ff0055; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; color:#ff0055; box-shadow:0 0 15px rgba(255,0,85,0.4); z-index:20; transition:all 0.3s ease; pointer-events:none;">🗑️</div>

        <div style="padding:15px; background:rgba(0,20,40,0.95); border-top:1px solid rgba(0,243,255,0.4); display:flex; flex-direction:column; gap:10px; z-index:10;">
          <div style="display:flex; gap:10px; width:100%;">
            <input type="text" id="td-box-input" placeholder="Type text here..." style="flex:2; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:10px; outline:none; font-family:monospace;">
            <button id="td-box-spawn" style="flex:1; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:10px; font-weight:bold; cursor:pointer;">SPAWN TEXT</button>
          </div>
          <button id="td-upload-btn" style="width:100%; background:rgba(0,30,60,0.9); border:1px solid #00ffff; color:#00ffff; padding:10px; font-weight:bold; cursor:pointer;">UPLOAD BLUEPRINT IMAGE</button>
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
  }
}

function close3DWorkspaceModal() {
  const modal = document.getElementById('td-workspace-modal');
  if (modal) modal.style.display = 'none';
}

let desktopGroup3D;
function init3DBoxScene() {
  const viewport = document.getElementById('td-box-viewport');
  if (!viewport || viewport.hasChildNodes()) return;

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

function spawn3DTextFromInput() {
  const textInput = document.getElementById('td-box-input');
  const hud = document.getElementById('td-hud-status');
  if (!textInput) return;
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
  if (hud) hud.innerText = `TEXT SPAWNED AS ${fileLabel.toUpperCase()}.`;
}

/* =========================================================
   BLUEPRINT IMAGE UPLOAD WITH BLUE TINT & NORMAL TOGGLE SUPPORT
   ========================================================= */
function handle3DBlueprintUpload(e) {
  const file = e.target.files[0];
  const hud = document.getElementById('td-hud-status');
  if (!file) return;

  const fileLabel = `f${workspaceFiles3D.length + 1}`;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const base64FullData = evt.target.result;
    const base64DataOnly = base64FullData.split(',')[1];

    const img = new Image();
    img.src = base64FullData;
    img.onload = () => {
      const origTexture = new THREE.TextureLoader().load(base64FullData);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;

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
      const aspect = img.width / img.height;
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
        mimeType: file.type, 
        data: base64DataOnly, 
        fileName: file.name,
        isNatural: false,
        isDeleted: false,
        originalPosition: mesh.position.clone(),
        originalScale: mesh.scale.clone()
      });

      if (hud) hud.innerText = `IMAGE UPLOADED AS ${fileLabel.toUpperCase()} WITH BLUE HOLOGRAPHIC TINT.`;
    };
  };
  reader.readAsDataURL(file);
  this.value = '';
}

function update3DFileDisplayMode(fileLabel, makeNormal) {
  const target = workspaceFiles3D.find(f => f.label.toLowerCase() === fileLabel.toLowerCase() && !f.isDeleted);
  if (!target || target.type !== 'image') return false;

  target.isNatural = makeNormal;
  if (makeNormal) {
    target.mesh.material.map = target.originalTexture;
  } else {
    target.mesh.material.map = target.threeDTexture;
  }
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
   FULLSCREEN PROJECTION LAYER WITH INDEPENDENT CONTROLS
   ========================================================= */
let activeFullscreenFilesState = [];
let fullscreenFilesNaturalMap = {}; 

function handleFullscreenFiles(labelsArray, isNatural = false) {
  const activeFiles = workspaceFiles3D.filter(f => !f.isDeleted && labelsArray.includes(f.label.toLowerCase()));
  if (activeFiles.length === 0) return false;

  activeFullscreenFilesState = activeFiles;
  activeFiles.forEach(f => {
    if (fullscreenFilesNaturalMap[f.label.toLowerCase()] === undefined) {
      fullscreenFilesNaturalMap[f.label.toLowerCase()] = isNatural;
    } else if (isNatural !== undefined) {
      fullscreenFilesNaturalMap[f.label.toLowerCase()] = isNatural;
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
    fullscreenFilesNaturalMap[fileLabel.toLowerCase()] = makeNormal;
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
  const trashBin = document.getElementById('td-trash-bin');
  if (trashBin) trashBin.classList.remove('highlight');
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
      selectedObject3D.getObjectByName("outline").visible = true;
      if (hud) hud.innerText = "OBJECT MODE (1-Finger Place | 2-Finger Pinch Zoom)";
    } else {
      deselect3D();
    }
  });

  function deselect3D() {
    if (selectedObject3D) {
      selectedObject3D.getObjectByName("outline").visible = false;
      selectedObject3D = null;
      const trashBin = document.getElementById('td-trash-bin');
      if (trashBin) trashBin.classList.remove('highlight');
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
    const trashBin = document.getElementById('td-trash-bin');

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

        if (checkTrashCollision3D(t.clientX, t.clientY)) {
          if (trashBin) trashBin.classList.add('highlight');
        } else {
          if (trashBin) trashBin.classList.remove('highlight');
        }
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
    const trashBin = document.getElementById('td-trash-bin');
    if (selectedObject3D && checkTrashCollision3D(lastTClientX, lastTClientY)) {
      deleteSelectedObject3D();
    } else {
      if (trashBin) trashBin.classList.remove('highlight');
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
   2. THREE.JS 3D FACE IMAGE & LIP-SYNC ANIMATION (RESTORED & FIXED)
   ========================================================= */
let scene, camera, renderer, faceMesh;

function init3DFace() {
  const container = document.getElementById('face-container');
  if (!container) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, 4.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(290, 290);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x00f3ff, 2.5, 50);
  pointLight.position.set(2, 3, 4);
  scene.add(pointLight);

  // Loading the original face image properly centered and scaled as a 3D facing plane mesh
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    './humanoid_robot_face (1).glb', // Fallback or image path check
    (texture) => {
      setupFaceMesh(texture);
    },
    undefined,
    (err) => { 
      // If glb fails to load as texture, fallback to direct image loading or default
      textureLoader.load('./humanoid_robot_face.png', (tex) => {
        setupFaceMesh(tex);
      }, undefined, () => {
        // Ultimate fallback placeholder texture or color
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(0,0,512,512);
        const fallbackTex = new THREE.CanvasTexture(canvas);
        setupFaceMesh(fallbackTex);
      });
    }
  );

  animateFace();
}

function setupFaceMesh(texture) {
  const geometry = new THREE.PlaneGeometry(2.8, 2.8);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });
  faceMesh = new THREE.Mesh(geometry, material);
  faceMesh.position.set(0, 0, 0);
  scene.add(faceMesh);
}

function animateFace() {
  requestAnimationFrame(animateFace);
  if (faceMesh) {
    faceMesh.position.y = Math.sin(Date.now() * 0.003) * 0.03;
    if (isJarvisSpeaking) {
      const time = Date.now() * 0.025;
      faceMesh.scale.y = 1 + Math.sin(time) * 0.10;
      faceMesh.scale.x = 1 + Math.cos(time * 0.7) * 0.02;
    } else {
      faceMesh.scale.y += (1 - faceMesh.scale.y) * 0.1;
      faceMesh.scale.x += (1 - faceMesh.scale.x) * 0.1;
    }
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
  init3DFace();
  setTimeout(() => {
    const welcomeText = "Hi Sir, Your Jarvis was activated, ఏం చేద్దామో చెప్పండి సార్";
    addMessage(`Jarvis: ${welcomeText}`, 'ai');
    currentSession.messages.push({ role: 'model', text: welcomeText, time: format12HourTime(new Date()) });
    speak(welcomeText);
    if (typeof startJarvisListening === 'function') startJarvisListening();
  }, 1000);
});

/* =========================================================
   3. TEXT-TO-SPEECH (TTS) WITH INTERRUPT SUPPORT
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
    };

    utterance.onend = () => {
      isJarvisSpeaking = false;
      if (statusText) statusText.innerText = "SYSTEM ONLINE";
    };

    utterance.onerror = () => {
      isJarvisSpeaking = false;
      if (statusText) statusText.innerText = "SYSTEM ONLINE";
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

function addMessage(text, sender) {
  if (!chat) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.innerText = text;
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
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
    savedMemoryList.innerHTML = '<div style="color:#00f3ff; font-size:11px; opacity:0.6; text-align:center;">No memory records found, Boss.</div>';
    return;
  }

  filtered.forEach((m, idx) => {
    const item = document.createElement('div');
    item.style.cssText = "font-size:11px; color:#00f3ff; margin-bottom:6px; border-bottom:1px dashed rgba(0,243,255,0.3); padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;";
    item.innerHTML = `<span>📄 ${m}</span> <span style="color:#ff3366; cursor:pointer; font-weight:bold; padding:2px 6px;" onclick="deleteCustomMemory(${idx})">✕</span>`;
    savedMemoryList.appendChild(item);
  });
}

if (memorySearchInput) {
  memorySearchInput.addEventListener('input', (e) => { renderCustomMemories(e.target.value); });
}

window.deleteCustomMemory = function(index) {
  let mems = getCustomMemories();
  mems.splice(index, 1);
  localStorage.setItem('jarvis_custom_memories', JSON.stringify(mems));
  renderCustomMemories(memorySearchInput ? memorySearchInput.value : '');
};

if (saveCustomMemory) {
  saveCustomMemory.addEventListener('click', () => {
    const valFromSearch = memorySearchInput.value.trim();
    const valFromTextarea = customMemoryInput.value.trim();
    const finalVal = valFromTextarea || valFromSearch;
    if (finalVal) {
      let mems = getCustomMemories();
      mems.push(finalVal);
      localStorage.setItem('jarvis_custom_memories', JSON.stringify(mems));
      customMemoryInput.value = '';
      memorySearchInput.value = '';
      renderCustomMemories();
      speak("Details saved to your local memory matrix, Boss.");
    }
  });
}

/* =========================================================
   6. HARDCODED COMMANDS & VOICE BUTTON ROUTING (FIXED)
   ========================================================= */
function handleHardcoded(text) {
  if (!text) return null;
  const query = text.toLowerCase().trim();

  if (query.includes("explain") || query.includes("analyze") || query.includes("what is") || query.includes("matter")) {
    return null;
  }

  if (query.includes("jarvis mode activate") || query === "jarvis mode" || query === "jarvis on" || query === "jarvis activate") {
    strictJarvisKeywordMode = true;
    return "Jarvis Mode activated, Boss.";
  }

  if (query.includes("jarvis mode off") || query.includes("jarvis off") || query.includes("close jarvis") || query === "normal mode") {
    strictJarvisKeywordMode = false;
    return "Jarvis Mode deactivated, Boss.";
  }

  if (query === "clear jarvis" || query.includes("clear jarvis")) {
    if (currentSession.messages.length > 0) {
      SESSIONS.unshift(currentSession);
      saveSessions();
    }
    currentSession = { id: Date.now(), title: "New Conversation", date: format12HourTime(new Date()), messages: [] };
    if (chat) chat.innerHTML = '';
    return "Chat display cleared, Boss.";
  }

  if (query.includes("smart open three dimensional") || query.includes("open three dimensional") || query.includes("3d workspace")) {
    open3DWorkspaceModal();
    return "Initializing Expanded 3D Workspace Table, Boss.";
  }

  if (query.includes("go back") || query.includes("back")) {
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
    }
    return "Already at base screen, Boss.";
  }

  if (query.includes("go to home") || query.includes("go home") || query.includes("home")) {
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
    return "Opening your Memory Box, Boss.";
  }

  if (query.includes("open gallery") || query.includes("gallery")) {
    if (imgInput) { imgInput.removeAttribute('capture'); imgInput.click(); }
    return "Opening Gallery to attach image, Boss.";
  }

  if (query.includes("open history") || query.includes("history")) {
    renderHistoryFolders();
    if (historyModal) historyModal.style.display = 'block';
    return "Opening History Folders, Boss.";
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
   7. ROBUST AI ENGINE CALL WITH SAFE VERIFIED YOUTUBE PLAYBACK
   ========================================================= */
async function callGemini(text) {
  let activeKey = API_KEY || localStorage.getItem('jarvis_key');
  if (!activeKey) {
    checkApiKey();
    activeKey = API_KEY || localStorage.getItem('jarvis_key');
    if (!activeKey) return "API Key is required to connect with AI online, Boss.";
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
  if (statusText) statusText.innerText = "PROCESSING...";

  for (let model of MODELS) {
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
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
          const aiResponseText = data.candidates[0].content.parts[0].text;
          
          const ytLinkMatch = aiResponseText.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11})/i);
          const isPlayIntent = text.toLowerCase().includes("play") || text.toLowerCase().includes("youtube") || text.toLowerCase().includes("song") || text.toLowerCase().includes("bgm") || text.toLowerCase().includes("music");

          if (ytLinkMatch) {
            setTimeout(() => { openYouTubeModal(ytLinkMatch[1]); }, 300);
          } else if (isPlayIntent) {
            const cleanQuery = text.replace(/open|youtube|and|play|music|song|video|can|you/gi, "").trim();
            setTimeout(() => { openYouTubeModal(cleanQuery || text); }, 300);
          }

          return aiResponseText;
        }
      }
    } catch (e) {
      console.warn("Model attempt failed: " + model, e);
    }
  }

  pendingImageData = null;
  return "Network connection unavailable or API limit reached, Boss. Please verify your API Key.";
}

/* =========================================================
   8. COMMAND DISPATCHER
   ========================================================= */
async function handleUserCommand() {
  const text = input ? input.value.trim() : '';
  if (!text && !pendingImageData) return;

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
      if (statusText) statusText.innerText = "SYSTEM ONLINE";
      return;
    }
  }

  if (statusText) statusText.innerText = "PROCESSING...";

  try {
    const reply = await callGemini(text);
    addMessage(`Jarvis: ${reply}`, 'ai');
    currentSession.messages.push({ role: 'model', text: reply, time: format12HourTime(new Date()) });
    saveSessions();
    speak(reply);
  } catch (err) {
    addMessage(`Jarvis: Error executing requested protocols.`, 'ai');
    speak(`Error executing requested protocols, Boss.`);
    pendingImageData = null;
  } finally {
    if (!isJarvisSpeaking && statusText) statusText.innerText = "SYSTEM ONLINE";
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
    historyList.innerHTML = '<div style="color:#00f3ff; opacity:0.6; text-align:center;">No history folders found.</div>';
    return;
  }

  allFolders.forEach((session) => {
    const folderCard = document.createElement('div');
    folderCard.className = 'history-item';
    folderCard.style.cssText = "flex-direction: column; align-items: flex-start; margin-bottom: 8px; background: rgba(0,243,255,0.08); padding: 8px; border-radius: 6px;";

    const folderHeader = document.createElement('div');
    folderHeader.style.cssText = "width: 100%; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-bottom: 1px solid rgba(0,243,255,0.2); padding-bottom: 4px; margin-bottom: 4px;";
    folderHeader.innerHTML = `<div>
                                <span style="font-size: 9px; color: #00a2ff; font-weight: bold;">📁 ${session.date}</span><br>
                                <span style="font-size: 11px; color: #00f3ff; font-weight: bold;">🔑 Key Point: ${session.title}</span>
                              </div>
                              <span style="color:#ff3366; cursor:pointer; font-size:14px; padding: 2px 6px;" title="Delete Folder" onclick="deleteSession(${session.id})">✕</span>`;

    const folderContent = document.createElement('div');
    folderContent.style.cssText = "width: 100%; display: none; margin-top: 4px; max-height: 120px; overflow-y: auto; padding-left: 5px;";
    
    session.messages.forEach(m => {
      const msgLine = document.createElement('div');
      msgLine.style.cssText = "font-size: 10px; margin-bottom: 3px; color: #ffffff;";
      msgLine.innerHTML = `<b>${m.role === 'user' ? 'You' : 'Jarvis'}:</b> ${m.text} <span style="font-size:8px; opacity:0.6;">[${m.time}]</span>`;
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
};

if (clearAllHistoryBtn) {
  clearAllHistoryBtn.addEventListener('click', () => {
    SESSIONS = [];
    currentSession = { id: Date.now(), title: "New Conversation", date: format12HourTime(new Date()), messages: [] };
    saveSessions();
    renderHistoryFolders();
    if (chat) chat.innerHTML = '';
  });
}

/* =========================================================
   10. EVENT LISTENERS & MODAL BINDINGS
   ========================================================= */
if (executeBtn) executeBtn.addEventListener('click', handleUserCommand);
if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUserCommand(); });

if (memoryBtn) {
  memoryBtn.addEventListener('click', () => {
    renderCustomMemories();
    if (memoryModal) {
      memoryModal.style.display = 'block';
      if (memorySearchInput) { memorySearchInput.value = ''; setTimeout(() => memorySearchInput.focus(), 150); }
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (currentSession.messages.length > 0) {
      SESSIONS.unshift(currentSession);
      saveSessions();
    }
    currentSession = { id: Date.now(), title: "New Conversation", date: format12HourTime(new Date()), messages: [] };
    if (chat) chat.innerHTML = '';
    speak("Chat display cleared, Boss.");
  });
}

if (apiKeyBtn) {
  apiKeyBtn.addEventListener('click', () => {
    const newKey = prompt('Update Gemini API Key:', API_KEY);
    if (newKey !== null) {
      API_KEY = newKey.trim();
      localStorage.setItem('jarvis_key', API_KEY);
      alert('API Key updated successfully, Boss.');
    }
  });
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    renderHistoryFolders();
    if (historyModal) historyModal.style.display = 'block';
  });
}

if (closeHistory) closeHistory.addEventListener('click', () => historyModal.style.display = 'none');
if (closeMemoryModal) closeMemoryModal.addEventListener('click', () => memoryModal.style.display = 'none');

if (galleryBtn) {
  galleryBtn.addEventListener('click', () => {
    galleryBtn.style.backgroundColor = "rgba(0, 243, 255, 0.4)";
    setTimeout(() => { galleryBtn.style.backgroundColor = ""; }, 400);
    if (imgInput) { imgInput.removeAttribute('capture'); imgInput.click(); }
  });
}

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

/* =========================================================
   11. ENHANCED VOICE RECOGNITION WITH IMMEDIATE SPEECH INTERRUPTION
   ========================================================= */
let startJarvisListening = function() {};

if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListeningActive = false;

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; 
    recognition.continuous = true;     
    recognition.interimResults = false; 

    recognition.onstart = () => {
      if (statusText) statusText.innerText = "LISTENING...";
      micBtn.style.background = "#00f3ff";
      micBtn.style.color = "#000";
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

      if (isJarvisSpeaking) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
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
        try { recognition.stop(); } catch(e){}
        addMessage(`You: ${rawTranscript}`, 'user');
        addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
        speak('Stopped Listening, Boss.');
        return;
      }

      handleUserCommand();
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (!isJarvisSpeaking && statusText) statusText.innerText = "SYSTEM ONLINE";
    };

    recognition.onend = () => {
      if (isListeningActive) {
        try {
          recognition.start();
        } catch (e) {
          setTimeout(() => { try { recognition.start(); } catch(err) {} }, 200);
        }
      } else {
        if (!isJarvisSpeaking && statusText) statusText.innerText = "SYSTEM ONLINE";
        micBtn.style.background = "";
        micBtn.style.color = "";
      }
    };
  }

  initRecognition();

  startJarvisListening = function() {
    if (!isListeningActive) {
      isListeningActive = true;
      try { recognition.start(); } catch (err) { console.log(err); }
    }
  };

  micBtn.addEventListener('click', () => {
    if (!isListeningActive) {
      isListeningActive = true;
      try {
        recognition.start();
        addMessage(`Jarvis: Active and listening continuously, Boss...`, 'ai');
        speak('Listening continuously, Boss.');
      } catch (err) { console.log(err); }
    } else {
      isListeningActive = false;
      try { recognition.stop(); } catch (err) {}
      addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
      speak('Stopped Listening, Boss.');
    }
  });
}
