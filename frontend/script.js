// ===== 1. API KEY SETUP =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ 
    API_KEY = prompt('Enter your Gemini API Key:'); 
    if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); 
}
const MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// ===== 2. MEMORY MANAGEMENT =====
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

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');

// Render existing memory to UI if add function exists
if(typeof add === 'function') {
    MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));
}

// ===== 3. TOOLS & DIRECT EXECUTION (THE HANDS) =====
async function handleTools(text){
    const t = text.toLowerCase().trim();

    // Direct YouTube Opening
    if(t.includes('open youtube') || t === 'youtube'){
        window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
        return 'Opening YouTube for you, Boss.';
    }

    // Direct Google Opening
    if(t.includes('open google') || t === 'google'){
        window.open('https://google.com', '_blank', 'noopener,noreferrer');
        return 'Opening Google for you, Boss.';
    }

    // Alarm Feature Integration
    const alarmMatch = text.match(/(?:set\s+)?alarm\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if(alarmMatch){
        const hours = parseInt(alarmMatch[1]);
        const minutes = parseInt(alarmMatch[2]);
        const ampm = alarmMatch[3] ? alarmMatch[3].toUpperCase() : '';
        
        let targetHours = hours;
        if(ampm === 'PM' && hours < 12) targetHours += 12;
        if(ampm === 'AM' && hours === 12) targetHours = 0;

        const now = new Date();
        const targetTime = new Date();
        targetTime.setHours(targetHours, minutes, 0, 0);

        if(targetTime <= now){
            targetTime.setDate(targetTime.getDate() + 1); // Next day if time passed
        }

        const timeout = targetTime.getTime() - now.getTime();
        setTimeout(() => {
            alert("🔔 Alarm ringing, Boss!");
            if('speechSynthesis' in window){
                const utterance = new SpeechSynthesisUtterance("Alarm ringing, Boss!");
                window.speechSynthesis.speak(utterance);
            }
        }, timeout);

        return `Alarm successfully set for ${alarmMatch[1]}:${alarmMatch[2]} ${ampm}, Boss.`;
    }

    // Custom URL Opening
    const urlCommand = text.match(/(?:open|visit|go to)\s+(https?:\/\/\S+)/i);
    if(urlCommand){
        try{
            const destination = new URL(urlCommand[1]);
            window.open(destination.href, '_blank', 'noopener,noreferrer');
            return 'Opening ' + destination.hostname + ', Boss.';
        }catch(e){ 
            return 'That link does not look valid.'; 
        }
    }

    return null; // Return null if no local tool matches, will route to Gemini AI
}

// ===== 4. GEMINI BRAIN & CONTROLLER =====
async function callGemini(p){
    if(!API_KEY) throw new Error('Gemini API key is missing.');

    // First, check if the input triggers a local tool action
    const toolResult = await handleTools(p);
    if(toolResult) {
        return toolResult;
    }

    // Otherwise, send context to Gemini AI
    const contents = MEMORY.slice(-12).map(m => ({role: m.role, parts: [{text: m.text}]}));
    contents.push({role: 'user', parts: [{text: p}]});

    for(const m of MODELS){
        try{
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({contents})
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
