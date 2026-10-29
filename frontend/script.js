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
3. Keep answers concise, direct, and helpful. Utilize the user's saved memory files and offline notes when requested.`;

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

// 3D Workspace Array Stores: { label: 'f1', mesh: Mesh, type: 'image'|'text', mode: '3d'|'natural', originalTexture: Texture, threeDTexture: Texture, data: Base64, content: String }
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

// History Modal Elements
const settingsBtn = document.getElementById('settings-btn');
const historyModal = document.getElementById('history-modal');
const closeHistory = document.getElementById('close-history');
const historyList = document.getElementById('history-list');
const clearAllHistoryBtn = document.getElementById('clear-all-history');

// Memory Modal Elements
const memoryModal = document.getElementById('memory-modal');
const closeMemoryModal = document.getElementById('close-memory-modal');
const memorySearchInput = document.getElementById('memory-search-input');
const customMemoryInput = document.getElementById('custom-memory-input');
const saveCustomMemory = document.getElementById('save-custom-memory');
const savedMemoryList = document.getElementById('saved-memory-list');

/* =========================================================
   1.5. IN-APP 3D WORKSPACE MODAL & IRON MAN HOLOGRAM ENGINE
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
    if (!audioCtx3D) {
      audioCtx3D = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx3D.state === 'suspended') {
      audioCtx3D.resume();
    }
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
      <div style="width:90%; max-width:800px; height:85vh; background:#000f1e; border:2px solid #00ffff; box-shadow:0 0 30px rgba(0,255,255,0.7); display:flex; flex-direction:column; border-radius:10px; overflow:hidden; font-family:monospace; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:rgba(0,30,60,0.95); border-bottom:1px solid #00ffff; z-index:10;">
          <span id="td-hud-status" style="color:#00ffff; font-weight:bold; font-size:12px; letter-spacing:1px;">3D WORKSPACE INITIALIZED (1-Finger Rotate | 2-Finger Move & Pinch Zoom)</span>
          <button id="close-td-box" style="background:none; border:none; color:#ff3366; font-size:20px; font-weight:bold; cursor:pointer;">✕</button>
        </div>
        
        <div id="td-box-viewport" style="flex:1; width:100%; background:#010814; position:relative; overflow:hidden;"></div>

        <!-- Trash Bin Inside Modal -->
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
  camera3DBox.position.set(0, 25, 60);
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

  const gridHelper = new THREE.GridHelper(150, 150, 0x00ffff, 0x003355);
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

/* =========================================================
   RESIZED SMALLER MAP POINTING PIN GENERATOR FOR 3D HUD LABELS
   ========================================================= */
function createMapPinCanvas(fileLabel) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw Smaller Map Pin Tear-Drop Body
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

  // Draw Pin Inner Circle
  ctx.beginPath();
  ctx.arc(48, 38, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#000f1e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00f3ff';
  ctx.stroke();

  // Draw Text Label (f1, f2, f3...)
  ctx.fillStyle = '#00f3ff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fileLabel.toUpperCase(), 48, 38);

  return canvas;
}

function attachMapPinToMesh(mesh, fileLabel) {
  const pinCanvas = createMapPinCanvas(fileLabel);
  const pinTexture = new THREE.CanvasTexture(pinCanvas);
  const pinGeo = new THREE.PlaneGeometry(2.2, 2.8);
  const pinMat = new THREE.MeshBasicMaterial({
    map: pinTexture,
    transparent: true,
    side: THREE.DoubleSide
  });
  const pinMesh = new THREE.Mesh(pinGeo, pinMat);
  
  pinMesh.position.set(0, 7.4, 0.1);
  mesh.add(pinMesh);
}

// ULTRA-CLEAR 3D TEXTURE WITH PERFECT BLUE TINT & PRESERVED CLARITY
function create3DTexture(imgObj) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Draw original image with full crisp resolution
  ctx.drawImage(imgObj, 0, 0, 512, 512);

  // Apply clear blue overlay without distorting text/lines
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0, 180, 255, 0.32)';
  ctx.fillRect(0, 0, 512, 512);

  return new THREE.CanvasTexture(canvas);
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
    content: val 
  });

  textInput.value = '';
  if (hud) hud.innerText = `TEXT SPAWNED AS ${fileLabel.toUpperCase()}. SILENTLY SAVED.`;
}

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
      const threeDTexture = create3DTexture(img);

      const geometry = new THREE.PlaneGeometry(12, 12);
      const material = new THREE.MeshBasicMaterial({
        map: threeDTexture, // Default state: 3D Blue Tint Mode
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
        fileName: file.name 
      });

      if (hud) hud.innerText = `IMAGE UPLOADED AS ${fileLabel.toUpperCase()}. SILENTLY SAVED.`;
    };
  };
  reader.readAsDataURL(file);
  this.value = '';
}

function removeFileByLabel(fileLabel) {
  const targetIndex = workspaceFiles3D.findIndex(f => f.label.toLowerCase() === fileLabel.toLowerCase());
  if (targetIndex > -1) {
    const targetObj = workspaceFiles3D[targetIndex];
    playTrashSound3D();
    if (desktopGroup3D && targetObj.mesh) {
      desktopGroup3D.remove(targetObj.mesh);
    }
    const loadedIdx = loadedObjects3D.indexOf(targetObj.mesh);
    if (loadedIdx > -1) loadedObjects3D.splice(loadedIdx, 1);
    workspaceFiles3D.splice(targetIndex, 1);
    
    if (selectedObject3D === targetObj.mesh) selectedObject3D = null;
    return true;
  }
  return false;
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

  desktopGroup3D.remove(selectedObject3D);
  const index = loadedObjects3D.indexOf(selectedObject3D);
  if (index > -1) {
    loadedObjects3D.splice(index, 1);
    workspaceFiles3D.splice(index, 1);
  }

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
      if (!selectedObject3D) {
        const t1 = curTouches[0];
        const prevT1 = touches3D[0] || t1;
        const dx = t1.clientX - prevT1.clientX;
        const dy = t1.clientY - prevT1.clientY;
        desktopGroup3D.position.x += dx * 0.05;
        desktopGroup3D.position.y -= dy * 0.05;
      }
    }
    touches3D = curTouches;
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    const trashBin = document.getElementById('td-trash-bin');
    if (selectedObject3D && checkTrashCollision3D(lastTClientX, lastTClientY)) {
      deleteSelectedObject3D();
    } else {
      if (trashBin) trashBin.classList.remove('highlight');
    }
    touches3D = e.touches;
    if (e.touches.length < 2) initialPinchDist = null;
  });

  viewport.addEventListener('mousedown', (e) => {
    isMouseDown3D = true;
    prevMousePos3D = { x: e.clientX, y: e.clientY };
  });

  viewport.addEventListener('mousemove', (e) => {
    if (!isMouseDown3D) return;
    const dx = e.clientX - prevMousePos3D.x;
    const dy = e.clientY - prevMousePos3D.y;
    const trashBin = document.getElementById('td-trash-bin');

    if (selectedObject3D) {
      selectedObject3D.position.x += dx * 0.05;
      selectedObject3D.position.y -= dy * 0.05;
      if (selectedObject3D.position.y < 1) selectedObject3D.position.y = 1;

      if (checkTrashCollision3D(e.clientX, e.clientY)) {
        if (trashBin) trashBin.classList.add('highlight');
      } else {
        if (trashBin) trashBin.classList.remove('highlight');
      }
    } else {
      desktopGroup3D.rotation.y += dx * 0.008;
      desktopGroup3D.rotation.x += dy * 0.008;
      desktopGroup3D.rotation.x = Math.max(-Math.PI / 12, Math.min(Math.PI / 2, desktopGroup3D.rotation.x));
    }
    prevMousePos3D = { x: e.clientX, y: e.clientY };
  });

  viewport.addEventListener('mouseup', (e) => {
    isMouseDown3D = false;
    const trashBin = document.getElementById('td-trash-bin');
    if (selectedObject3D && checkTrashCollision3D(e.clientX, e.clientY)) {
      deleteSelectedObject3D();
    } else {
      if (trashBin) trashBin.classList.remove('highlight');
    }
  });

  viewport.addEventListener('wheel', (e) => {
    if (selectedObject3D) {
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.2, Math.min(5, selectedObject3D.scale.x * scaleFactor));
      selectedObject3D.scale.set(newScale, newScale, newScale);
    } else {
      camera3DBox.position.z = Math.max(10, Math.min(120, camera3DBox.position.z + e.deltaY * 0.04));
    }
  });
}

/* =========================================================
   2. THREE.JS 3D FACE IMAGE & LIP-SYNC ANIMATION
   ========================================================= */
let scene, camera, renderer, faceMesh;

function init3DFace() {
  const container = document.getElementById('face-container');
  if (!container) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.z = 4.2;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(290, 290);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x00f3ff, 2.5, 50);
  pointLight.position.set(2, 3, 4);
  scene.add(pointLight);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    'Screenshot_20261025-163011_YouTube.png',
    (texture) => {
      const geometry = new THREE.PlaneGeometry(2.6, 2.6);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      faceMesh = new THREE.Mesh(geometry, material);
      scene.add(faceMesh);
    },
    undefined,
    (err) => {
      console.error("Error loading texture:", err);
    }
  );

  animateFace();
}

function animateFace() {
  requestAnimationFrame(animateFace);
  
  if (faceMesh) {
    faceMesh.position.y = Math.sin(Date.now() * 0.003) * 0.04;

    if (isJarvisSpeaking) {
      const time = Date.now() * 0.025;
      faceMesh.scale.y = 1 + Math.sin(time) * 0.12;
      faceMesh.scale.x = 1 + Math.cos(time * 0.7) * 0.02;
    } else {
      faceMesh.scale.y += (1 - faceMesh.scale.y) * 0.1;
      faceMesh.scale.x += (1 - faceMesh.scale.x) * 0.1;
    }
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  init3DFace();
  
  setTimeout(() => {
    const welcomeText = "Hi Sir, Your Jarvis was activated, ఏం చేద్దామో చెప్పండి సార్";
    addMessage(`Jarvis: ${welcomeText}`, 'ai');
    currentSession.messages.push({ role: 'model', text: welcomeText, time: format12HourTime(new Date()) });
    speak(welcomeText);
    
    if (typeof startJarvisListening === 'function') {
      startJarvisListening();
    }
  }, 1000);
});

/* =========================================================
   3. TEXT-TO-SPEECH (TTS) WITH CLEANED TEXT & LIP-SYNC
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
  memorySearchInput.addEventListener('input', (e) => {
    renderCustomMemories(e.target.value);
  });
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
   6. HARDCODED COMMANDS & VOICE BUTTON ROUTING
   ========================================================= */
function handleHardcoded(text) {
  if (!text) return null;
  const query = text.toLowerCase().trim();

  // 1. CLEAR CHAT (Strictly triggered by "clear jarvis" command)
  if (query === "clear jarvis" || query.includes("clear jarvis")) {
    if (currentSession.messages.length > 0) {
      SESSIONS.unshift(currentSession);
      saveSessions();
    }
    currentSession = {
      id: Date.now(),
      title: "New Conversation",
      date: format12HourTime(new Date()),
      messages: []
    };
    if (chat) chat.innerHTML = '';
    return "Chat display cleared and moved to history folder, Boss.";
  }

  // 2. DYNAMIC DELETE FILE COMMAND ("delete f1", "delete f2", "delete f10", etc.)
  if (query.includes("delete")) {
    const deleteMatch = query.match(/delete\s+(f\d+)/i);
    if (deleteMatch) {
      const targetLabel = deleteMatch[1];
      const removed = removeFileByLabel(targetLabel);
      if (removed) {
        return `File ${targetLabel.toUpperCase()} removed from 3D Workspace, Boss.`;
      } else {
        return `File ${targetLabel.toUpperCase()} not found in 3D Workspace, Boss.`;
      }
    }
  }

  // 3. RENDERING CONTROL: GLOBAL COMMANDS
  if (query === "natural all files" || query === "all files natural") {
    workspaceFiles3D.forEach(f => {
      if (f.type === 'image' && f.originalTexture) {
        f.mesh.material.map = f.originalTexture;
        f.mesh.material.needsUpdate = true;
        f.mode = 'natural';
      }
    });
    return "All workspace files switched to Natural Color Rendering, Boss.";
  }

  if (query === "all files 3d" || query === "3d all files") {
    workspaceFiles3D.forEach(f => {
      if (f.type === 'image' && f.threeDTexture) {
        f.mesh.material.map = f.threeDTexture;
        f.mesh.material.needsUpdate = true;
        f.mode = '3d';
      }
    });
    return "All workspace files switched to 3D Rendering, Boss.";
  }

  // 4. RENDERING CONTROL: DYNAMIC FILE COMMANDS ("natural f1", "3d f2", "natural f4", etc.)
  const fileMatch = query.match(/f\d+/i);
  if (fileMatch && workspaceFiles3D.length > 0) {
    const fileLabel = fileMatch[0].toLowerCase();
    const target = workspaceFiles3D.find(f => f.label.toLowerCase() === fileLabel);

    if (target) {
      if (query.includes("natural")) {
        if (target.type === 'image' && target.originalTexture) {
          target.mesh.material.map = target.originalTexture;
          target.mesh.material.needsUpdate = true;
          target.mode = 'natural';
        }
        return `File ${target.label.toUpperCase()} set to Natural Render mode, Boss.`;
      }

      if (query.includes("3d")) {
        if (target.type === 'image' && target.threeDTexture) {
          target.mesh.material.map = target.threeDTexture;
          target.mesh.material.needsUpdate = true;
          target.mode = '3d';
        }
        return `File ${target.label.toUpperCase()} set to 3D Render mode, Boss.`;
      }
    }
  }

  // 5. UI NAVIGATION COMMANDS
  if (query.includes("smart open three dimensional") || query.includes("open three dimensional") || query.includes("three dimensional") || query.includes("3d workspace")) {
    open3DWorkspaceModal();
    return "Initializing 3D Workspace Table, Boss.";
  }

  if (query.includes("go back") || query.includes("go to home") || query.includes("home") || query.includes("back")) {
    if (historyModal) historyModal.style.display = 'none';
    if (memoryModal) memoryModal.style.display = 'none';
    close3DWorkspaceModal();
    return "Returned to home screen, Boss.";
  }

  if (query.includes("open memory") || query.includes("open my files") || query.includes("open folder jarvis") || query.includes("open folder") || query.includes("open my details") || query.includes("open memory box") || query.includes("memory")) {
    renderCustomMemories();
    if (memoryModal) {
      memoryModal.style.display = 'block';
      if (memorySearchInput) {
        memorySearchInput.value = '';
        setTimeout(() => memorySearchInput.focus(), 150);
      }
    }
    return "Opening your Memory Box, Boss.";
  }

  if (query.includes("open gallery") || query.includes("gallery")) {
    if (galleryBtn) {
      galleryBtn.style.backgroundColor = "rgba(0, 243, 255, 0.4)";
      setTimeout(() => { galleryBtn.style.backgroundColor = ""; }, 400);
    }
    if (imgInput) {
      imgInput.removeAttribute('capture');
      imgInput.click();
    }
    return "Opening Gallery to attach image, Boss.";
  }

  if (query.includes("open history") || query.includes("history")) {
    renderHistoryFolders();
    if (historyModal) historyModal.style.display = 'block';
    return "Opening History Folders, Boss.";
  }

  if (query.includes("open key") || query.includes("key") || query.includes("api key")) {
    const newKey = prompt('Update Gemini API Key:', API_KEY);
    if (newKey !== null) {
      API_KEY = newKey.trim();
      localStorage.setItem('jarvis_key', API_KEY);
      alert('API Key updated successfully, Boss.');
    }
    return "API Key configuration opened, Boss.";
  }

  if (query.includes("open youtube")) {
    window.open("https://www.youtube.com", "_blank");
    return "Opening YouTube, Boss.";
  }
  if (query.includes("open google")) {
    window.open("https://www.google.com", "_blank");
    return "Opening Google Search, Boss.";
  }

  return null;
}

/* =========================================================
   7. ROBUST AI ENGINE CALL WITH EXPLICIT 3D FILE QUERY SUPPORT
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

  let targetFile = null;
  if (text) {
    const lowerText = text.toLowerCase();
    const match = lowerText.match(/f\d+/i);
    if (match && workspaceFiles3D.length > 0) {
      const labelQuery = match[0].toLowerCase();
      targetFile = workspaceFiles3D.find(f => f.label.toLowerCase() === labelQuery);
    }
  }

  if (targetFile) {
    if (targetFile.type === 'image') {
      pendingImageData = {
        mimeType: targetFile.mimeType,
        data: targetFile.data
      };
      contextualInstruction += `\n\n[Active Target File Analysis]: The Boss is asking about file ${targetFile.label.toUpperCase()}. Perform a deep, thorough analysis of this image file.`;
    } else if (targetFile.type === 'text') {
      contextualInstruction += `\n\n[Active Target File Analysis]: The Boss is asking about file ${targetFile.label.toUpperCase()} containing text: "${targetFile.content}". Explain and analyze this text in detail.`;
    }
  } else {
    if (workspaceFiles3D.length > 0) {
      const summaryList = workspaceFiles3D.map(f => f.type === 'text' ? `${f.label.toUpperCase()}: Text("${f.content}")` : `${f.label.toUpperCase()}: Image(${f.fileName})`).join(', ');
      contextualInstruction += `\n\n[Current 3D Workspace Files Available]: ${summaryList}. (Remember: Do not analyze unless explicitly asked for a specific file like 'f1').`;
    }
  }

  const isOfflineQuery = text && text.toLowerCase().includes("offline");

  if (isOfflineQuery) {
    const cleanQuery = text.replace(/offline/gi, "").trim();
    const matchedDoc = customMems.find(m => m.toLowerCase().includes(cleanQuery.toLowerCase()));
    if (matchedDoc) {
      return `[Offline Document Match]: ${matchedDoc}`;
    }
  } else {
    if (customMems.length > 0) {
      contextualInstruction += `\n\nUser's Saved Personal & Family Details (Memory Files):\n- ${customMems.join("\n- ")}`;
    }
  }

  const contents = currentSession.messages.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  const userParts = [];

  if (text) {
    userParts.push({ text: text });
  } else if (pendingImageData) {
    userParts.push({ text: "Please analyze this file, Boss." });
  }

  if (pendingImageData) {
    userParts.push({
      inline_data: {
        mime_type: pendingImageData.mimeType,
        data: pendingImageData.data
      }
    });
  }

  contents.push({ role: 'user', parts: userParts });

  if (statusText) statusText.innerText = "SEARCHING WEB & AI...";

  for (let model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          system_instruction: { parts: [{ text: contextualInstruction }] },
          tools: [{ googleSearch: {} }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        pendingImageData = null;
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
          return data.candidates[0].content.parts[0].text;
        }
      }
    } catch (e) {
      console.warn("Search-enabled model attempt failed: " + model, e);
    }
  }

  for (let model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          system_instruction: { parts: [{ text: contextualInstruction }] }
        })
      });

      if (res.ok) {
        const data = await res.json();
        pendingImageData = null;
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
          return data.candidates[0].content.parts[0].text;
        }
      }
    } catch (e) {
      console.warn("Fallback model attempt failed: " + model, e);
    }
  }

  pendingImageData = null;

  if (customMems.length > 0 && text) {
    const matched = customMems.find(m => m.toLowerCase().includes(text.toLowerCase()));
    if (matched) {
      return `[Local Memory Matrix Match]: ${matched}`;
    }
  }

  return "Network connection unavailable or API limit reached. Local Memory Matrix active, Boss.";
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
    currentSession = {
      id: Date.now(),
      title: "New Conversation",
      date: format12HourTime(new Date()),
      messages: []
    };
    if (chat) chat.innerHTML = '';
  }
  saveSessions();
  renderHistoryFolders();
};

if (clearAllHistoryBtn) {
  clearAllHistoryBtn.addEventListener('click', () => {
    SESSIONS = [];
    currentSession = {
      id: Date.now(),
      title: "New Conversation",
      date: format12HourTime(new Date()),
      messages: []
    };
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
      if (memorySearchInput) {
        memorySearchInput.value = '';
        setTimeout(() => memorySearchInput.focus(), 150);
      }
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (currentSession.messages.length > 0) {
      SESSIONS.unshift(currentSession);
      saveSessions();
    }
    currentSession = {
      id: Date.now(),
      title: "New Conversation",
      date: format12HourTime(new Date()),
      messages: []
    };
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
    if (imgInput) {
      imgInput.removeAttribute('capture');
      imgInput.click();
    }
  });
}

if (imgInput) {
  imgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Data = evt.target.result.split(',')[1];
        pendingImageData = {
          mimeType: file.type,
          data: base64Data
        };
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
   11. SPEECH RECOGNITION (AUTO START)
   ========================================================= */
let startJarvisListening = function() {};

if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListeningActive = false;

  function initRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      if (statusText) statusText.innerText = "LISTENING...";
      micBtn.style.background = "#00f3ff";
      micBtn.style.color = "#000";
    };

    recognition.onresult = (event) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const transcript = event.results[0][0].transcript.trim();
      if (!transcript) return;

      if (transcript.toLowerCase().includes("smart stop listening") || transcript.toLowerCase().includes("stop listening")) {
        isListeningActive = false;
        try { recognition.stop(); } catch(e){}
        addMessage(`You: ${transcript}`, 'user');
        addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
        speak('Stopped Listening, Boss.');
        return;
      }

      if (input) input.value = transcript;
      handleUserCommand();
    };

    recognition.onerror = () => {
      if (!isJarvisSpeaking && statusText) statusText.innerText = "SYSTEM ONLINE";
    };

    recognition.onend = () => {
      if (isListeningActive) {
        try {
          recognition.start();
        } catch (e) {
          setTimeout(() => {
            try { recognition.start(); } catch(err) {}
          }, 200);
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
      try {
        recognition.start();
      } catch (err) {
        console.log(err);
      }
    }
  };

  micBtn.addEventListener('click', () => {
    if (!isListeningActive) {
      isListeningActive = true;
      try {
        recognition.start();
        addMessage(`Jarvis: Listening continuously, Boss...`, 'ai');
        speak('Listening continuously, Boss.');
      } catch (err) {
        console.log(err);
      }
    } else {
      isListeningActive = false;
      try {
        recognition.stop();
      } catch (err) {}
      addMessage(`Jarvis: Stopped Listening, Boss.`, 'ai');
      speak('Stopped Listening, Boss.');
    }
  });
}
