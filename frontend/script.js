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

// Global variable to hold temporary image data
let pendingImageData = null;

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
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;

        const setVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            
            // 1. మలే/మేల్ పేరున్న వాయిస్ కోసం వెతుకుతుంది
            let maleVoice = voices.find(voice => 
                voice.lang.includes('en') && 
                voice.name.toLowerCase().includes('male')
            );

            // 2. ఒకవేళ 'male' అని లేకపోతే సాధారణ మేల్ వాయిస్ పేర్ల కోసం వెతుకుతుంది
            if (!maleVoice) {
                maleVoice = voices.find(voice => 
                    voice.lang.includes('en') && (
                        voice.name.toLowerCase().includes('david') ||
                        voice.name.toLowerCase().includes('george') ||
                        voice.name.toLowerCase().includes('google us english')
                    )
                );
            }

            // మేల్ వాయిస్ దొరికితే సెట్ చేస్తుంది
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
    
    // Direct link triggers
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

// ===== 3. GEMINI API CALL =====
async function callGemini(text) {
    if(!API_KEY) return "Error: API Key is missing.";
    
    const contents = MEMORY.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    const userPart = [];
    if (text) userPart.push({ text: text });
    if (pendingImageData) {
        userPart.push({
            inline_data: {
                mime_type: pendingImageData.mimeType,
                data: pendingImageData.data
            }
        });
        pendingImageData = null; // Reset image data after usage
    }
    
    contents.push({ role: 'user', parts: userPart });

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
                return data.candidates[0].content.parts[0].text;
            }
        } catch (e) {
            console.error(e);
        }
    }
    return "Error: All AI models failed to respond. Please check your network connection or API Key.";
}

// User Command Execution Function
async function handleUserCommand() {
    const text = input ? input.value.trim() : '';
    if (!text && !pendingImageData) return;

    if (input) input.value = '';

    if (text) {
        add(`You: ${text}`, 'user');
        MEMORY.push({ role: 'user', text: text });
    } else if (pendingImageData) {
        add(`You: [Uploaded Image]`, 'user');
    }

    // Check hardcoded response first (if text exists)
    const hcReply = text ? handleHardcoded(text) : null;
    if (hcReply) {
        add(`Jarvis: ${hcReply}`, 'ai');
        MEMORY.push({ role: 'model', text: hcReply });
        saveMemory();
        speak(hcReply);
        return;
    }

    try {
        const reply = await callGemini(text);
        add(`Jarvis: ${reply}`, 'ai');
        MEMORY.push({ role: 'model', text: reply });
        saveMemory();
        speak(reply);
    } catch (err) {
        add(`Jarvis: Error: ${err.message}`, 'ai');
        speak(`Error: ${err.message}`);
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

// Clear Memory Button
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        MEMORY = [];
        localStorage.removeItem('jarvis_memory');
        if (chat) chat.innerHTML = '';
        add('Jarvis: Memory Cleared, Boss.', 'ai');
        speak('Memory Cleared, Boss.');
    });
}

// Camera / Image Upload Handling (Camera or Photos Choice)
if (camBtn && imgInput) {
    camBtn.addEventListener('click', () => {
        const useCamera = confirm("Click 'OK' to use Camera, or 'Cancel' to choose from Photos/Gallery.");
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
                const base64Data = evt.target.result.split(',')[1];
                pendingImageData = {
                    mimeType: file.type,
                    data: base64Data
                };
                handleUserCommand(); // Automatically process the image once selected
            };
            reader.readAsDataURL(file);
        }
    });
}

// Mic Button (Voice Recognition Input with Auto Speech Stop)
if (micBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    micBtn.addEventListener('click', () => {
        // Stop any ongoing assistant audio output immediately when mic is pressed
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
