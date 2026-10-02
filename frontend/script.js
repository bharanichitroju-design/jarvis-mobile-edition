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

// Hardcoded Commands Function
function handleHardcoded(text) {
    if(!text) return null;
    const query = text.toLowerCase().trim();
    if (query.includes("who created you") || query.includes("who is your creator")) {
        return "My name is Jarvis, created by Bharani.";
    }
    if (query.includes("boss father") || query.includes("father's name") || query.includes("father name")) {
        return "My Boss's Father name is C.H. Rambabu, and his profession is Tailor.";
    }
    if (query.includes("boss mother") || query.includes("mother's name") || query.includes("mother name")) {
        return "My Boss's Mother name is Devi Sirisha, and her profession is Tailor.";
    }
    if (query.includes("boss brother") || query.includes("brother's name") || query.includes("brother name")) {
        return "My Boss's Brother name is Mani Satyan, and his profession is Chef.";
    }
    if (query.includes("boss grandmother") || query.includes("grandmother's name") || query.includes("grandmother name")) {
        return "My Boss's Grandmother's name is Sujatha.";
    }
    if (query.includes("boss family") || query.includes("family name") || query.includes("inti peru") || query.includes("surname")) {
        return "My Boss's family surname (Inti Peru) is Chittiroju.";
    }
    
    if (query.includes("open youtube")) {
        window.open("https://youtube.com", "_blank");
        return "Opening YouTube, Boss.";
    }
    if (query.includes("play song") || query.includes("play music")) {
        const songSearch = query.replace("play song", "").replace("play music", "").trim();
        const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songSearch)}`;
        window.open(youtubeUrl, "_blank");
        return `Searching YouTube for "${songSearch}", Boss.`;
    }
    if (query.includes("google search") || query.includes("search google")) {
        const googleSearch = query.replace("google search", "").replace("search google", "").trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(googleSearch)}`;
        window.open(searchUrl, "_blank");
        return `Searching Google for "${googleSearch}", Boss.`;
    }
    return null;
}

// ===== 3. GEMINI API CALL (FIXED) =====
async function callGemini(text) {
    if(!API_KEY) return "Error: API Key is missing, Boss.";
    
    const contents = MEMORY.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    const userParts = [];
    
    // 1. Add Text Prompt
    if (text) {
        userParts.push({ text: text });
    } else if (pendingImageData) {
        userParts.push({ text: "What is in this image, Boss? Describe it in detail." });
    }

    // 2. Add Image Data Correctly
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
                pendingImageData = null; // Reset image data after successful response
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

// User Command Execution Function (FIXED)
async function handleUserCommand() {
    const text = input ? input.value.trim() : '';
    if (!text && !pendingImageData) return;

    const currentImageData = pendingImageData; // Store local reference

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

    // Hardcoded logic only if no image is attached
    if (!currentImageData) {
        const hcReply = handleHardcoded(text);
        if (hcReply) {
            add(`Jarvis: ${hcReply}`, 'ai');
            MEMORY.push({ role: 'model', text: hcReply });
            saveMemory();
            speak(hcReply);
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

// Function to format Date & Time accurately with seconds
function getFormattedTimestamp() {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    return `${dateStr} ${timeStr}`;
}

// Clear Memory Button - Saves current chat session to permanent History
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

// Render History Items (Structured 2-Line Format)
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

window.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.style.display = 'none';
    }
});

// ===== CAMERA & GALLERY IMAGE UPLOAD HANDLING (FIXED) =====
if (camBtn && imgInput) {
    camBtn.addEventListener('click', () => {
        const useCamera = confirm("Click 'OK' to take photo from Camera, or 'Cancel' to choose from Gallery, Boss.");
        if (useCamera) {
            imgInput.setAttribute('capture', 'environment');
        } else {
            imgInput.removeAttribute('capture');
        }
        imgInput.click();
    });

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
                // Trigger command processing AFTER image file reading completes
                handleUserCommand();
            };
            reader.readAsDataURL(file);
        }
        imgInput.value = ''; // Reset input element so selecting same photo triggers change event
    });
}

// Mic Button (Voice Input)
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
