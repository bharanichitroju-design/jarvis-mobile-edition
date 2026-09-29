// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ 
    API_KEY = prompt('Enter your Gemini API Key:'); 
    if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); 
}
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

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

function saveMemory(){ 
    localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); 
}

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');

if (typeof add === 'function') {
    MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));
}

// ===== 3. TOOLS (THE HANDS) - 15 TOOLS =====
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
    const t = text.toLowerCase();

    // YouTube Direct Open
    if(/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)(?:\s+please)?[\s,.!?]*$/i.test(text)){ 
        window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
        return 'Opening YouTube, Boss.'; 
    }

    // Google Direct Open
    if(/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)(?:\s+please)?[\s,.!?]*$/i.test(text)){ 
        window.open('https://google.com', '_blank', 'noopener,noreferrer');
        return 'Opening Google, Boss.'; 
    }

    // URL Visit Command
    const urlCommand = text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
    if(urlCommand){
        try{
            const destination = new URL(urlCommand[1]);
            if(destination.protocol !== 'https:' && destination.protocol !== 'http:') return 'Only http and https links can be opened.';
            window.open(destination.href, '_blank', 'noopener,noreferrer');
            return 'Opening ' + destination.hostname + ', Boss.';
        }catch(e){ return 'That link does not look valid.'; }
    }

    // Google Search
    if(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s*$/i.test(text)) return 'Tell me what to search for on Google.';
    const googleSearch = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)\s*$/i);
    if(googleSearch){
        const query = googleSearch[1].trim();
        if(!query) return 'Tell me what to search for on Google.';
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
        return 'Searching Google for ' + query + ', Boss.';
    }

    // YouTube Search
    const playMatch = text.match(/^\s*play\s+(.+?)\s*$/i);
    const youtubeMatch = text.match(/^\s*youtube(?:\s+search)?(?:\s+for)?\s+(.+?)\s*$/i);
    const searchYoutubeMatch = text.match(/^\s*search\s+(?:on\s+)?youtube(?:\s+for)?\s+(.+?)\s*$/i);
    const videoQuery = (playMatch || youtubeMatch || searchYoutubeMatch)?.[1]?.trim();
    if(videoQuery){
        window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(videoQuery), '_blank', 'noopener,noreferrer');
        return 'Searching YouTube for ' + videoQuery + ', Boss.';
    }

    // Wikipedia Search
    const searchMatch = text.match(/^\s*(?:search|look up)\s+(?:for\s+)?(.+?)\s*$/i);
    if(searchMatch){
        const query = searchMatch[1].trim();
        if(!query) return 'Tell me what to search for.';
        try{
            const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&srsearch=' + encodeURIComponent(query) + '&format=json&origin=*';
            const data = await fetchToolJson(url);
            const result = data?.query?.search?.[0];
            if(!result) return 'I could not find that, Boss.';
            const snippet = String(result.snippet || '').replace(/<[^>]*>/g, '').replace(/"/g, '"').replace(/&#39;/g, "'").replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
            return 'Wikipedia summary: ' + result.title + (snippet ? ' ' + snippet : '');
        }catch(e){ return 'Search error, Boss.'; }
    }

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
    const value = String(text || '');
    if(/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(value)) return true;
    if(/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(value)) return true;
    return /\bplan\b/i.test(value) && /\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(value);
}

function parseAgentToolPlan(responseText){
    const text = String(responseText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = text.indexOf('['), end = text.lastIndexOf(']');
    if(start < 0 || end < start) throw new Error('Agent plan format incorrect.');
    let parsed = JSON.parse(text.slice(start, end + 1));
    const allowed = new Set(Object.keys(AGENT_TOOLS));
    return [...new Set(parsed.filter(item => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(item => allowed.has(item)))];
}

async function runAgent(goal){
    if(typeof add === 'function') add('J.A.R.V.I.S: Agent mode active.', 'ai');
    if(typeof add === 'function') add('J.A.R.V.I.S: Goal analyze chesthunna...', 'ai');
    const planPrompt = 'Select tools from ["time","weather","news","crypto"]. Goal: ' + JSON.stringify(String(goal));
    let toolsToRun;
    try{
        toolsToRun = parseAgentToolPlan(await callGeminiRaw(planPrompt));
    }catch(error){
        toolsToRun = [];
    }
    const results = {};
    for(let i = 0; i < toolsToRun.length; i++){
        const tool = toolsToRun[i];
        if(typeof add === 'function') add('J.A.R.V.I.S: [' + (i + 1) + '/' + toolsToRun.length + '] ' + AGENT_TOOL_NAMES[tool] + ' tool run chesthunna...', 'ai');
        try{ results[tool] = await AGENT_TOOLS[tool](); }catch(e){ results[tool] = 'Tool error'; }
    }
    if(typeof add === 'function') add('J.A.R.V.I.S: Results combine chesthunna...', 'ai');
    const summaryPrompt = 'Goal: ' + JSON.stringify(String(goal)) + '. Tool results: ' + JSON.stringify(results) + '. Give concise Telugu/English summary.';
    return await callGemini(summaryPrompt);
}

// ===== 4. GEMINI BRAIN =====
async function callGemini(p){
    if(!API_KEY) throw new Error('Gemini API key is missing.');

    // 1. స్థానిక టూల్స్ చెక్ చేయడం (YouTube direct open కోసం)
    const toolResult = await handleTools(p);
    if(toolResult !== null) {
        return toolResult;
    }

    // 2. లేకపోతే Gemini AI కి పంపడం
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

