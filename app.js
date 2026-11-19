/**
 * Debate AI — Audited & Complete Socratic Voice Mediator
 * - Real Zero-Cost LLM Reasoning (Pollinations OpenAI-compatible API + Wikipedia)
 * - WebRTC P2P Audio Call + Real-Time DataChannel State Synchronization
 * - Live Interim Speech Transcription + Web Audio API Hardware VU-Meter
 * - Interactive Exploration Paths & Solo Sparring Partner Mode
 */

// ==========================================
// 1. STATE
// ==========================================
const app = {
  currentTopic: null,
  activeSpeaker: 'user1', // 'user1' (Sujeto 1) or 'user2' (Sujeto 2)
  isRecording: false,
  isSpeaking: false,
  isProcessingAI: false,
  voiceEnabled: true,

  // Conversation Memory
  history: [], // { role: 'Sujeto 1' | 'Sujeto 2' | 'IA Mediadora', text: '...' }
  consensusScore: 0,
  commonGround: [],

  // Audio & Speech Recognition
  recognition: null,
  finalTranscriptBuffer: '',
  mediaStream: null,
  audioContext: null,
  analyser: null,
  selectedVoice: null,
  ttsKeepAliveTimer: null,

  // WebRTC P2P (Voice + Data Sync)
  peer: null,
  dataConn: null,
  mediaCall: null,
  roomId: null,
  hasRemotePartner: false
};

// ==========================================
// 2. DOM REFERENCES
// ==========================================
const ui = {
  connectionPill: document.getElementById('connection-pill'),
  activeTopicText: document.getElementById('active-topic-text'),
  cardsContainer: document.getElementById('cards-container'),
  
  // Stage Speakers
  selectUser1Btn: document.getElementById('select-user1-btn'),
  selectUser2Btn: document.getElementById('select-user2-btn'),
  avatarUser1: document.getElementById('avatar-user1'),
  avatarAI: document.getElementById('avatar-ai'),
  avatarUser2: document.getElementById('avatar-user2'),
  badgeUser1: document.getElementById('badge-user1'),
  badgeUser2: document.getElementById('badge-user2'),
  statusUser1: document.getElementById('status-user1'),
  statusAI: document.getElementById('status-ai'),
  statusUser2: document.getElementById('status-user2'),
  aiPulseRing: document.getElementById('ai-pulse-ring'),

  // Live Feedback
  liveTranscriptBox: document.getElementById('live-transcript-box'),
  liveTranscriptText: document.getElementById('live-transcript-text'),
  stageStatusText: document.getElementById('stage-status-text'),
  liveIndicator: document.getElementById('live-indicator'),
  soundWaveBars: document.getElementById('sound-wave-bars'),

  // Consensus Tracker
  consensusTracker: document.getElementById('consensus-tracker'),
  consensusPct: document.getElementById('consensus-pct'),
  consensusBar: document.getElementById('consensus-bar'),
  commonGroundList: document.getElementById('common-ground-list'),

  // Controls
  mainMicBtn: document.getElementById('main-mic-btn'),
  mainMicIcon: document.getElementById('main-mic-icon'),
  mainMicLabel: document.getElementById('main-mic-label'),
  stopAiBtn: document.getElementById('stop-ai-btn'),
  textInput: document.getElementById('text-input'),
  textSendBtn: document.getElementById('text-send-btn'),
  voiceToggleBtn: document.getElementById('voice-toggle-btn'),
  voiceIcon: document.getElementById('voice-icon'),
  resetSessionBtn: document.getElementById('reset-session-btn'),
  inviteBtn: document.getElementById('invite-btn'),

  // Modal
  inviteModal: document.getElementById('invite-modal'),
  closeInviteModalBtn: document.getElementById('close-invite-modal-btn'),
  shareLinkInput: document.getElementById('share-link-input'),
  copyShareLinkBtn: document.getElementById('copy-share-link-btn'),
  p2pModalStatus: document.getElementById('p2p-modal-status'),
  remoteAudio: document.getElementById('remote-audio')
};

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initSpeechSynthesis();
  initSpeechRecognition();
  initP2P();
  setupEventListeners();
  checkUrlRoom();
});

// ==========================================
// 4. SPEAKER TURN SWITCHING
// ==========================================
function setActiveSpeaker(speaker) {
  app.activeSpeaker = speaker;
  const isU1 = speaker === 'user1';

  if (isU1) {
    ui.avatarUser1.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-sky-400 flex items-center justify-center relative transition-all duration-300 shadow-md ring-2 ring-sky-400/30';
    ui.badgeUser1.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-sky-500 text-slate-950 text-[9px] font-bold';
    ui.badgeUser1.textContent = 'Turno activo';

    ui.avatarUser2.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative transition-all duration-300 shadow-md opacity-80';
    ui.badgeUser2.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold';
    ui.badgeUser2.textContent = 'Sujeto 2';
  } else {
    ui.avatarUser2.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center relative transition-all duration-300 shadow-md ring-2 ring-amber-400/30';
    ui.badgeUser2.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold';
    ui.badgeUser2.textContent = 'Turno activo';

    ui.avatarUser1.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative transition-all duration-300 shadow-md opacity-80';
    ui.badgeUser1.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[9px] font-bold';
    ui.badgeUser1.textContent = 'Sujeto 1';
  }

  if (!app.isRecording && !app.isSpeaking && !app.isProcessingAI) {
    const labelName = isU1 ? 'Sujeto 1' : 'Sujeto 2';
    ui.mainMicLabel.textContent = `Toca para hablar (${labelName})`;
    ui.textInput.placeholder = `O escribe el argumento del ${labelName}...`;
  }
}

// ==========================================
// 5. MICROPHONE, HARDWARE VU-METER & STT
// ==========================================
async function ensureAudioHardware() {
  if (app.mediaStream) return true;
  try {
    app.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    app.audioContext = new AudioCtx();
    const source = app.audioContext.createMediaStreamSource(app.mediaStream);
    app.analyser = app.audioContext.createAnalyser();
    app.analyser.fftSize = 64;
    source.connect(app.analyser);
    startHardwareVUMeter();
    return true;
  } catch (err) {
    console.warn('No se pudo acceder al micrófono:', err);
    return false;
  }
}

function startHardwareVUMeter() {
  if (!app.analyser) return;
  const data = new Uint8Array(app.analyser.frequencyBinCount);
  const bars = ui.soundWaveBars.querySelectorAll('span');

  const tick = () => {
    if (app.isRecording && app.analyser) {
      app.analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars.length; i++) {
        const val = data[i * 2] || 0;
        const h = Math.max(4, Math.min(18, Math.round((val / 255) * 18)));
        bars[i].style.height = `${h}px`;
        bars[i].style.backgroundColor = app.activeSpeaker === 'user1' ? '#38bdf8' : '#f59e0b';
      }
    } else if (!app.isSpeaking) {
      for (let i = 0; i < bars.length; i++) {
        bars[i].style.height = '5px';
        bars[i].style.backgroundColor = '#334155';
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    ui.mainMicLabel.textContent = 'Usa el cuadro de texto abajo para debatir';
    return;
  }

  app.recognition = new SpeechRecognition();
  app.recognition.lang = 'es-ES';
  app.recognition.continuous = true;
  app.recognition.interimResults = true;

  app.recognition.onstart = () => {
    app.isRecording = true;
    app.finalTranscriptBuffer = '';
    ui.liveTranscriptBox.classList.remove('hidden');
    ui.liveTranscriptText.textContent = 'Escuchando tu voz... habla ahora';
    updateStageUI('listening');
  };

  app.recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        app.finalTranscriptBuffer += piece + ' ';
      } else {
        interim += piece;
      }
    }
    const combined = (app.finalTranscriptBuffer + interim).trim();
    if (combined) {
      ui.liveTranscriptText.textContent = `"${combined}"`;
    }
  };

  app.recognition.onend = () => {
    const wasRecording = app.isRecording;
    app.isRecording = false;
    ui.liveTranscriptBox.classList.add('hidden');
    updateStageUI('idle');

    const captured = app.finalTranscriptBuffer.trim() || ui.liveTranscriptText.textContent.replace(/^"|"$/g, '').trim();
    app.finalTranscriptBuffer = '';
    ui.liveTranscriptText.textContent = '';

    if (wasRecording && captured && captured !== 'Escuchando tu voz... habla ahora') {
      submitArgument(app.activeSpeaker, captured);
    }
  };

  app.recognition.onerror = (e) => {
    console.warn('SpeechRecognition info:', e.error);
    if (e.error === 'not-allowed') {
      app.isRecording = false;
      ui.liveTranscriptBox.classList.add('hidden');
      updateStageUI('idle');
      alert('El navegador bloqueó el micrófono. Haz clic en el icono de candado junto a la URL arriba y permite el uso del micrófono.');
    }
  };
}

async function toggleMicrophone() {
  // If AI is speaking, stop AI first
  if (app.isSpeaking) {
    stopAISpeech();
  }

  if (app.isRecording) {
    app.recognition?.stop();
    return;
  }

  const ok = await ensureAudioHardware();
  if (!ok && !app.recognition) {
    ui.textInput.focus();
    return;
  }

  if (app.recognition) {
    try {
      app.finalTranscriptBuffer = '';
      app.recognition.start();
    } catch (e) {
      app.recognition.stop();
    }
  } else {
    ui.textInput.focus();
  }
}

// ==========================================
// 6. ROBUST TEXT-TO-SPEECH (NO CUTOFFS)
// ==========================================
function initSpeechSynthesis() {
  if (!window.speechSynthesis) return;

  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online')));
    app.selectedVoice = preferred || voices.find(v => v.lang.startsWith('es')) || voices[0];
  };

  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function speakAI(text) {
  if (!app.voiceEnabled || !window.speechSynthesis || !text) return;

  stopAISpeech();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.03;
  utterance.pitch = 1.0;
  if (app.selectedVoice) utterance.voice = app.selectedVoice;

  utterance.onstart = () => {
    app.isSpeaking = true;
    ui.stopAiBtn.classList.remove('hidden');
    updateStageUI('ai_speaking');

    // Chrome bug workaround: prevent TTS from freezing after 14 seconds
    clearInterval(app.ttsKeepAliveTimer);
    app.ttsKeepAliveTimer = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  };

  const cleanup = () => {
    clearInterval(app.ttsKeepAliveTimer);
    app.isSpeaking = false;
    ui.stopAiBtn.classList.add('hidden');
    updateStageUI('idle');
  };

  utterance.onend = cleanup;
  utterance.onerror = cleanup;

  window.speechSynthesis.speak(utterance);
}

function stopAISpeech() {
  clearInterval(app.ttsKeepAliveTimer);
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  app.isSpeaking = false;
  ui.stopAiBtn.classList.add('hidden');
  updateStageUI('idle');
}

// ==========================================
// 7. STAGE VISUAL FEEDBACK
// ==========================================
function updateStageUI(mode) {
  ui.avatarUser1.classList.remove('avatar-speaking-user');
  ui.avatarAI.classList.remove('avatar-speaking');
  ui.avatarUser2.classList.remove('avatar-speaking-partner');
  ui.aiPulseRing.classList.remove('pulse-ring-active');
  ui.soundWaveBars.classList.remove('wave-active');

  const speakerLabel = app.activeSpeaker === 'user1' ? 'Sujeto 1' : 'Sujeto 2';

  if (mode === 'listening') {
    if (app.activeSpeaker === 'user1') {
      ui.avatarUser1.classList.add('avatar-speaking-user');
      ui.statusUser1.textContent = '🎙️ Hablando...';
    } else {
      ui.avatarUser2.classList.add('avatar-speaking-partner');
      ui.statusUser2.textContent = '🎙️ Hablando...';
    }
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
    ui.stageStatusText.textContent = `Escuchando a ${speakerLabel}... Toca el botón rojo al terminar`;
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2.5 ring-4 ring-rose-500/30';
    ui.mainMicLabel.textContent = 'Terminé de hablar (Enviar)';
  } else if (mode === 'thinking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-indigo-400 animate-ping';
    ui.stageStatusText.textContent = 'IA analizando argumentos, datos y puntos en común...';
    ui.statusAI.textContent = 'Analizando...';
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2.5 cursor-wait';
    ui.mainMicLabel.textContent = 'Analizando...';
  } else if (mode === 'ai_speaking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.soundWaveBars.classList.add('wave-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    ui.stageStatusText.textContent = 'IA Mediadora hablando...';
    ui.statusAI.textContent = 'Hablando';
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2.5';
    ui.mainMicLabel.textContent = `Responder (${speakerLabel})`;
  } else {
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500';
    ui.stageStatusText.textContent = `Turno de ${speakerLabel}: habla o toca una ruta de exploración`;
    ui.statusUser1.textContent = app.activeSpeaker === 'user1' ? 'Su turno' : 'En espera';
    ui.statusUser2.textContent = app.activeSpeaker === 'user2' ? 'Su turno' : (app.hasRemotePartner ? '🟢 Conectado' : 'Toca para alternar');
    ui.statusAI.textContent = 'Escuchando';
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-brand/25 flex items-center justify-center gap-2.5 active:scale-[0.98]';
    ui.mainMicLabel.textContent = `Toca para hablar (${speakerLabel})`;
  }
}

// ==========================================
// 8. REAL FREE LLM MEDIATION ENGINE
// ==========================================
async function submitArgument(speakerKey, rawText, isFromRemote = false) {
  const text = rawText.trim();
  if (!text || app.isProcessingAI) return;

  const speakerName = speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2';
  app.history.push({ role: speakerName, text });

  // Render Speaker Card
  renderSpeakerCard(speakerKey, speakerName, text);

  // Sync to remote P2P partner if connected and originated locally
  if (!isFromRemote && app.dataConn && app.dataConn.open) {
    app.dataConn.send({
      type: 'SPEAKER_ARGUMENT',
      speakerKey,
      text
    });
  }

  // Only the initiator (or local user) queries the LLM and broadcasts the mediation
  if (!isFromRemote) {
    await runAIMediation(speakerKey, speakerName, text);
  }
}

async function runAIMediation(speakerKey, speakerName, latestText) {
  app.isProcessingAI = true;
  updateStageUI('thinking');

  try {
    // 1. Query Wikipedia in parallel for verified encyclopedic context
    const wikiPromise = fetchWikipediaContext(app.currentTopic || latestText);
    // 2. Query Real Free LLM (Pollinations OpenAI Endpoint)
    const llmResult = await fetchFreeLLMMediation(speakerName, latestText);
    const wikiSnippet = await wikiPromise;

    if (wikiSnippet && (!llmResult.verifiedFacts || llmResult.verifiedFacts.length === 0)) {
      llmResult.verifiedFacts = [wikiSnippet];
    }

    applyMediationResult(llmResult, speakerKey);

    // Broadcast AI result to P2P partner if connected
    if (app.dataConn && app.dataConn.open) {
      app.dataConn.send({
        type: 'AI_MEDIATION',
        result: llmResult,
        nextSpeaker: speakerKey === 'user1' ? 'user2' : 'user1'
      });
    }
  } catch (err) {
    console.error('Fallback mediation:', err);
    const fallback = buildSmartFallbackMediation(speakerName, latestText);
    applyMediationResult(fallback, speakerKey);
  } finally {
    app.isProcessingAI = false;
  }
}

async function fetchFreeLLMMediation(speakerName, latestText) {
  const historySummary = app.history.slice(-6).map(h => `${h.role}: "${h.text}"`).join('\n');

  const systemPrompt = `Eres una IA Mediadora de debates socrática, neutral, empática y experta en verificación de datos.
Tu misión es ayudar a dos personas (Sujeto 1 y Sujeto 2) a debatir cualquier tema (trivial o profundo), aportando datos reales, reformulando sus puntos sin hostilidad (steelmanning), sugiriendo caminos de exploración y guiándolos al entendimiento común.

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "topic": "Título claro y corto del tema que están debatiendo (máx 8 palabras)",
  "consensusScore": número entero entre 15 y 95 que refleje el nivel de entendimiento común actual,
  "commonGround": ["Punto de acuerdo o principio compartido 1", "Punto de acuerdo o interés común 2"],
  "steelman": "Síntesis empática y sólida en 1 oración de lo que acaba de plantear el hablante",
  "verifiedFacts": [
    "Dato objetivo, científico, histórico o estadístico real y concreto sobre el tema planteado (incluye fuente o contexto real)",
    "Segundo dato objetivo o perspectiva empírica contrastada sobre el tema"
  ],
  "socraticQuestion": "Pregunta directa, breve y estimulante para avanzar hacia un punto de encuentro",
  "explorationPaths": [
    "Ángulo concreto 1 para explorar (ej: Analizar el impacto económico real)",
    "Ángulo concreto 2 para explorar (ej: Evaluar casos donde sí funcionó)",
    "Ángulo concreto 3 para explorar (ej: Buscar una solución intermedia)"
  ],
  "counterpointForSolo": "Si una segunda persona tuviera la postura opuesta, ¿qué argumento inteligente y realista plantearía en 1 o 2 oraciones?",
  "spokenResponse": "Lo que dirás en voz alta como mediadora: máximo 2 oraciones fluidas y naturales que resuman un dato clave y hagan la pregunta socrática."
}`;

  const userPrompt = `Historial reciente del debate:
${historySummary}

Última intervención (${speakerName}): "${latestText}"
Genera el análisis y mediación en JSON en español.`;

  const res = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      jsonMode: true,
      seed: Math.floor(Math.random() * 10000)
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  return parseCleanJSON(raw);
}

function parseCleanJSON(rawText) {
  let cleaned = rawText.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

async function fetchWikipediaContext(queryText) {
  try {
    const cleanQuery = queryText
      .replace(/[¿?¡!.,;:]/g, '')
      .split(' ')
      .filter(w => w.length > 4 && !['quiero', 'debatir', 'sobre', 'pienso', 'creo', 'porque', 'cuando', 'donde'].includes(w.toLowerCase()))
      .slice(0, 3)
      .join(' ');

    if (!cleanQuery) return null;

    const url = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.query?.search?.length > 0) {
      const top = data.query.search[0];
      const snippet = top.snippet.replace(/<\/?[^>]+(>|$)/g, '');
      return `${top.title}: ${snippet}... (Fuente: Wikipedia)`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function buildSmartFallbackMediation(speakerName, text) {
  const topic = app.currentTopic || text.substring(0, 45);
  return {
    topic,
    consensusScore: Math.min(85, (app.consensusScore || 20) + 15),
    commonGround: [`Interés compartido en encontrar la mejor respuesta sobre: ${topic}`],
    steelman: `${speakerName} plantea un argumento centrado en las consecuencias prácticas de "${text.substring(0, 60)}"`,
    verifiedFacts: [
      `El análisis comparado sobre "${topic}" muestra que los resultados dependen de las condiciones de implementación y el contexto social.`
    ],
    socraticQuestion: `¿En qué condiciones específicas estarían ambos de acuerdo sobre este punto?`,
    explorationPaths: [
      `Comparar ventajas y riesgos prácticos`,
      `Revisar evidencia y casos reales`,
      `Construir una propuesta intermedia`
    ],
    counterpointForSolo: `Por otro lado, cabe considerar que una postura alternativa priorizaría los efectos secundarios a largo plazo y las excepciones donde esta regla no aplica igual.`,
    spokenResponse: `Entiendo tu punto sobre ${topic}. ¿Bajo qué condiciones concretas crees que ambas posturas podrían coincidir?`
  };
}

function applyMediationResult(result, lastSpeakerKey) {
  // 1. Update Topic
  if (result.topic) {
    app.currentTopic = result.topic;
    ui.activeTopicText.textContent = result.topic;
  }

  // 2. Update Consensus Tracker
  if (typeof result.consensusScore === 'number') {
    app.consensusScore = result.consensusScore;
    ui.consensusTracker.classList.remove('hidden');
    ui.consensusPct.textContent = `${app.consensusScore}%`;
    ui.consensusBar.style.width = `${app.consensusScore}%`;
  }

  if (Array.isArray(result.commonGround) && result.commonGround.length > 0) {
    app.commonGround = result.commonGround;
    ui.commonGroundList.innerHTML = result.commonGround
      .map(item => `<div class="flex items-start gap-1.5"><span class="text-emerald-400">✓</span><span>${item}</span></div>`)
      .join('');
  }

  // 3. Save in history
  app.history.push({
    role: 'IA Mediadora',
    text: `${result.steelman || ''} ${result.socraticQuestion || ''}`
  });

  // 4. Render Rich AI Mediation Card with Exploration Buttons
  renderAIMediationCard(result);

  // 5. Switch active speaker turn automatically so the other person can reply
  if (!app.hasRemotePartner) {
    setActiveSpeaker(lastSpeakerKey === 'user1' ? 'user2' : 'user1');
  } else {
    updateStageUI('idle');
  }

  // 6. Speak out loud concisely
  const textToSpeak = result.spokenResponse || `${result.steelman}. ${result.socraticQuestion}`;
  speakAI(textToSpeak);
}

// ==========================================
// 9. INTERACTIVE CARDS & EXPLORATION PATHS
// ==========================================
function renderSpeakerCard(speakerKey, speakerName, text) {
  const isU1 = speakerKey === 'user1';
  const div = document.createElement('div');
  div.className = `p-3.5 rounded-2xl border text-xs shadow-md transition-all ${
    isU1 ? 'bg-sky-950/20 border-sky-500/30' : 'bg-amber-950/20 border-amber-500/30'
  }`;

  div.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-1.5 font-bold ${isU1 ? 'text-sky-400' : 'text-amber-400'}">
        <i data-lucide="user" class="w-3.5 h-3.5"></i>
        <span>${speakerName}</span>
      </div>
      <span class="text-[10px] text-slate-500">Intervención</span>
    </div>
    <p class="text-sm text-slate-100 leading-relaxed">${escapeHtml(text)}</p>
  `;

  ui.cardsContainer.appendChild(div);
  scrollToBottom();
  lucide.createIcons();
}

function renderAIMediationCard(res) {
  const div = document.createElement('div');
  div.className = 'p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/30 text-xs text-slate-200 shadow-lg space-y-3';

  const factsHtml = Array.isArray(res.verifiedFacts) && res.verifiedFacts.length > 0
    ? `
      <div class="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/20 space-y-1.5">
        <div class="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
          <i data-lucide="database" class="w-3.5 h-3.5"></i>
          <span>Datos y Contexto sobre el Tema</span>
        </div>
        <ul class="space-y-1 text-[11px] text-slate-300 list-disc list-inside leading-relaxed">
          ${res.verifiedFacts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const pathsHtml = Array.isArray(res.explorationPaths) && res.explorationPaths.length > 0
    ? `
      <div>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          🧭 ¿Por dónde quieren explorar ahora? (Toca una opción o responde con voz):
        </span>
        <div class="flex flex-wrap gap-1.5 exploration-buttons"></div>
      </div>
    `
    : '';

  div.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5 text-emerald-400 font-bold">
        <i data-lucide="sparkles" class="w-4 h-4"></i>
        <span>IA Mediadora</span>
      </div>
      <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
        Análisis en vivo
      </span>
    </div>

    ${res.steelman ? `
      <p class="text-xs text-slate-200 leading-relaxed">
        <strong class="text-emerald-300">Síntesis empática:</strong> ${escapeHtml(res.steelman)}
      </p>
    ` : ''}

    ${factsHtml}

    ${res.socraticQuestion ? `
      <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 font-medium flex items-start gap-2">
        <i data-lucide="help-circle" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
        <span>${escapeHtml(res.socraticQuestion)}</span>
      </div>
    ` : ''}

    ${pathsHtml}

    ${(!app.hasRemotePartner && res.counterpointForSolo) ? `
      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <span class="text-[10px] text-slate-400">¿Estás testeando solo?</span>
        <button class="solo-counterpoint-btn px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition flex items-center gap-1.5">
          <i data-lucide="users" class="w-3.5 h-3.5"></i>
          <span>Simular respuesta del Sujeto 2</span>
        </button>
      </div>
    ` : ''}
  `;

  // Bind Exploration Path Buttons
  const btnContainer = div.querySelector('.exploration-buttons');
  if (btnContainer && Array.isArray(res.explorationPaths)) {
    res.explorationPaths.forEach(pathText => {
      const btn = document.createElement('button');
      btn.className = 'text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition flex items-center gap-1';
      btn.innerHTML = `<span>👉 ${escapeHtml(pathText)}</span>`;
      btn.addEventListener('click', () => {
        submitArgument(app.activeSpeaker, `Exploremos este punto: ${pathText}`);
      });
      btnContainer.appendChild(btn);
    });
  }

  // Bind Solo Counterpoint Button
  const soloBtn = div.querySelector('.solo-counterpoint-btn');
  if (soloBtn && res.counterpointForSolo) {
    soloBtn.addEventListener('click', () => {
      soloBtn.remove();
      setActiveSpeaker('user2');
      submitArgument('user2', res.counterpointForSolo);
    });
  }

  ui.cardsContainer.appendChild(div);
  scrollToBottom();
  lucide.createIcons();
}

function scrollToBottom() {
  ui.cardsContainer.scrollTop = ui.cardsContainer.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// 10. WEBRTC P2P (VOICE + REALTIME DATA SYNC)
// ==========================================
function initP2P() {
  ui.inviteBtn.addEventListener('click', () => {
    if (!app.roomId) {
      app.roomId = 'debate-' + Math.floor(1000 + Math.random() * 9000);
    }
    const link = `${window.location.origin}${window.location.pathname}?room=${app.roomId}`;
    ui.shareLinkInput.value = link;
    ui.inviteModal.classList.remove('hidden');

    if (!app.peer) {
      setupHostPeer(app.roomId);
    }
  });

  ui.closeInviteModalBtn.addEventListener('click', () => ui.inviteModal.classList.add('hidden'));

  ui.copyShareLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(ui.shareLinkInput.value).then(() => {
      ui.copyShareLinkBtn.textContent = '¡Copiado!';
      setTimeout(() => (ui.copyShareLinkBtn.textContent = 'Copiar'), 2000);
    });
  });
}

function checkUrlRoom() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    app.roomId = room;
    setActiveSpeaker('user2');
    ui.connectionPill.textContent = 'Conectando a sala...';
    setupGuestPeer(room);
  }
}

function setupHostPeer(roomId) {
  if (typeof Peer === 'undefined') return;
  app.peer = new Peer(roomId);

  // 1. Incoming Data Connection (Syncs cards & AI responses)
  app.peer.on('connection', (conn) => {
    app.dataConn = conn;
    setupDataChannelListeners(conn, 'Sujeto 2');
  });

  // 2. Incoming Voice Call
  app.peer.on('call', async (call) => {
    await ensureAudioHardware();
    call.answer(app.mediaStream);
    call.on('stream', (remoteStream) => {
      ui.remoteAudio.srcObject = remoteStream;
    });
  });
}

function setupGuestPeer(targetRoom) {
  if (typeof Peer === 'undefined') return;
  app.peer = new Peer();

  app.peer.on('open', async () => {
    // 1. Connect DataChannel
    const conn = app.peer.connect(targetRoom);
    app.dataConn = conn;
    setupDataChannelListeners(conn, 'Sujeto 1');

    // 2. Connect Audio Stream
    const hasMic = await ensureAudioHardware();
    if (hasMic && app.mediaStream) {
      const call = app.peer.call(targetRoom, app.mediaStream);
      call.on('stream', (remoteStream) => {
        ui.remoteAudio.srcObject = remoteStream;
      });
    }
  });
}

function setupDataChannelListeners(conn, partnerLabel) {
  conn.on('open', () => {
    app.hasRemotePartner = true;
    ui.inviteModal.classList.add('hidden');
    ui.connectionPill.textContent = '🟢 2 Personas Conectadas';
    ui.connectionPill.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    ui.p2pModalStatus.textContent = '🟢 ¡Conectado en vivo!';
    ui.statusUser2.textContent = '🟢 En vivo';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 text-center font-medium';
    infoDiv.textContent = `🎉 ¡Conectado en tiempo real con ${partnerLabel}! Todo lo que hablen o exploren aparecerá sincronizado en ambas pantallas.`;
    ui.cardsContainer.appendChild(infoDiv);
    scrollToBottom();
  });

  conn.on('data', (payload) => {
    if (!payload || !payload.type) return;

    if (payload.type === 'SPEAKER_ARGUMENT') {
      app.history.push({
        role: payload.speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2',
        text: payload.text
      });
      renderSpeakerCard(payload.speakerKey, payload.speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2', payload.text);
      updateStageUI('thinking');
    } else if (payload.type === 'AI_MEDIATION') {
      applyMediationResult(payload.result, payload.nextSpeaker === 'user1' ? 'user2' : 'user1');
    }
  });
}

// ==========================================
// 11. UI EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  ui.mainMicBtn.addEventListener('click', toggleMicrophone);
  ui.stopAiBtn.addEventListener('click', stopAISpeech);

  ui.selectUser1Btn.addEventListener('click', () => setActiveSpeaker('user1'));
  ui.selectUser2Btn.addEventListener('click', () => setActiveSpeaker('user2'));

  const handleTextSend = () => {
    const val = ui.textInput.value.trim();
    if (!val) return;
    ui.textInput.value = '';
    submitArgument(app.activeSpeaker, val);
  };

  ui.textSendBtn.addEventListener('click', handleTextSend);
  ui.textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTextSend();
  });

  ui.voiceToggleBtn.addEventListener('click', () => {
    app.voiceEnabled = !app.voiceEnabled;
    if (app.voiceEnabled) {
      ui.voiceIcon.className = 'w-4 h-4 text-emerald-400';
    } else {
      stopAISpeech();
      ui.voiceIcon.className = 'w-4 h-4 text-slate-500';
    }
  });

  ui.resetSessionBtn.addEventListener('click', () => {
    stopAISpeech();
    app.currentTopic = null;
    app.history = [];
    app.consensusScore = 0;
    app.commonGround = [];
    ui.activeTopicText.textContent = 'Habla o escribe para proponer cualquier tema';
    ui.consensusTracker.classList.add('hidden');
    ui.cardsContainer.innerHTML = `
      <div class="p-4 rounded-2xl bg-surface border border-slate-800/80 text-xs text-slate-300 shadow-md">
        <p class="leading-relaxed">
          Conversación reiniciada. Presiona el botón para hablar o escribe cualquier tema nuevo que quieras explorar.
        </p>
      </div>
    `;
    setActiveSpeaker('user1');
    updateStageUI('idle');
  });
}
