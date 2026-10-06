// State Management
let API_KEY = localStorage.getItem('JARVIS_API_KEY') || "";
let MEMORY = [];

// DOM Element Selectors
const msgInput = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const chatContainer = document.getElementById('chat');
const welcomeSection = document.getElementById('welcome');
const thinkingStatus = document.getElementById('thinking-status');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const newChatBtn = document.getElementById('new-chat');

// Sidebar & Settings DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const menuBtn = document.getElementById('menu-btn');
const settingsOpen = document.getElementById('settings-open');
const settingsClose = document.getElementById('settings-close');
const settingsPanel = document.getElementById('settings-panel');
const settingsScrim = document.getElementById('settings-scrim');
const apiKeyInput = document.getElementById('api-key-input');
const clearMemoryBtn = document.getElementById('clear-memory-setting');

// Initialize API Key Input
if (apiKeyInput) {
  apiKeyInput.value = API_KEY;
  apiKeyInput.onchange = () => {
    API_KEY = apiKeyInput.value.trim();
    localStorage.setItem('JARVIS_API_KEY', API_KEY);
  };
}

// --- UI Toggle Handlers ---
function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
}

function openSettings() {
  settingsPanel.removeAttribute('hidden');
  settingsScrim.removeAttribute('hidden');
}

function closeSettings() {
  settingsPanel.setAttribute('hidden', 'true');
  settingsScrim.setAttribute('hidden', 'true');
}

if (sidebarToggle) sidebarToggle.onclick = toggleSidebar;
if (menuBtn) menuBtn.onclick = toggleSidebar;
if (settingsOpen) settingsOpen.onclick = openSettings;
if (settingsClose) settingsClose.onclick = closeSettings;
if (settingsScrim) settingsScrim.onclick = closeSettings;

// Auto-expand Textarea
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = `${Math.min(msgInput.scrollHeight, 120)}px`;
});

// --- Helper Functions ---
function setJarvisVisualState(state) {
  console.log("[J.A.R.V.I.S State]:", state);
}

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'te-IN'; // Default Telugu Voice
    window.speechSynthesis.speak(utterance);
  }
}

function scrollToBottom() {
  const stage = document.getElementById('conversation-stage');
  stage.scrollTop = stage.scrollHeight;
}

function setThinking(isThinking, text = 'J.A.R.V.I.S is thinking...') {
  if (isThinking) {
    thinkingStatus.removeAttribute('hidden');
    document.getElementById('thinking-label').innerText = text;
  } else {
    thinkingStatus.setAttribute('hidden', 'true');
  }
}

function addMessage(text, type, returnNode = false) {
  welcomeSection.style.display = 'none';
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${type}`;
  msgDiv.innerText = text;
  chatContainer.appendChild(msgDiv);
  scrollToBottom();
  
  if (returnNode) return msgDiv;
}

function updateReply(node, text) {
  if (node) {
    node.innerText = text;
    scrollToBottom();
  }
}

function resetChat() {
  chatContainer.innerHTML = '';
  MEMORY = [];
  welcomeSection.style.display = 'block';
  closeSettings();
}

if (clearBtn) clearBtn.onclick = resetChat;
if (newChatBtn) newChatBtn.onclick = resetChat;
if (clearMemoryBtn) clearMemoryBtn.onclick = resetChat;

// --- API Request Processing ---
async function askGemini(promptText) {
  setThinking(true);
  setJarvisVisualState('THINKING');
  
  const replyNode = addMessage('J.A.R.V.I.S: Processing...', 'ai', true);

  if (!API_KEY) {
    updateReply(replyNode, 'J.A.R.V.I.S: API Key is missing. Please set your Gemini API key in Settings.');
    setThinking(false);
    setJarvisVisualState('ERROR');
    openSettings();
    return;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...MEMORY.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: promptText }] }
        ]
      })
    });

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || 'Sorry, I could not process that request.';
    
    MEMORY.push({ role: 'user', text: promptText });
    MEMORY.push({ role: 'model', text: reply });

    updateReply(replyNode, `J.A.R.V.I.S: ${reply}`);
    setJarvisVisualState('SPEAKING');
    speak(reply);

    setTimeout(() => setJarvisVisualState('IDLE'), 2000);
  } catch (e) {
    console.error('API Error:', e);
    updateReply(replyNode, 'J.A.R.V.I.S: Connection error. Please check your internet or API key.');
    setJarvisVisualState('ERROR');
  } finally {
    setThinking(false);
  }
}

// --- Action Listeners ---
sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text) return;
  
  addMessage(text, 'user');
  msgInput.value = '';
  msgInput.style.height = 'auto';
  
  askGemini(text);
};

msgInput.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
};

document.querySelectorAll('.prompt-card').forEach(card => {
  card.onclick = () => {
    const promptText = card.getAttribute('data-prompt');
    if (promptText) {
      addMessage(promptText, 'user');
      askGemini(promptText);
    }
  };
});
