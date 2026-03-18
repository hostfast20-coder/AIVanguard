import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ⚠️ NEVER hardcode your API key here.
// Each user enters their own key — it's stored only in their browser.
let model = null;
let genAI = null;

function initializeGemini(apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        console.error("Gemini API key is not set");
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // flash = free tier friendly
        localStorage.setItem('gemini_api_key', apiKey);
        console.log("✓ Gemini AI initialized successfully!");
        return true;
    } catch (err) {
        console.error("Failed to initialize Gemini client", err);
        model = null;
        return false;
    }
}

// Try loading saved key from previous session
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) {
    initializeGemini(savedKey);
}

document.addEventListener('DOMContentLoaded', function () {
    let selectedFile = null;
    let isGenerating = false;

    // UI references
    const uploadArea = document.getElementById('uploadArea');
    const uploadPreview = document.getElementById('uploadPreview');
    const generateBtn = document.getElementById('generateBtn');
    const optionsPanel = document.getElementById('optionsPanel');
    const confirmBtn = document.getElementById('confirmBtn');
    const resultCode = document.getElementById('resultCode');
    const resultsPanel = document.getElementById('resultsPanel');
    const copyBtn = document.getElementById('copyBtn');

    // ── Inject API Key UI into the page ──────────────────────────────────────
    const apiKeyHTML = `
    <div id="apiKeySection" style="
        margin: 1.5rem auto;
        max-width: 500px;
        padding: 1.2rem 1.5rem;
        border: 1px solid rgba(0,255,255,0.3);
        border-radius: 12px;
        background: rgba(0,255,255,0.05);
        font-family: 'Space Mono', monospace;
    ">
        <p style="font-size:0.75rem; color:#b0b0ff; margin-bottom:0.6rem; text-transform:uppercase; letter-spacing:1px;">
            🔑 Your Gemini API Key
        </p>
        <div style="display:flex; gap:0.5rem;">
            <input id="apiKeyInput" type="password" placeholder="Paste your key from aistudio.google.com"
                style="
                    flex:1; padding:0.6rem 1rem;
                    background: rgba(0,0,0,0.5);
                    border: 1px solid rgba(0,255,255,0.4);
                    border-radius: 8px;
                    color: #e7e7e7;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.8rem;
                    outline: none;
                "
            />
            <button id="saveApiKeyBtn" style="
                padding: 0.6rem 1.2rem;
                background: linear-gradient(90deg, #00ffff, #ff006e);
                border: none; border-radius: 8px;
                color: #0a0e27; font-weight: bold;
                cursor: pointer; font-size: 0.8rem;
                font-family: 'Orbitron', sans-serif;
            ">SAVE</button>
        </div>
        <p id="apiKeyStatus" style="font-size:0.7rem; margin-top:0.5rem; color:#b0b0ff;"></p>
        <p style="font-size:0.65rem; color:#666; margin-top:0.4rem;">
            Your key is saved only in your browser. Never shared. 
            <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#00ffff;">Get a free key →</a>
        </p>
    </div>`;

    // Insert API key section before the generator wrapper
    const generatorWrapper = document.querySelector('.generator-wrapper');
    if (generatorWrapper) {
        generatorWrapper.insertAdjacentHTML('beforebegin', apiKeyHTML);
    }

    // Show saved key status on load
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (savedKey && model) {
        apiKeyStatus.textContent = '✓ API key loaded from last session';
        apiKeyStatus.style.color = '#00ffff';
    }

    // Save API key button
    document.getElementById('saveApiKeyBtn')?.addEventListener('click', () => {
        const key = apiKeyInput?.value?.trim();
        if (!key) {
            apiKeyStatus.textContent = '⚠ Please paste your API key first.';
            apiKeyStatus.style.color = '#ff006e';
            return;
        }
        const ok = initializeGemini(key);
        if (ok) {
            apiKeyStatus.textContent = '✓ Key saved! Ready to generate.';
            apiKeyStatus.style.color = '#00ffff';
            apiKeyInput.value = '';
        } else {
            apiKeyStatus.textContent = '✗ Invalid key. Check and try again.';
            apiKeyStatus.style.color = '#ff006e';
        }
    });

    // ── AOS & Anime init ──────────────────────────────────────────────────────
    setTimeout(() => {
        if (typeof AOS !== 'undefined') {
            AOS.init({ duration: 1000, once: false });
        }
    }, 100);

    if (typeof anime !== 'undefined') {
        anime({
            targets: '.hero-title',
            opacity: [0, 1],
            translateY: [30, 0],
            duration: 1000,
            easing: 'easeOutExpo'
        });
        anime({
            targets: '.glow-sphere',
            opacity: [0.2, 0.4, 0.2],
            duration: 4000,
            loop: true,
            easing: 'easeInOutSine'
        });
    }

    // ── Upload interactions ───────────────────────────────────────────────────
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = 'rgba(0, 255, 255, 0.2)';
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '';
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '';
            handleFileSelection(e.dataTransfer.files?.[0]);
        });
        uploadArea.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => handleFileSelection(input.files?.[0]);
            input.click();
        });

        // FIX: paste must be on window, not uploadArea, to actually capture clipboard
        window.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let item of items) {
                if (item.type.startsWith('image/')) {
                    handleFileSelection(item.getAsFile());
                    break;
                }
            }
        });
    }

    // ── Generate button ───────────────────────────────────────────────────────
    generateBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof anime !== 'undefined') {
            anime({ targets: generateBtn, scale: [1, 0.9, 1.05], duration: 300, easing: 'easeInOutQuad' });
        }
        optionsPanel.classList.toggle('active');
        if (optionsPanel.classList.contains('active')) {
            showNotification('Select your generation options');
        }
    });

    // ── Confirm & Generate ────────────────────────────────────────────────────
    confirmBtn?.addEventListener('click', async () => {
        if (!selectedFile) {
            showNotification('Please upload an image first.');
            return;
        }
        if (!model) {
            showNotification('⚠ No API key set. Please enter your Gemini key above.');
            document.getElementById('apiKeyInput')?.focus();
            return;
        }
        if (isGenerating) return;

        setGenerating(true);

        const options = {
            responsive: document.getElementById('responsive').checked,
            darkMode: document.getElementById('darkMode').checked,
            animations: document.getElementById('animations').checked,
            optimization: document.getElementById('optimization').checked
        };

        try {
            const css = await generateTailwindFromImage(selectedFile, options);
            resultCode.textContent = css.trim();
            setTimeout(() => resultsPanel?.scrollIntoView({ behavior: 'smooth' }), 500);
            showNotification('✓ Tailwind CSS generated successfully!');
            optionsPanel.classList.remove('active');
        } catch (err) {
            console.error(err);
            // Show a friendlier error for quota issues
            const msg = err.message || '';
            if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exhausted')) {
                resultCode.textContent = '⚠ API quota exhausted.\n\nFixes:\n1. Wait a few minutes and try again (free tier has per-minute limits)\n2. Get a new API key from aistudio.google.com\n3. Use a smaller/simpler image to reduce token usage';
                showNotification('Quota limit hit — see instructions in the output box');
            } else {
                resultCode.textContent = 'Error: ' + msg;
                showNotification('Generation failed: ' + msg);
            }
        } finally {
            setGenerating(false);
        }
    });

    // ── Copy button ───────────────────────────────────────────────────────────
    copyBtn?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultCode.textContent);
            showNotification('✓ Copied to clipboard!');
        } catch (err) {
            showNotification('Copy failed — try selecting and copying manually.');
        }
    });

    // ── Helper functions ──────────────────────────────────────────────────────
    function handleFileSelection(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file.');
            return;
        }
        selectedFile = file;
        showPreview(file);
        showNotification('Image selected! Ready to generate.');
    }

    function showPreview(file) {
        if (!uploadPreview) return;
        const reader = new FileReader();
        reader.onload = () => {
            uploadPreview.src = reader.result;
            uploadPreview.hidden = false;
        };
        reader.readAsDataURL(file);
    }

    async function generateTailwindFromImage(file, options) {
        const imagePart = await fileToGenerativePart(file);

        const optionsText = [
            options.responsive ? '- Responsive design with Tailwind breakpoints (sm, md, lg, xl)' : '',
            options.darkMode ? '- Include dark mode support with dark: prefix' : '',
            options.animations ? '- Include smooth animations and transitions' : '',
            options.optimization ? '- Optimize for minimal CSS bundle' : ''
        ].filter(Boolean).join('\n');

        const prompt = `You are an expert Tailwind CSS developer. Analyze this UI/design image and generate complete, production-ready Tailwind CSS code that recreates it.

REQUIREMENTS:
${optionsText}
- Use semantic HTML with proper structure
- Implement proper spacing, colors, and typography
- Ensure accessibility (ARIA labels, semantic elements)
- Return ONLY code without any explanations or markdown formatting
- Include both HTML and Tailwind CSS classes
- Use flexbox and grid where appropriate
- Ensure the code is copy-paste ready

Generate the Tailwind CSS code now:`;

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }]
            });
            const text = result.response.text();
            if (!text || text.length < 20) {
                throw new Error('Response too short. Try a clearer image.');
            }
            return text;
        } catch (error) {
            // Re-throw with original message so caller can inspect it
            throw error;
        }
    }

    async function fileToGenerativePart(file) {
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 10MB.`);
        }
        let processedFile = file.size > 2 * 1024 * 1024 ? await compressImage(file) : file;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve({
                    inlineData: {
                        data: reader.result.split(',')[1],
                        mimeType: processedFile.type || 'image/png'
                    }
                });
            };
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(processedFile);
        });
    }

    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxW = 1920, maxH = 1080;
                    let { width, height } = img;
                    if (width > maxW || height > maxH) {
                        const ratio = Math.min(maxW / width, maxH / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (!blob) { reject(new Error('Compression failed')); return; }
                        const quality = blob.size > 2 * 1024 * 1024 ? 0.7 : 0.85;
                        if (quality < 0.85) {
                            canvas.toBlob(b => resolve(new File([b], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
                        } else {
                            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                        }
                    }, 'image/jpeg', 0.85);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    function setGenerating(state) {
        isGenerating = state;
        if (confirmBtn) {
            confirmBtn.disabled = state;
            confirmBtn.textContent = state ? '⏳ GENERATING...' : 'Confirm & Generate';
        }
        if (generateBtn) generateBtn.disabled = state;
        if (state) {
            resultsPanel?.classList.add('loading');
            resultCode.textContent = '⏳ Processing image with AI...\n\nThis may take 10–30 seconds.';
        } else {
            resultsPanel?.classList.remove('loading');
        }
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: linear-gradient(135deg, #00ffff 0%, #ff006e 100%);
            color: #0a0e27; padding: 1rem 1.5rem; border-radius: 12px;
            font-family: 'Orbitron', sans-serif; font-weight: bold; font-size: 13px;
            z-index: 10000; box-shadow: 0 8px 32px rgba(0,255,255,0.4);
            border: 2px solid rgba(0,255,255,0.8);
            animation: slideIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.4s ease-in';
            setTimeout(() => notification.remove(), 400);
        }, 4000);
    }

    // Animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from { transform:translateX(500px); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @keyframes slideOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(500px); opacity:0; } }
        @keyframes shimmer { 0% { background-position:-1000px 0; } 100% { background-position:1000px 0; } }
        .results-panel.loading pre {
            background: linear-gradient(90deg,#0a0e27 25%,#1a1f3a 50%,#0a0e27 75%);
            background-size: 1000px 100%; animation: shimmer 2s infinite;
        }
        #apiKeyInput:focus { border-color: #00ffff !important; box-shadow: 0 0 10px rgba(0,255,255,0.3); }
    `;
    document.head.appendChild(style);
});