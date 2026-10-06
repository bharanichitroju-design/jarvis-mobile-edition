// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}
// Stable Vision/Text Supported Models
const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];

// ===== 2. MEMORY =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && !(m.role === 'model' && /^(?:Your strong password:|ఇదిగో strong password:)/i.test(m.text)));
    if (MEMORY.length !== storedMemory.length) localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  } else {
    localStorage.removeItem('jarvis_memory');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

const chat = document.getElementById('chat');
const conversationStage = document.getElementById('conversation-stage');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const menuButton = document.getElementById('menu-btn');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const settingsOpen = document.getElementById('settings-open');
const settingsClose = document.getElementById('settings-close');
const settingsPanel = document.getElementById('settings-panel');
const settingsScrim = document.getElementById('settings-scrim');
const themeSelect = document.getElementById('theme-select');
const clearMemorySetting = document.getElementById('clear-memory-setting');
const thinkingStatus = document.getElementById('thinking-status');
const thinkingLabel = document.getElementById('thinking-label');

const HISTORY_KEY = 'jarvis_conversation_history_v1';
const ACTIVE_CONVERSATION_KEY = 'jarvis_active_conversation_v1';
let CONVERSATIONS = [];

try {
  const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  if (Array.isArray(stored)) {
    CONVERSATIONS = stored.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)).map(c => ({
      ...c,
      messages: c.messages.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    }));
  }
} catch (e) {
  localStorage.removeItem(HISTORY_KEY);
}

function makeConversationId() {
  return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function conversationTitle(messages) {
  const first = (messages || []).find(m => m && m.role === 'user' && typeof m.text === 'string');
  return first ? (first.text.replace(/\s+/g, ' ').trim().slice(0, 42) || 'New chat') : 'New chat';
}

let ACTIVE_CONVERSATION_ID = localStorage.getItem(ACTIVE_CONVERSATION_KEY) || '';
let initialConversation = CONVERSATIONS.find(c => c.id === ACTIVE_CONVERSATION_ID);
if (!initialConversation) {
  initialConversation = {
    id: makeConversationId(),
    title: conversationTitle(MEMORY),
    updatedAt: Date.now(),
    messages: MEMORY.slice(-120)
  };
  CONVERSATIONS.unshift(initialConversation);
  ACTIVE_CONVERSATION_ID = initialConversation.id;
} else {
  MEMORY = initialConversation.messages.length ? initialConversation.messages.slice(-120) : MEMORY.slice(-120);
  initialConversation.messages = MEMORY.slice(-120);
  initialConversation.title = conversationTitle(MEMORY) || initialConversation.title || 'New chat';
}
localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
localStorage.setItem(ACTIVE_CONVERSATION_KEY, ACTIVE_CONVERSATION_ID);

function currentConversation() {
  return CONVERSATIONS.find(c => c.id === ACTIVE_CONVERSATION_ID);
}

function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  const current = currentConversation();
  if (current) {
    current.messages = MEMORY.slice(-120);
    current.updatedAt = Date.now();
    current.title = conversationTitle(current.messages) || current.title || 'New chat';
    CONVERSATIONS.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    CONVERSATIONS = CONVERSATIONS.slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(CONVERSATIONS));
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, ACTIVE_CONVERSATION_ID);
    renderHistoryList();
  }
}

function renderHistoryList() {
  if (!historyList) return;
  const visible = CONVERSATIONS.filter(c => c.messages && c.messages.length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (historyCount) historyCount.textContent = visible.length ? String(visible.length) : '';
  historyList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your conversations will appear here';
    historyList.appendChild(empty);
    return;
  }

  visible.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.dataset.conversationId = item.id;
    button.setAttribute('aria-current', String(item.id === ACTIVE_CONVERSATION_ID));

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 5.5v15M9 7h6M9 10h7');
    icon.appendChild(path);

    const label = document.createElement('span');
    label.className = 'history-item-label';
    label.textContent = item.title || conversationTitle(item.messages);

    button.append(icon, label);
    button.addEventListener('click', () => switchConversation(item.id));
    historyList.appendChild(button);
  });
}

function setThinking(active, message) {
  const on = Boolean(active);
  if (on && thinkingLabel) thinkingLabel.textContent = message || 'J.A.R.V.I.S is thinking';
  document.body.classList.toggle('is-thinking', on);
  if (thinkingStatus) thinkingStatus.hidden = !on;
}

function scrollConversationToBottom() {
  if (!chat) return;
  const scroll = () => { chat.scrollTop = chat.scrollHeight; };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
  else setTimeout(scroll, 16);
}

function setReply(node, text) {
  if (!node) return;
  node.innerText = text;
  scrollConversationToBottom();
}

function activityLabel(text) {
  return String(text).replace(/^J\.A\.R\.V\.I\.S:\s*/i, '').replace(/\.{3}$/, '').trim() || 'J.A.R.V.I.S is thinking';
}

function isTransientActivity(text) {
  const clean = String(text).replace(/^J\.A\.R\.V\.I\.S:\s*/i, '');
  return /^(?:Thinking\.\.\.|Agent mode active\.|Goal analyze\b|\[\d+\/\d+\].*tool run chesthunna|Results combine chesthunna|Gemini busy undi;)/i.test(clean);
}

function closeSidebarOnMobile() {
  if (window.matchMedia('(max-width: 780px)').matches) {
    document.body.classList.remove('sidebar-open');
    if (sidebarBackdrop) sidebarBackdrop.hidden = true;
  }
}

function toggleSidebar() {
  if (window.matchMedia('(max-width: 780px)').matches) {
    const open = !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', open);
    if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
}

function switchConversation(id) {
  if (id === ACTIVE_CONVERSATION_ID) {
    closeSidebarOnMobile();
    return;
  }
  const next = CONVERSATIONS.find(c => c.id === id);
  if (!next) return;
  const current = currentConversation();
  if (current) {
    current.messages = MEMORY.slice(-120);
    current.updatedAt = Date.now();
  }
  ACTIVE_CONVERSATION_ID = id;
  MEMORY = next.messages.slice(-120);
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  chat.replaceChildren();
  MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));
  document.body.classList.toggle('has-conversation', MEMORY.length > 0);
  renderHistoryList();
  scrollConversationToBottom();
  closeSidebarOnMobile();
}

function startNewConversation() {
  if (!MEMORY.length) {
    if (input) input.focus();
    closeSidebarOnMobile();
    return;
  }
  const current = currentConversation();
  if (current) {
    current.messages = MEMORY.slice(-120);
    current.updatedAt = Date.now();
  }
  const fresh = { id: makeConversationId(), title: 'New chat', updatedAt: Date.now(), messages: [] };
  CONVERSATIONS.unshift(fresh);
  CONVERSATIONS = CONVERSATIONS.slice(0, 30);
  ACTIVE_CONVERSATION_ID = fresh.id;
  MEMORY = [];
  localStorage.setItem('jarvis_memory', '[]');
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, ACTIVE_CONVERSATION_ID);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(CONVERSATIONS));
  chat.replaceChildren();
  document.body.classList.remove('has-conversation');
  chat.scrollTop = 0;
  conversationStage.scrollTop = 0;
  renderHistoryList();
  if (input) {
    input.value = '';
    input.style.height = 'auto';
    input.focus();
  }
}

function openSettings() {
  if (settingsPanel) settingsPanel.hidden = false;
  if (settingsScrim) settingsScrim.hidden = false;
  closeSidebarOnMobile();
  if (settingsClose) settingsClose.focus();
}

function closeSettings() {
  if (settingsPanel) settingsPanel.hidden = true;
  if (settingsScrim) settingsScrim.hidden = true;
  if (window.matchMedia('(max-width: 780px)').matches && !document.body.classList.contains('sidebar-open')) {
    if (menuButton) menuButton.focus();
  }
}

function applyTheme(theme) {
  const chosen = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = chosen;
  localStorage.setItem('jarvis_theme', chosen);
  if (themeSelect) themeSelect.value = chosen;
}

renderHistoryList();
applyTheme(localStorage.getItem('jarvis_theme') || 'dark');
MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. TOOLS =====
async function fetchToolJson(url, options = {}, timeoutMs = 10000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    if (!response.ok) throw new Error('Request failed (' + response.status + ').');
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function handleTools(text) {
  const t = text.toLowerCase();

  if (/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
    return 'Opening YouTube, Boss.';
  }
  if (/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://google.com', '_blank', 'noopener,noreferrer');
    return 'Opening Google, Boss.';
  }

  const urlCommand = text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
  if (urlCommand) {
    try {
      const destination = new URL(urlCommand[1]);
      if (destination.protocol !== 'https:' && destination.protocol !== 'http:') return 'Only http and https links can be opened.';
      window.open(destination.href, '_blank', 'noopener,noreferrer');
      return 'Opening ' + destination.hostname + ', Boss.';
    } catch (e) {
      return 'That link does not look valid.';
    }
  }

  if (/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s*$/i.test(text)) return 'Tell me what to search for on Google.';
  const googleSearch = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)\s*$/i);
  if (googleSearch) {
    const query = googleSearch[1].trim();
    if (!query) return 'Tell me what to search for on Google.';
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
    return 'Searching Google for ' + query + ', Boss.';
  }

  if (/^\s*(?:play|youtube\s+search|search\s+(?:on\s+)?youtube)(?:\s+for)?\s*$/i.test(text)) return 'Tell me a song or search phrase for YouTube.';
  const playMatch = text.match(/^\s*play\s+(.+?)\s*$/i);
  const youtubeMatch = text.match(/^\s*youtube(?:\s+search)?(?:\s+for)?\s+(.+?)\s*$/i);
  const searchYoutubeMatch = text.match(/^\s*search\s+(?:on\s+)?youtube(?:\s+for)?\s+(.+?)\s*$/i);
  const videoQuery = (playMatch || youtubeMatch || searchYoutubeMatch)?.[1]?.trim();
  if (videoQuery) {
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(videoQuery), '_blank', 'noopener,noreferrer');
    return 'Searching YouTube for ' + videoQuery + ', Boss.';
  }

  if (/\b(?:what time(?: is it)?|what is the time|current time|tell me the time|time now)\b/.test(t) || /^\s*time(?:\s+please)?[.!?]*\s*$/.test(t) || t.includes('టైమ్') || t.includes('సమయం') || t.includes('samayam')) {
    return 'The time is ' + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) + ' IST, Boss.';
  }

  return null;
}

// ===== 4. GEMINI BRAIN =====
async function callGemini(p) {
  if (!API_KEY) throw new Error('Gemini API key is missing. Reload the page and enter your key.');
  const contents = MEMORY.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: p }] });
  let lastErr;

  for (const m of MODELS) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You are J.A.R.V.I.S, a friendly personal assistant for Sir. Reply naturally in a warm Telugu-English mix (Telugish), mostly using simple clear language.' }]
          },
          contents
        })
      });

      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error.message || 'Gemini request failed.');
        continue;
      }

      const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n');
      if (reply) return reply;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini request failed.');
}

async function askGemini(p) {
  setThinking(true, 'J.A.R.V.I.S is thinking');
  setJarvisVisualState('THINKING');
  const replyNode = add('J.A.R.V.I.S: Thinking...', 'ai', true);
  try {
    let toolReply = await handleTools(p);
    if (toolReply) {
      MEMORY.push({ role: 'user', text: p });
      MEMORY.push({ role: 'model', text: toolReply });
      saveMemory();
      setReply(replyNode, 'J.A.R.V.I.S: ' + toolReply);
      setJarvisVisualState('SPEAKING');
      speak(toolReply);
      setTimeout(() => setJarvisVisualState('IDLE'), 2500);
      return;
    }

    const reply = await callGemini(p);
    MEMORY.push({ role: 'user', text: p });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();
    setReply(replyNode, 'J.A.R.V.I.S: ' + reply);
    setJarvisVisualState('SPEAKING');
    speak(reply);
    setTimeout(() => setJarvisVisualState('IDLE'), 2500);
  } catch (e) {
    console.error('J.A.R.V.I.S request failed:', e);
    setJarvisVisualState('ERROR');
    setReply(replyNode, 'J.A.R.V.I.S: ERROR - ' + (e?.message || 'Request failed.'));
    setTimeout(() => setJarvisVisualState('IDLE'), 2000);
  } finally {
    setThinking(false);
  }
}

// ===== 5. VISION (CAMERA) =====
if (camBtn && imgInput) {
  camBtn.onclick = () => imgInput.click();
  imgInput.onchange = () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const q = (input ? input.value.trim() : '') || 'What do you see? Describe briefly in Telugu.';
      add('YOU: [IMAGE] ' + q, 'user');
      if (input) input.value = '';
      askVision(base64, file.type || 'image/jpeg', q);
    };
    reader.readAsDataURL(file);
  };
}

async function askVision(base64, mime, q) {
  setThinking(true, 'Analyzing image...');
  setJarvisVisualState('THINKING');
  const replyNode = add('J.A.R.V.I.S: Analyzing image...', 'ai', true);
  try {
    if (!API_KEY) {
      setReply(replyNode, 'J.A.R.V.I.S: ERROR - Gemini API key is missing.');
      setJarvisVisualState('ERROR');
      return;
    }

    let lastErr;
    for (const model of MODELS) {
      try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(API_KEY), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'You are J.A.R.V.I.S, a friendly personal assistant for Sir. Describe images clearly in Telugu.' }]
            },
            contents: [{
              role: 'user',
              parts: [
                { text: q },
                { inlineData: { mimeType: mime || 'image/jpeg', data: base64 } }
              ]
            }]
          })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        
        const reply = data?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n');
        if (reply) {
          setReply(replyNode, 'J.A.R.V.I.S: ' + reply);
          setJarvisVisualState('SPEAKING');
          speak(reply);
          setTimeout(() => setJarvisVisualState('IDLE'), 2500);
          return;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    setReply(replyNode, 'J.A.R.V.I.S: ERROR - ' + (lastErr?.message || 'Image analysis failed.'));
    setJarvisVisualState('ERROR');
  } finally {
    setThinking(false);
  }
}

// ===== 6. SPEECH + TTS =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = SR ? new SR() : null;
if (rec) {
  rec.lang = 'en-US';
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  rec.onend = () => {
    if (micBtn) micBtn.innerText = '🎙️';
    setJarvisVisualState('IDLE');
  };
}

if (micBtn) {
  micBtn.onclick = () => {
    if (!rec) {
      add('SYSTEM: Voice input is not supported in this browser.', 'ai');
      return;
    }
    try {
      rec.start();
      micBtn.innerText = 'LISTENING...';
      setJarvisVisualState('LISTENING');
    } catch (e) {
      micBtn.innerText = '🎙️';
    }
  };
}

let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  try { voices = window.speechSynthesis.getVoices(); } catch (e) { voices = []; }
}
loadVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

function speak(t) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  const u = new SpeechSynthesisUtterance(t);
  u.rate = 0.96;
  u.pitch = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// ===== 7. SEND + KEYBOARD EVENTS =====
function handleSendMessage() {
  if (!input) return;
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  input.style.height = 'auto';
  askGemini(t);
}

const sendBtn = document.getElementById('send');
if (sendBtn) sendBtn.onclick = handleSendMessage;

if (clearBtn) {
  clearBtn.onclick = () => {
    MEMORY = [];
    saveMemory();
    chat.replaceChildren();
    document.body.classList.remove('has-conversation');
    chat.scrollTop = 0;
    if (conversationStage) conversationStage.scrollTop = 0;
    setThinking(false);
    setJarvisVisualState('IDLE');
  };
}

function add(t, w, force = false) {
  if (!chat) return null;
  const d = document.createElement('div');
  d.className = 'msg ' + w;
  d.innerText = t;
  chat.appendChild(d);
  document.body.classList.toggle('has-conversation', chat.children.length > 0);
  scrollConversationToBottom();
  return d;
}

if (document.getElementById('new-chat')) document.getElementById('new-chat').addEventListener('click', startNewConversation);
if (menuButton) menuButton.addEventListener('click', toggleSidebar);
if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
    sidebarBackdrop.hidden = true;
  });
}
if (settingsOpen) settingsOpen.addEventListener('click', openSettings);
if (settingsClose) settingsClose.addEventListener('click', closeSettings);
if (settingsScrim) settingsScrim.addEventListener('click', closeSettings);
if (themeSelect) themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
if (clearMemorySetting) {
  clearMemorySetting.addEventListener('click', () => {
    if (clearBtn) clearBtn.click();
    closeSettings();
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (settingsPanel && !settingsPanel.hidden) closeSettings();
    document.body.classList.remove('sidebar-open');
    if (sidebarBackdrop) sidebarBackdrop.hidden = true;
  }
  if (event.key === 'Enter' && !event.shiftKey && document.activeElement === input) {
    event.preventDefault();
    handleSendMessage();
  }
});

if (input) {
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  });
}

document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  if (input) {
    input.value = button.dataset.prompt || '';
    input.focus();
    input.dispatchEvent(new Event('input'));
  }
}));

// ===== ORBS INITIALIZATION =====
let orbInstance = null;

function initOrbs() {
  const container = document.getElementById('jarvis-core-container');
  if (!container || typeof Orbs === 'undefined') return;
  try {
    orbInstance = new Orbs(container, {
      colorPrimary: '#00ffff',
      colorSecondary: '#ff00ff',
      speed: 0.5,
      complexity: 5
    });
  } catch(e) {
    console.log("Orbs library missing or failed to initialize", e);
  }
}

function setJarvisVisualState(state) {
  if (!orbInstance) return;
  try {
    switch (state) {
      case 'IDLE':
        if (orbInstance.setSpeed) orbInstance.setSpeed(0.5);
        if (orbInstance.setColor) orbInstance.setColor('#00ffff');
        break;
      case 'LISTENING':
        if (orbInstance.setSpeed) orbInstance.setSpeed(1.5);
        if (orbInstance.setColor) orbInstance.setColor('#00ff00');
        break;
      case 'THINKING':
        if (orbInstance.setSpeed) orbInstance.setSpeed(3.0);
        if (orbInstance.setColor) orbInstance.setColor('#ffa500');
        break;
      case 'SPEAKING':
        if (orbInstance.setSpeed) orbInstance.setSpeed(1.0);
        if (orbInstance.setColor) orbInstance.setColor('#00ccff');
        break;
      case 'ERROR':
        if (orbInstance.setColor) orbInstance.setColor('#ff0000');
        break;
    }
  } catch (e) {
    console.error("Orb state update error:", e);
  }
}

window.addEventListener('load', () => {
  initOrbs();
  setJarvisVisualState('IDLE');
});
