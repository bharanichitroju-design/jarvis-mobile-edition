// ===== 1. API KEY (Safe: browser లో మాత్రమే) =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

// ===== 2. SMART MODELS (ఆటో-ఫాల్‌బ్యాక్ సిస్టమ్) =====
const MODELS = ["gemini-3.6-flash", "gemini-3.6-flash"];
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');

// ===== 3. GEMINI BRAIN (auto-fallback) =====
async function callGemini(p) {
  let lastErr;
  for (const m of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] })
        }
      );
      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error.message);
        if (/high demand|temporar|quota|rate|unavailable|no longer available|deprecated/i.test(data.error.message)) continue;
        throw lastErr;
      }
      return data.candidates[0].content.parts[0].text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function askGemini(p) {
  add('J.A.R.V.I.S: Thinking...', 'ai');
  try {
    const reply = await callGemini(p);
    chat.lastChild.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply); // రిప్లై రాగానే వాయిస్ ద్వారా చెప్పడం
  } catch (e) {
    chat.lastChild.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  }
}

// ===== 4. SPEECH RECOGNITION (వినడం కోసం) =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = 'en-US'; // తెలుగు కావాలంటే 'te-IN' పెట్టుకోవచ్చు
  
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  
  micBtn.onclick = () => {
    rec.start();
    micBtn.innerText = 'LISTENING...';
  };
  
  rec.onend = () => {
    micBtn.innerText = '🎙️';
  };
} else {
  micBtn.style.display = 'none'; // బ్రౌజర్ సపోర్ట్ చేయకపోతే మైక్ బటన్ హైడ్ అవుతుంది
}

// ===== 5. TEXT-TO-SPEECH (మాట్లాడటం కోసం) =====
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
}
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(t) {
  const u = new SpeechSynthesisUtterance(t);
  u.rate = 1.05;
  u.pitch = 0.85;
  const v = voices.find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ===== 6. TEXT SEND BUTTON =====
const sendBtn = document.getElementById('send');
if (sendBtn) {
  sendBtn.onclick = () => {
    const t = input.value.trim();
    if (!t) return;
    add('YOU: ' + t, 'user');
    input.value = '';
    askGemini(t);
  };
}

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendBtn.click();
  }
});

function add(t, w) {
  const d = document.createElement('div');
  d.className = `msg ${w}`;
  d.innerText = t;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

