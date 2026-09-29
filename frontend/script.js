// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ API_KEY = prompt('Enter your Gemini API Key:'); if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); }
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// ===== 2. MEMORY =====
let MEMORY = [];
try {
    const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
    if (Array.isArray(storedMemory)) {
        MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && !(m.role === 'model' && /^(?:Your strong password:|మీ బలమైన strong password:)/i.test(m.text)));
        if (MEMORY.length !== storedMemory.length) localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
        else { localStorage.removeItem('jarvis_memory'); }
    }
} catch (e) { localStorage.removeItem('jarvis_memory'); }
function saveMemory(){ localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); }
const chat=document.getElementById('chat');
const input=document.getElementById('msg');
const micBtn=document.getElementById('mic-btn');
const clearBtn=document.getElementById('clear-btn');
const camBtn=document.getElementById('cam-btn');
const imgInput=document.getElementById('img-input');
MEMORY.forEach(m=> add((m.role==='user'?'YOU: ':'J.A.R.V.I.S: ')+m.text, m.role==='user'?'user':'ai'));

// ===== 3. TOOLS (THE HANDS) - 16 TOOLS (Alarm Added) =====
async function fetchToolJson(url, options={}, timeoutMs=10000){
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timeoutId=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
    try{
        const response=await fetch(url,{...options,...(controller?{signal:controller.signal}:{})});
        clearTimeout(timeoutId);
        return await response.json();
    }catch(e){ throw e; }
}

async function handleTools(text){
    const t=text.toLowerCase();

    // YouTube & Google
    if(/^\s*(?:please\s*)?(?:open\s*youtube|youtube\s*open|youtube)(?:\s*please)?(?:[.,!?]\s*$|\/i.test(text)){ window.open('https://youtube.com','_blank','noopener,noreferrer'); return 'Opening YouTube, Boss.'; }
    if(/^\s*(?:please\s*)?(?:open\s*google|google\s*open|google)(?:\s*please)?(?:[.,!?]\s*$|\/i.test(text)){ window.open('https://google.com','_blank','noopener,noreferrer'); return 'Opening Google, Boss.'; }

    // Alarm Feature Integration
    const alarmMatch = text.match(/^\s*(?:set\s+)?alarm\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i);
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
            targetTime.setDate(targetTime.getDate() + 1); // Set for next day if time has passed
        }

        const timeout = targetTime.getTime() - now.getTime();
        setTimeout(() => {
            alert("🔔 Alarm ringing, Boss!");
            // Voice alert integration if available
            if('speechSynthesis' in window){
                const utterance = new SpeechSynthesisUtterance("Alarm ringing, Boss!");
                window.speechSynthesis.speak(utterance);
            }
        }, timeout);

        return `Alarm set for ${alarmMatch[1]}:${alarmMatch[2]} ${ampm}, Boss.`;
    }

    const urlCommand=text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
    if(urlCommand){
        try{
            const destination=new URL(urlCommand[1]);
            if(destination.protocol!=='https:'&&destination.protocol!=='http:') return 'Only http and https links can be opened.';
            window.open(destination.href,'_blank','noopener,noreferrer');
            return 'Opening '+destination.hostname+', Boss.';
        }catch(e){ return 'That link does not look valid.'; }
    }

    // Additional standard tool router matches can continue here...
    return null;
}

// ===== 3.5. AGENT MODE ENGINE =====
const AGENT_TOOLS = Object.freeze({
    time: async () => handleTools('current time'),
    weather: async () => handleTools('weather'),
    news: async () => handleTools('news'),
    crypto: async () => handleTools('bitcoin')
});
const AGENT_TOOL_NAMES = Object.freeze({ time: 'time', weather: 'weather', news: 'news', crypto: 'crypto' });

function isAgentModeRequest(text=''){
    const value=String(text||'');
    if(/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(value)) return true;
    if(/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(value)) return true;
    return /\bplan\b/i.test(value)&&/\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(value);
}

// ===== 4. GEMINI BRAIN =====
async function callGemini(p){
    if(!API_KEY) throw new Error('Gemini API key is missing.');
    const contents = MEMORY.slice(-12).map(m=>({role:m.role, parts:[{text:m.text}]}));
    contents.push({role:'user', parts:[{text:p}]});
    for(const m of MODELS){
        try{
            const res = await fetchToolJson(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({contents})
            });
            const text = res?.candidates?.[0]?.content?.parts?.[0]?.text;
            if(text) return text;
        }catch(e){ continue; }
    }
    throw new Error('All models failed to respond.');
}
