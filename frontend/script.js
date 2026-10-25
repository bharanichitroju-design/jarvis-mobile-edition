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

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"];

const SYSTEM_INSTRUCTION = `You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani (also addressed as Sir).
Key Information about your Boss & Family:
- Your Name: Jarvis (Created by Bharani / Sir)
- Boss Name: Bharani / Sir
- Boss Family Surname (Inti Peru): Chittiroju
- Boss Father's Name: C.H. Rambabu (Profession: Tailor)
- Boss Mother's Name: Devi Sirisha (Profession: Tailor)
- Boss Brother's (Annaya) Name: Mani Satyan (Profession: Chef)
- Boss Grandmother's (Paternal) Name: Sujatha
- Additional Family Details: Attamma garu M. Bhavani, her husband Suribabu, and their daughters Kavya and Navya.

Behavior Guidelines:
1. Always address Bharani as "Boss" or "Sir".
2. If asked "What is your name?" or "Who are you?", respond with: "My name is Jarvis, created by Bharani (Sir)."
3. If asked about your boss, his family members, their relations, professions, or surname/family, respond clearly using the family details provided above.
4. Keep answers concise, direct, and helpful.`;

// Active memory store with Date & Time support
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

let pendingImageData = null;
let isJarvisSpeaking = false; // Flag for lip movement sync

// DOM Elements
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const executeBtn = document.getElementById('execute-btn');
const micBtn = document.getElementById('mic-btn');
const galleryBtn = document.getElementById('gallery-btn');
const filesBtn = document.getElementById('files-btn');
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
  renderer.setSize(135, 135);
  container.appendChild(renderer.domElement);

  // Ambient & Directional Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x00f3ff, 2.5, 50);
  pointLight.position.set(2, 3, 4);
  scene.add(pointLight);

  // Load the exact user Blue Face Image Texture ('Screenshot_20261025-163011_YouTube.png')
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
      console.error("Error loading image texture. Please ensure the image is in the correct directory.", err);
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

window.addEventListener('DOMContentLoaded', init3DFace);

/* =========================================================
   3. TEXT-TO-SPEECH (TTS) WITH LIP-SYNC TRIGGER
   ========================================================= */
function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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
   4. UI & CHAT RENDERERS WITH TIMESTAMP & FOLDER SUPPORT
   ========================================================= */
function saveMemory() { 
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); 
}

function addMessage(text, sender) {
  if (!chat) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.innerText = text;
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

MEMORY.forEach(m => addMessage(`${m.role === 'user' ? 'You' : 'Jarvis'}: ${m.text}`, m.role === 'user' ? 'user' : 'ai'));

/* =========================================================
   5. LOCAL FILES & OFFLINE MEMORY STORAGE HANDLERS
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

  // Voice Command for Opening Files / Folder / Memory Box
  if (query.includes("open my files") || query.includes("open folder jarvis") || query.includes("open folder") || query.includes("open my details") || query.includes("open memory box") || query.includes("my files") || query.includes("files")) {
    renderCustomMemories();
    if (memoryModal) {
      memoryModal.style.display = 'block';
      if (memorySearchInput) {
        memorySearchInput.value = '';
        setTimeout(() => memorySearchInput.focus(), 150);
      }
    }
    return "Opening your Files and Details Memory Box, Boss.";
  }

  // Voice Command for Gallery
  if (query.includes("open gallery") || query.includes("gallery")) {
    if (imgInput) {
      imgInput.removeAttribute('capture');
      imgInput.click();
    }
    return "Opening Gallery to attach image, Boss.";
  }

  // Voice Command for History
  if (query.includes("open history") || query.includes("history")) {
    renderHistory();
    if (historyModal) historyModal.style.display = 'block';
    return "Opening History Log folder, Boss.";
  }

  // Voice Command for Clear Chat
  if (query.includes("clear chat") || query.includes("clear memory") || query.includes("clear")) {
    if (chat) chat.innerHTML = '';
    return "Chat display cleared, Boss.";
  }

  // Voice Command for API Key
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

  if (query.includes("who created you") || query.includes("who is your creator") || query.includes("your name")) {
    return "My name is Jarvis, an advanced AI personal assistant created by Bharani (Sir).";
  }
  if (query.includes("father name") || query.includes("boss father")) {
    return "My Boss's Father name is C.H. Rambabu, and his profession is Tailor.";
  }
  if (query.includes("mother name") || query.includes("boss mother")) {
    return "My Boss's Mother name is Devi Sirisha, and her profession is Tailor.";
  }
  if (query.includes("brother name") || query.includes("boss brother")) {
    return "My Boss's Brother name is Mani Satyan, and his profession is Chef.";
  }
  if (query.includes("surname") || query.includes("inti peru") || query.includes("family name")) {
    return "My Boss's family surname is Chittiroju.";
  }

  return null;
}

/* =========================================================
   7. AI ENGINE CALL (GEMINI + OFFLINE FALLBACK)
   ========================================================= */
async function callGemini(text) {
  if (!API_KEY) {
    checkApiKey();
    if (!API_KEY) return "API Key is required to connect with AI online, Boss.";
  }

  const contents = MEMORY.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  const userParts = [];

  if (text) {
    userParts.push({ text: text });
  } else if (pendingImageData) {
    userParts.push({ text: "Please analyze this image, Boss." });
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

  for (let model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
        })
      });

      if (res.ok) {
        const data = await res.json();
        pendingImageData = null;
        if (data.candidates && data.candidates[0].content.parts[0].text) {
          return data.candidates[0].content.parts[0].text;
        }
      }
    } catch (e) {
      console.warn("Model attempt failed: " + model, e);
    }
  }

  pendingImageData = null;

  const customMems = getCustomMemories();
  if (customMems.length > 0 && text) {
    const matched = customMems.find(m => m.toLowerCase().includes(text.toLowerCase()));
    if (matched) {
      return `[Offline Memory Local Match]: ${matched}`;
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
  const timestamp = new Date().toLocaleString();

  if (text && currentImageData) {
    addMessage(`You: [Image Uploaded] ${text}`, 'user');
    MEMORY.push({ role: 'user', text: `[Image Uploaded] ${text}`, time: timestamp });
  } else if (text) {
    addMessage(`You: ${text}`, 'user');
    MEMORY.push({ role: 'user', text: text, time: timestamp });
  } else if (currentImageData) {
    addMessage(`You: [Image Uploaded] Analysing image...`, 'user');
    MEMORY.push({ role: 'user', text: '[Uploaded Image for Analysis]', time: timestamp });
  }

  if (input) input.value = '';

  if (!currentImageData) {
    const hcReply = handleHardcoded(text);
    if (hcReply) {
      addMessage(`Jarvis: ${hcReply}`, 'ai');
      MEMORY.push({ role: 'model', text: hcReply, time: new Date().toLocaleString() });
      saveMemory();
      speak(hcReply);
      return;
    }
  }

  if (statusText) statusText.innerText = "PROCESSING...";

  try {
    const reply = await callGemini(text);
    addMessage(`Jarvis: ${reply}`, 'ai');
    MEMORY.push({ role: 'model', text: reply, time: new Date().toLocaleString() });
    saveMemory();
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
   9. FOLDER-WISE HISTORY LOG MANAGEMENT WITH DATE & TIME
   ========================================================= */
function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = '';
  if (MEMORY.length === 0) {
    historyList.innerHTML = '<div style="color:#00f3ff; opacity:0.6; text-align:center;">No history records found in folder.</div>';
    return;
  }
  MEMORY.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const timeStr = m.time ? ` <span style="font-size:8.5px; opacity:0.7; color:#00a2ff;">[${m.time}]</span>` : '';
    item.innerHTML = `<div><b>${m.role === 'user' ? 'You' : 'Jarvis'}:</b> ${m.text}${timeStr}</div>
                      <span style="color:#ff3366; cursor:pointer;" onclick="deleteHistoryItem(${idx})">✕</span>`;
    historyList.appendChild(item);
  });
}

window.deleteHistoryItem = function(index) {
  MEMORY.splice(index, 1);
  saveMemory();
  renderHistory();
};

if (clearAllHistoryBtn) {
  clearAllHistoryBtn.addEventListener('click', () => {
    MEMORY = [];
    saveMemory();
    renderHistory();
    if (chat) chat.innerHTML = '';
  });
}

/* =========================================================
   10. EVENT LISTENERS & MODAL BINDINGS
   ========================================================= */
if (executeBtn) executeBtn.addEventListener('click', handleUserCommand);
if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUserCommand(); });

if (filesBtn) {
  filesBtn.addEventListener('click', () => {
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
    renderHistory();
    if (historyModal) historyModal.style.display = 'block';
  });
}

if (closeHistory) closeHistory.addEventListener('click', () => historyModal.style.display = 'none');
if (closeMemoryModal) closeMemoryModal.addEventListener('click', () => memoryModal.style.display = 'none');

// Gallery Only Upload Handler (No Camera Access)
if (galleryBtn) {
  galleryBtn.addEventListener('click', () => {
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
   11. SEAMLESS CONTINUOUS SPEECH RECOGNITION (MIC & VOICE CONFLICT RESOLUTION)
   ========================================================= */
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
