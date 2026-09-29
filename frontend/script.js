// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ 
    API_KEY = prompt('Enter your Gemini API Key:'); 
    if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); 
}
const MODELS = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-flash-latest"];

// ===== 2. MEMORY =====
let MEMORY = [];
try {
    const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
    if (Array.isArray(storedMemory)) {
        MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string');
    }
} catch (e) {
    localStorage.removeItem('jarvis_memory');
}

function saveMemory(){ 
    localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); 
}

// UI Elements
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const executeBtn = document.getElementById('execute-btn') || document.querySelector('.btn-execute');

// Add message to chat screen
function add(text, sender) {
    if (!chat) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
}

// Display existing memory on load
MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. TOOLS (THE HANDS) =====
async function fetchToolJson(url, options={}, timeoutMs=10000){
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
        if(timeoutId) clearTimeout(timeoutId);
        return await response.json();
    } catch(e) {
        if(timeoutId) clearTimeout(timeoutId);
        throw e;
    }
}

async function handleTools(text){
    const t = text.toLowerCase().trim();

    // Direct Open Commands
    if(/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)(?:\s+please)?[\s,.!?]*$/i.test(text)){ 
        window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
        return 'Opening YouTube, Boss.'; 
    }

    if(/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)(?:\s+please)?[\s,.!?]*$/i.test(text)){ 
        window.open('https://google.com', '_blank', 'noopener,noreferrer');
        return 'Opening Google, Boss.'; 
    }

    // Search Commands
    const playMatch = text.match(/^\s*(?:play|youtube|search youtube for)\s+(.+?)\s*$/i);
    if(playMatch && playMatch[1]){
        const query = playMatch[1].trim();
        window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
        return 'Searching YouTube for ' + query + ', Boss.';
    }

    const googleSearch = text.match(/^\s*(?:google search|search google for)\s+(.+?)\s*$/i);
    if(googleSearch && googleSearch[1]){
        const query = googleSearch[1].trim();
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
        return 'Searching Google for ' + query + ', Boss.';
    }

    return null;
}

// ===== 4. GEMINI BRAIN =====
async function callGemini(p){
    if(!API_KEY) throw new Error('Gemini API key is missing.');

    const toolResult = await handleTools(p);
    if(toolResult !== null) return toolResult;

    const contents = MEMORY.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    contents.push({ role: 'user', parts: [{ text: p }] });
    
    for(const m of MODELS){
        try{
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });
            const res = await response.json();
            const text = res?.candidates?.[0]?.content?.parts?.[0]?.text;
            if(text) return text;
        }catch(e){ 
            continue; 
        }
    }
    throw new Error('All models failed to respond.');
}

// ===== 5. EVENT LISTENERS (KEY FIX) =====
async function handleUserCommand() {
    const text = input ? input.value.trim() : '';
    if (!text) return;

    add('YOU: ' + text, 'user');
    MEMORY.push({ role: 'user', text });
    if (input) input.value = '';

    try {
        const reply = await callGemini(text);
        add('J.A.R.V.I.S: ' + reply, 'ai');
        MEMORY.push({ role: 'model', text: reply });
        saveMemory();
    } catch (err) {
        add('J.A.R.V.I.S: Error - ' + err.message, 'ai');
    }
}

// Execute Button or Enter Key Press
if (executeBtn) {
    executeBtn.addEventListener('click', handleUserCommand);
}

if (input) {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserCommand();
    });
}

// Clear Memory Button
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        MEMORY = [];
        localStorage.removeItem('jarvis_memory');
        if (chat) chat.innerHTML = '';
        add('J.A.R.V.I.S: Memory cleared, Boss.', 'ai');
    });
}

// Mic Button (Voice Recognition)
if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    micBtn.addEventListener('click', () => {
        recognition.start();
        add('J.A.R.V.I.S: Listening...', 'ai');
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (input) input.value = transcript;
        handleUserCommand();
    };
}
