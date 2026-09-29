// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ 
    API_KEY = prompt('Enter your Gemini API Key:'); 
    if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); 
}

// Updated Gemini Models
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// SYSTEM INSTRUCTION FOR JARVIS IDENTITY & BOSS DETAILS
const SYSTEM_INSTRUCTION = `You are Jarvis, an advanced AI personal assistant created by your Boss, Bharani.
Key Information about your Boss & Family:
- Your Name: Jarvis (Created by Bharani)
- Boss Name: Bharani
- Boss Family Surname (Inti Peru): Chittiroju
- Boss Father's Name: C.H. Rambabu (Profession: Tailor)
- Boss Mother's Name: Devi Sirisha (Profession: Tailor)
- Boss Brother's (Annaya) Name: Mani Satyan (Profession: Chef)
- Boss Grandmother's (Paternal) Name: Sujatha

Behavior Guidelines:
1. Always address Bharani as "Boss".
2. If asked "What is your name?" or "Who are you?", respond with: "My name is Jarvis, created by Bharani."
3. If asked about your boss, his father, mother, brother, grandmother, their professions, or surname/family, respond clearly using the family details provided above.
4. Keep your responses crisp, direct, respectful, and helpful in English or Telugu as preferred by Boss.`;

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
const executeBtn = document.getElementById('execute-btn') || document.querySelector('.btn-execute') || document.querySelector('button');

// Voice Speech Output (Text-to-Speech)
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// Add message to chat UI
function add(text, sender) {
    if (!chat) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
}

// Display existing memory on load
MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'Jarvis: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. TOOLS & OFFLINE COMMAND HANDLER =====
async function handleTools(text){
    const t = text.toLowerCase().trim();

    // Identity Commands (Works Network On & Off)
    if (/^\s*(?:what\s+is\s+your\s+name|who\s+are\s+you|your\s+name)(?:\s+please)?[\s,.!?]*$/i.test(t)) {
        return "My name is Jarvis, created by Bharani.";
    }

    if (t.includes("boss name") || t.includes("who is your boss") || t.includes("your boss name")) {
        return "My boss name is Bharani, Boss.";
    }

    if (t.includes("boss father") || t.includes("boss nanna") || t.includes("father name") || t.includes("father profession") || t.includes("father work")) {
        return "My Boss's father name is C.H. Rambabu, and his profession is Tailor, Boss.";
    }

    if (t.includes("boss mother") || t.includes("boss amma") || t.includes("mother name") || t.includes("mother profession") || t.includes("mother work")) {
        return "My Boss's mother name is Devi Sirisha, and her profession is Tailor, Boss.";
    }

    if (t.includes("boss brother") || t.includes("boss annaya") || t.includes("brother name") || t.includes("brother profession") || t.includes("brother work")) {
        return "My Boss's brother name is Mani Satyan, and his profession is Chef, Boss.";
    }

    if (t.includes("grandmother") || t.includes("grand mother") || t.includes("nayanamma") || t.includes("naana waala amma")) {
        return "My Boss's grandmother name is Sujatha, Boss.";
    }

    if (t.includes("inti peru") || t.includes("surname") || t.includes("family name")) {
        return "My Boss's family surname (Inti Peru) is Chittiroju, Boss.";
    }

    // Direct Open Web Commands
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
    // First Check Offline / Direct Commands
    const toolResult = await handleTools(p);
    if(toolResult !== null) return toolResult;

    if(!API_KEY) throw new Error('Gemini API key is missing.');

    const contents = MEMORY.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    contents.push({ role: 'user', parts: [{ text: p }] });
    
    for(const m of MODELS){
        try{
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                    contents 
                })
            });
            
            if (!response.ok) continue;

            const res = await response.json();
            const text = res?.candidates?.[0]?.content?.parts?.[0]?.text;
            if(text) return text;
        }catch(e){ 
            continue; 
        }
    }
    throw new Error('All models failed to respond. Please check your network connection or API key.');
}

// ===== 5. EVENT LISTENERS =====
async function handleUserCommand() {
    const text = input ? input.value.trim() : '';
    if (!text) return;

    add('YOU: ' + text, 'user');
    MEMORY.push({ role: 'user', text });
    if (input) input.value = '';

    try {
        const reply = await callGemini(text);
        add('Jarvis: ' + reply, 'ai');
        speak(reply); // Voice reply
        MEMORY.push({ role: 'model', text: reply });
        saveMemory();
    } catch (err) {
        add('Jarvis: Error - ' + err.message, 'ai');
        speak('Error - ' + err.message);
    }
}

// Execute Button & Enter Key Press
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
        add('Jarvis: Memory cleared, Boss.', 'ai');
        speak('Memory cleared, Boss.');
    });
}

// Camera Button Fix
if (camBtn && imgInput) {
    camBtn.addEventListener('click', () => {
        imgInput.click();
    });
}

// Mic Button (Voice Recognition Input)
if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    micBtn.addEventListener('click', () => {
        recognition.start();
        add('Jarvis: Listening...', 'ai');
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (input) input.value = transcript;
        handleUserCommand();
    };
}
