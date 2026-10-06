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

// ===== 2. MEMORY & HISTORY =====
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

let pendingImageData = null;

// UI Elements
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const executeBtn = document.getElementById('execute-btn') || document.querySelector('.btn-execute') || document.querySelector('button');

// History UI Elements
const settingsBtn = document.getElementById('settings-btn');
const historyModal = document.getElementById('history-modal');
const closeHistory = document.getElementById('close-history');
const historyList = document.getElementById('history-list');

// Media Popup UI Elements
const mediaModal = document.getElementById('media-modal');
const closeMedia = document.getElementById('close-media');
const optCamera = document.getElementById('opt-camera');
const optGallery = document.getElementById('opt-gallery');

// Voice Speech Output (Text-to-Speech)
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;

        const setVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            let maleVoice = voices.find(voice => 
                voice.lang.includes('en') && 
                voice.name.toLowerCase().includes('male')
            );

            if (!maleVoice) {
                maleVoice = voices.find(voice => 
                    voice.lang.includes('en') && (
                        voice.name.toLowerCase().includes('david') ||
                        voice.name.toLowerCase().includes('george') ||
                        voice.name.toLowerCase().includes('google us english')
                    )
                );
            }

            if (maleVoice) {
                utterance.voice = maleVoice;
            }

            window.speechSynthesis.speak(utterance);
        };

        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = setVoice;
        } else {
            setVoice();
        }
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
MEMORY.forEach(m => add(`${m.role === 'user' ? 'You' : 'Jarvis'}: ${m.text}`, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. TOOLS (15 SKILLS ROUTER) =====
async function handleTools(text) {
    if (!text) return null;
    const t = text.toLowerCase().trim();

    // 1. Time
    if (/\btime\b/.test(t) || t.includes('టైమ్') || t.includes('సమయం')) {
        return `The time is ${new Date().toLocaleTimeString()}, Boss.`;
    }

    // 2. Weather
    if (t.includes('weather') || t.includes('వాతావరణం')) {
        return new Promise((res) => {
            if (!navigator.geolocation) return res("Geolocation is not supported by your browser, Boss.");
            navigator.geolocation.getCurrentPosition(async (p) => {
                try {
                    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current_weather=true`);
                    const d = await r.json();
                    res(`It is ${d.current_weather.temperature} degrees Celsius now, Boss.`);
                } catch(e) {
                    res("Weather service error, Boss.");
                }
            }, () => res("I need location permission for weather, Boss."));
        });
    }

    // 3. Timer
    if (t.includes('timer') || t.includes('టైమర్')) {
        const m = t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)?/i);
        if (m) {
            const amount = parseInt(m[1]);
            const unit = (m[2] || 'seconds').toLowerCase();
            let factor = 1000;
            if (/hours?|hrs?/.test(unit)) factor = 3600000;
            else if (/minutes?|mins?/.test(unit)) factor = 60000;
            const duration = amount * factor;
            setTimeout(() => {
                speak(`టైమర్ పూర్తయింది. ${amount} ${unit} అయ్యాయి, Boss.`);
                add(`Jarvis: Timer finished for ${amount} ${unit}, Boss!`, 'ai');
            }, duration);
            return `Timer set for ${amount} ${unit}, Boss.`;
        }
    }

    // 4. Dice / Coin
    if (t.includes('dice') || t.includes('coin') || t.includes('toss') || t.includes('నాణే')) {
        if (t.includes('coin') || t.includes('toss') || t.includes('నాణే')) {
            const res = Math.random() < 0.5 ? 'Heads' : 'Tails';
            return `Coin toss result is ${res}, Boss.`;
        } else {
            const roll = Math.floor(Math.random() * 6) + 1;
            return `You rolled a ${roll}, Boss.`;
        }
    }

    // 5. Joke
    if (t.includes('joke') || t.includes('జోక్')) {
        const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Parallel lines have so much in common. It's a shame they'll never meet.",
            "Why did the computer go to the doctor? Because it had a virus!"
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }

    // 6. Quote
    if (t.includes('quote') || t.includes('కోట్') || t.includes('motivational')) {
        const quotes = [
            "The only way to do great work is to love what you do, Boss.",
            "Believe you can and you're halfway there.",
            "Action is the foundational key to all success."
        ];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    // 7. News
    if (t.includes('news') || t.includes('వార్తలు')) {
        window.open("https://news.google.com", "_blank");
        return "Opening Google News for headlines, Boss.";
    }

    // 8. Translate
    if (t.includes('translate')) {
        const q = t.replace(/translate\s*(than)?/i, '').trim() || 'hello';
        try {
            const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|te`);
            const d = await r.json();
            return `In Telugu: ${d.responseData.translatedText}`;
        } catch(e) {
            return "Translate error, Boss.";
        }
    }

    // 9. Currency
    if (t.includes('currency') || t.includes('convert') || t.includes('rupee') || t.includes('dollar')) {
        try {
            const r = await fetch("https://open.er-api.com/v6/latest/USD");
            const d = await r.json();
            const inr = d.rates.INR;
            return `Current rate: 1 USD is approximately ${inr.toFixed(2)} INR, Boss.`;
        } catch(e) {
            return "Currency conversion service error, Boss.";
        }
    }

    // 10. Meaning / Dictionary
    if (t.includes('meaning') || t.includes(' अर्थ ') || t.includes('అర్థం')) {
        const word = t.replace(/(meaning of|meaning|అర్థం)/gi, '').trim();
        if (word) {
            try {
                const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
                const d = await r.json();
                if (d[0] && d[0].meanings[0].definitions[0]) {
                    return `Meaning of ${word}: ${d[0].meanings[0].definitions[0].definition}`;
                }
            } catch(e) {}
        }
    }

    // 11. Password Generator
    if (t.includes('password') || t.includes('పాస్‌వర్డ్')) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
        let pwd = "";
        for (let i = 0; i < 12; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `Generated strong password: ${pwd}`;
    }

    // 12. Search
    if (t.includes('google search') || t.includes('search google') || t.includes('search')) {
        const googleSearch = t.replace(/(google search|search google|search)/gi, "").trim();
        if (googleSearch) {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(googleSearch)}`;
            window.open(searchUrl, "_blank");
            return `Searching Google for "${googleSearch}", Boss.`;
        }
    }

    // 13. Open Apps
    if (t.includes('open app') || t.includes('open youtube') || t.includes('open google')) {
        if (t.includes('youtube')) {
            window.open("https://youtube.com", "_blank");
            return "Opening YouTube, Boss.";
        } else if (t.includes('google')) {
            window.open("https://google.com", "_blank");
            return "Opening Google, Boss.";
        }
    }

    // 14. Play Songs
    if (t.includes('play song') || t.includes('play music') || t.includes('play')) {
        const songSearch = t.replace(/(play song|play music|play)/gi, "").trim();
        if (songSearch) {
            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songSearch)}`;
            window.open(youtubeUrl, "_blank");
            return `Searching and playing "${songSearch}" on YouTube, Boss.`;
        }
    }

    // 15. Crypto
    if (t.includes('crypto') || t.includes('bitcoin') || t.includes('eth')) {
        try {
            const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd");
            const d = await r.json();
            return `Bitcoin: $${d.bitcoin.usd}, Ethereum: $${d.ethereum.usd}, Boss.`;
        } catch(e) {
            return "Crypto price fetch failed, Boss.";
        }
    }

    // Hardcoded Boss details check
    if (t.includes("who created you") || t.includes("who is your creator")) {
        return "My name is Jarvis, created by Bharani.";
    }
    if (t.includes("boss father") || t.includes("father's name") || t.includes("father name")) {
        return "My Boss's Father name is C.H. Rambabu, and his profession is Tailor.";
    }
    if (t.includes("boss mother") || t.includes("mother's name") || t.includes("mother name")) {
        return "My Boss's Mother name is Devi Sirisha, and her profession is Tailor.";
    }
    if (t.includes("boss brother") || t.includes("brother's name") || t.includes("brother name")) {
        return "My Boss's Brother name is Mani Satyan, and his profession is Chef.";
    }
    if (t.includes("boss grandmother") || t.includes("grandmother's name") || t.includes("grandmother name")) {
        return "My Boss's Grandmother's name is Sujatha.";
    }
    if (t.includes("boss family") || t.includes("family name") || t.includes("inti peru") || t.includes("surname")) {
        return "My Boss's family surname (Inti Peru) is Chittiroju.";
    }

    return null; // Match అవ్వకపోతే Gemini Brain కి వెళ్తుంది
}

// ===== 4. GEMINI API CALL =====
async function callGemini(text) {
    if(!API_KEY) return "Error: API Key is missing, Boss.";
    
    const contents = MEMORY.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    const userParts = [];
    
    if (text) {
        userParts.push({ text: text });
    } else if (pendingImageData) {
        userParts.push({ text: "What is in this image, Boss? Describe it in detail." });
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
            console.error("Model failed: " + model, e);
        }
    }
    
    pendingImageData = null;
    return "Error: All AI models failed to process the request. Please check your network connection or Gemini API Key, Boss.";
}

// User Command Execution Function
async function handleUserCommand() {
    const text = input ? input.value.trim() : '';
    if (!text && !pendingImageData) return;

    const currentImageData = pendingImageData;

    if (text && currentImageData) {
        add(`You: [Image Uploaded] ${text}`, 'user');
        MEMORY.push({ role: 'user', text: `[Image Uploaded] ${text}` });
    } else if (text) {
        add(`You: ${text}`, 'user');
        MEMORY.push({ role: 'user', text: text });
    } else if (currentImageData) {
        add(`You: [Image Uploaded] Analysing image...`, 'user');
        MEMORY.push({ role: 'user', text: '[Uploaded Image for Analysis]' });
    }

    if (input) input.value = '';

    // First check 15 Tools & Local Commands
    if (!currentImageData) {
        const toolReply = await handleTools(text);
        if (toolReply) {
            add(`Jarvis: ${toolReply}`, 'ai');
            MEMORY.push({ role: 'model', text: toolReply });
            saveMemory();
            speak(toolReply);
            return;
        }
    }

    try {
        const reply = await callGemini(text);
        add(`Jarvis: ${reply}`, 'ai');
        MEMORY.push({ role: 'model', text: reply });
        saveMemory();
        speak(reply);
    } catch (err) {
        add(`Jarvis: Error: ${err.message}`, 'ai');
        speak(`Error processing request, Boss.`);
        pendingImageData = null;
    }
}

// Event Listeners for UI
if (executeBtn) {
    executeBtn.addEventListener('click', handleUserCommand);
}

if (input) {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUserCommand();
    });
}

function getFormattedTimestamp() {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    return `${dateStr} ${timeStr}`;
}

// Clear Memory Button
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (MEMORY.length > 0) {
            let historyStore = JSON.parse(localStorage.getItem('jarvis_history_store') || '[]');
            
            const firstUserMsg = MEMORY.find(m => m.role === 'user');
            const mainTopic = firstUserMsg ? firstUserMsg.text : "Conversation Session";

            historyStore.push({
                timestamp: getFormattedTimestamp(),
                topic: mainTopic,
                chats: [...MEMORY]
            });
            localStorage.setItem('jarvis_history_store', JSON.stringify(historyStore));
        }

        MEMORY = [];
        pendingImageData = null;
        localStorage.removeItem('jarvis_memory');
        if (chat) chat.innerHTML = '';
        add('Jarvis: Memory Cleared, Boss.', 'ai');
        speak('Memory Cleared, Boss.');
    });
}

// Render History Items
function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';
    let historyStore = JSON.parse(localStorage.getItem('jarvis_history_store') || '[]');

    if (historyStore.length === 0) {
        historyList.innerHTML = '<div style="color:#0ff; opacity:0.6; padding:10px;">No chat history found.</div>';
        return;
    }

    historyStore.forEach((session, index) => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'history-item';
        
        sessionDiv.innerHTML = `
            <div style="font-weight:bold; color:#0ff; font-size:10px;">⏱️ ${session.timestamp}</div>
            <div style="margin-top:4px; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
               💬 <b>${session.topic}</b>
            </div>
            <div class="full-chat-details" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed rgba(0,255,255,0.3);"></div>
        `;

        const detailsDiv = sessionDiv.querySelector('.full-chat-details');
        
        session.chats.forEach(c => {
            const msgP = document.createElement('div');
            msgP.style.margin = "4px 0";
            msgP.innerHTML = `<b>${c.role === 'user' ? 'You' : 'Jarvis'}:</b> ${c.text}`;
            detailsDiv.appendChild(msgP);
        });

        let isLongPress = false;
        let pressTimer;

        const deleteSession = () => {
            isLongPress = true;
            if (confirm("Delete this history session, Boss?")) {
                historyStore.splice(index, 1);
                localStorage.setItem('jarvis_history_store', JSON.stringify(historyStore));
                renderHistory();
            }
        };

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(deleteSession, 800);
        };

        const cancelPress = () => {
            clearTimeout(pressTimer);
        };

        sessionDiv.addEventListener('touchstart', startPress);
        sessionDiv.addEventListener('touchend', cancelPress);
        sessionDiv.addEventListener('mousedown', startPress);
        sessionDiv.addEventListener('mouseup', cancelPress);

        sessionDiv.addEventListener('click', () => {
            if (!isLongPress) {
                detailsDiv.style.display = detailsDiv.style.display === 'none' ? 'block' : 'none';
            }
        });

        historyList.appendChild(sessionDiv);
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        renderHistory();
        if (historyModal) historyModal.style.display = 'block';
    });
}

if (closeHistory) {
    closeHistory.addEventListener('click', () => {
        if (historyModal) historyModal.style.display = 'none';
    });
}

// Media Popup Controls
if (camBtn && mediaModal) {
    camBtn.addEventListener('click', () => {
        mediaModal.style.display = 'block';
    });
}

if (closeMedia) {
    closeMedia.addEventListener('click', () => {
        mediaModal.style.display = 'none';
    });
}

if (optCamera) {
    optCamera.addEventListener('click', () => {
        mediaModal.style.display = 'none';
        imgInput.setAttribute('capture', 'environment');
        imgInput.click();
    });
}

if (optGallery) {
    optGallery.addEventListener('click', () => {
        mediaModal.style.display = 'none';
        imgInput.removeAttribute('capture');
        imgInput.click();
    });
}

window.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.style.display = 'none';
    }
    if (e.target === mediaModal) {
        mediaModal.style.display = 'none';
    }
});

// Image Upload
if (imgInput) {
    imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                const base64Data = evt.result.split(',')[1];
                pendingImageData = {
                    mimeType: file.type,
                    data: base64Data
                };
                handleUserCommand();
            };
            reader.readAsDataURL(file);
        }
        imgInput.value = '';
    });
}

// Mic Input
if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    micBtn.addEventListener('click', () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        recognition.start();
        add('Jarvis: Listening...', 'ai');
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (input) input.value = transcript;
        handleUserCommand();
    };
}
