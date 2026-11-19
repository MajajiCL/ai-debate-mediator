/**
 * Debate AI — Minimalist Voice-First Mobile Experience
 * Real-time Speech-to-Speech Mediation, P2P Rooms & Dynamic Exploration
 */

// ==========================================
// 1. APPLICATION STATE
// ==========================================
const app = {
  currentTopic: null,
  isRecording: false,
  isSpeaking: false,
  voiceEnabled: true,
  turnCount: 0,
  
  // Speakers
  currentUser: 'user1', // 'user1' or 'user2'
  hasRemotePartner: false,
  
  // Audio & Speech
  recognition: null,
  mediaStream: null,
  audioContext: null,
  selectedVoice: null,
  
  // P2P
  peer: null,
  currentCall: null,
  roomId: null
};

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const ui = {
  activeTopicText: document.getElementById('active-topic-text'),
  cardsContainer: document.getElementById('cards-container'),
  mainMicBtn: document.getElementById('main-mic-btn'),
  mainMicIcon: document.getElementById('main-mic-icon'),
  mainMicLabel: document.getElementById('main-mic-label'),
  textInput: document.getElementById('text-input'),
  textSendBtn: document.getElementById('text-send-btn'),
  stageStatusText: document.getElementById('stage-status-text'),
  liveIndicator: document.getElementById('live-indicator'),
  soundWaveBars: document.getElementById('sound-wave-bars'),
  
  // Avatars
  avatarUser1: document.getElementById('avatar-user1'),
  avatarAI: document.getElementById('avatar-ai'),
  avatarUser2: document.getElementById('avatar-user2'),
  statusUser1: document.getElementById('status-user1'),
  statusAI: document.getElementById('status-ai'),
  statusUser2: document.getElementById('status-user2'),
  aiPulseRing: document.getElementById('ai-pulse-ring'),
  
  // Buttons
  voiceToggleBtn: document.getElementById('voice-toggle-btn'),
  voiceIcon: document.getElementById('voice-icon'),
  resetSessionBtn: document.getElementById('reset-session-btn'),
  inviteBtn: document.getElementById('invite-btn'),
  
  // Modal
  inviteModal: document.getElementById('invite-modal'),
  closeInviteModalBtn: document.getElementById('close-invite-modal-btn'),
  shareLinkInput: document.getElementById('share-link-input'),
  copyShareLinkBtn: document.getElementById('copy-share-link-btn'),
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
// 4. SPEECH RECOGNITION (VOICE INPUT)
// ==========================================
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    ui.mainMicLabel.textContent = 'Dictado no soportado (usa texto)';
    return;
  }

  app.recognition = new SpeechRecognition();
  app.recognition.lang = 'es-ES';
  app.recognition.continuous = false;
  app.recognition.interimResults = false;

  app.recognition.onstart = () => {
    app.isRecording = true;
    updateStageUI('listening');
  };

  app.recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    handleUserInput(text);
  };

  app.recognition.onend = () => {
    app.isRecording = false;
    updateStageUI('idle');
  };

  app.recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    app.isRecording = false;
    updateStageUI('idle');
    if (e.error === 'not-allowed') {
      alert('Permiso de micrófono denegado. Habilítalo en la configuración de tu navegador para hablar.');
    }
  };
}

async function toggleMicrophone() {
  if (app.isRecording) {
    app.recognition?.stop();
    return;
  }

  // Request native permission explicitly first to ensure prompt appears
  if (!app.mediaStream) {
    try {
      app.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('Microphone permission request:', err);
    }
  }

  if (app.recognition) {
    try {
      app.recognition.start();
    } catch (e) {
      console.log('Recognition restart:', e);
    }
  } else {
    ui.textInput.focus();
  }
}

// ==========================================
// 5. SPEECH SYNTHESIS (AI VOICE)
// ==========================================
function initSpeechSynthesis() {
  if (!window.speechSynthesis) return;

  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    const es = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Elena') || v.name.includes('Pablo')));
    app.selectedVoice = es || voices.find(v => v.lang.startsWith('es')) || voices[0];
  };

  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function speak(text, onComplete) {
  if (!app.voiceEnabled || !window.speechSynthesis) {
    if (onComplete) onComplete();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  if (app.selectedVoice) utterance.voice = app.selectedVoice;

  utterance.onstart = () => {
    app.isSpeaking = true;
    updateStageUI('ai_speaking');
  };

  utterance.onend = () => {
    app.isSpeaking = false;
    updateStageUI('idle');
    if (onComplete) onComplete();
  };

  utterance.onerror = () => {
    app.isSpeaking = false;
    updateStageUI('idle');
    if (onComplete) onComplete();
  };

  window.speechSynthesis.speak(utterance);
}

// ==========================================
// 6. STAGE UI UPDATES (Avatars & Waves)
// ==========================================
function updateStageUI(state) {
  // Clear classes
  ui.avatarUser1.classList.remove('avatar-speaking-user');
  ui.avatarAI.classList.remove('avatar-speaking');
  ui.avatarUser2.classList.remove('avatar-speaking-partner');
  ui.aiPulseRing.classList.remove('pulse-ring-active');
  ui.soundWaveBars.classList.remove('wave-active');
  ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-slate-600';

  if (state === 'listening') {
    ui.avatarUser1.classList.add('avatar-speaking-user');
    ui.soundWaveBars.classList.add('wave-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-sky-400 animate-ping';
    ui.stageStatusText.textContent = 'Escuchándote... habla con tranquilidad';
    ui.mainMicBtn.className = 'w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2.5 active:scale-[0.98] ring-4 ring-rose-500/20';
    ui.mainMicLabel.textContent = 'Detener grabación';
    ui.statusUser1.textContent = 'Hablando';
  } else if (state === 'ai_speaking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.soundWaveBars.classList.add('wave-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    ui.stageStatusText.textContent = 'IA Mediadora interviniendo...';
    ui.statusAI.textContent = 'Hablando';
    ui.statusUser1.textContent = 'Escuchando';
    ui.mainMicBtn.className = 'w-full py-3.5 px-4 rounded-2xl bg-slate-800 text-slate-400 font-semibold text-sm transition flex items-center justify-center gap-2.5 cursor-not-allowed';
    ui.mainMicLabel.textContent = 'IA Mediando...';
  } else {
    // idle
    ui.stageStatusText.textContent = 'Toca el micrófono para plantear tu punto o responder';
    ui.statusUser1.textContent = 'Listo';
    ui.statusAI.textContent = 'Escuchando';
    ui.mainMicBtn.className = 'w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-brand/25 flex items-center justify-center gap-2.5 active:scale-[0.98]';
    ui.mainMicLabel.textContent = 'Toca para hablar';
  }
  lucide.createIcons();
}

// ==========================================
// 7. DIALOGUE LOGIC & SOCRATIC ENGINE
// ==========================================
function handleUserInput(rawText) {
  const text = rawText.trim();
  if (!text) return;

  app.turnCount++;

  // 1. Topic Extraction on first turn
  if (!app.currentTopic) {
    app.currentTopic = extractTopicFromSentence(text);
    ui.activeTopicText.textContent = app.currentTopic;
  }

  // 2. Render User Card
  renderCard({
    type: 'user',
    author: app.hasRemotePartner ? (app.currentUser === 'user1' ? 'Sujeto 1' : 'Sujeto 2') : 'Tú',
    text: text
  });

  // 3. Process AI Response
  processMediation(text);
}

function extractTopicFromSentence(sentence) {
  // Simple heuristic cleaner
  let cleaned = sentence.replace(/^(yo creo que|pienso que|estaba pensando que|me gustaría hablar de|quiero debatir sobre|para mí que|a mi parecer)\s+/i, '');
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 48) + '...';
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function processMediation(userText) {
  updateStageUI('thinking');
  ui.stageStatusText.textContent = 'IA formulando datos y mediación...';

  // Fetch Wikipedia fact if applicable
  const wikiFact = await fetchQuickFact(userText);

  // Generate Socratic Response
  const response = generateSocraticResponse(userText, app.turnCount, wikiFact);

  // Render AI Card
  setTimeout(() => {
    renderCard({
      type: 'ai',
      author: 'IA Mediadora',
      steelman: response.steelman,
      fact: response.fact,
      question: response.question
    });

    // Speak the response smoothly
    const spokenText = `${response.steelman}. ${response.question}`;
    speak(spokenText, () => {
      // If user is alone, simulate a constructive counterpoint after 3 seconds so they can test
      if (!app.hasRemotePartner && app.turnCount === 1) {
        suggestCounterpointPrompt(app.currentTopic);
      }
    });
  }, 400);
}

function generateSocraticResponse(text, turn, wikiFact) {
  // Reformulate constructively (Steelmanning)
  const steelman = `Entendido. Tu planteamiento central resalta que "${extractCoreIdea(text)}", apuntando a una inquietud legítima y de alto impacto`;
  
  // Fact contribution
  let fact = wikiFact || 'Para poner este punto en contexto: los consensos actuales sugieren evaluar tanto el beneficio inmediato como los efectos estructurales a largo plazo.';

  // Socratic Bridge Question
  const questions = [
    '¿Qué salvaguarda concreta o condición consideras indispensable para que esto funcione sin perjudicar a nadie?',
    'Si tuvieras que convencer a alguien con la postura opuesta, ¿cuál dirías que es el terreno en común que comparten?',
    '¿Cómo balanceamos ese punto con la necesidad de mantener la flexibilidad y sostenibilidad del sistema?'
  ];
  const question = questions[(turn - 1) % questions.length];

  return { steelman, fact, question };
}

function extractCoreIdea(text) {
  const words = text.split(' ');
  if (words.length <= 10) return text;
  return words.slice(0, 10).join(' ') + '...';
}

function suggestCounterpointPrompt(topic) {
  setTimeout(() => {
    renderCard({
      type: 'hint',
      author: 'Sugerencia de la IA para testear',
      text: `💡 Como estás testeando solo: Intenta ahora pulsar el micrófono y defender la postura contraria sobre "${topic}" para ver cómo la IA une ambos mundos en un consenso.`
    });
  }, 2500);
}

async function fetchQuickFact(query) {
  try {
    // Extract key nouns
    const words = query.split(' ').filter(w => w.length > 5);
    if (words.length === 0) return null;
    const term = words[0];

    const res = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.extract) {
      return `Dato de referencia: ${data.extract.substring(0, 150)}... (Fuente: Wikipedia)`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ==========================================
// 8. CARD RENDERING
// ==========================================
function renderCard({ type, author, text, steelman, fact, question }) {
  const div = document.createElement('div');
  div.className = 'p-4 rounded-2xl border transition-all duration-300 text-xs shadow-md animate-fade-in ';

  if (type === 'user') {
    div.className += 'bg-surface border-slate-800 text-slate-200';
    div.innerHTML = `
      <div class="flex items-center gap-2 mb-1.5 text-sky-400 font-bold">
        <i data-lucide="user" class="w-3.5 h-3.5"></i>
        <span>${author}</span>
      </div>
      <p class="text-sm text-slate-100 leading-relaxed">${text}</p>
    `;
  } else if (type === 'ai') {
    div.className += 'bg-slate-900/95 border-emerald-500/30 text-slate-200 shadow-emerald-500/5';
    div.innerHTML = `
      <div class="flex items-center gap-2 mb-2 text-emerald-400 font-bold">
        <i data-lucide="sparkles" class="w-4 h-4"></i>
        <span>${author}</span>
      </div>
      
      <p class="text-xs text-slate-300 mb-2 leading-relaxed">
        <strong class="text-emerald-300">Reformulación constructiva:</strong> ${steelman}.
      </p>

      ${fact ? `
        <div class="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-2 text-[11px] text-cyan-300 flex items-start gap-1.5">
          <i data-lucide="info" class="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5"></i>
          <span>${fact}</span>
        </div>
      ` : ''}

      <div class="pt-2 border-t border-slate-800/80 text-xs text-amber-300 font-medium flex items-start gap-1.5">
        <i data-lucide="help-circle" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"></i>
        <span><strong>Pregunta socrática:</strong> ${question}</span>
      </div>
    `;
  } else if (type === 'hint') {
    div.className += 'bg-indigo-950/30 border-indigo-800/50 text-indigo-200';
    div.innerHTML = `
      <p class="text-[11px] leading-relaxed">${text}</p>
    `;
  }

  ui.cardsContainer.appendChild(div);
  ui.cardsContainer.scrollTop = ui.cardsContainer.scrollHeight;
  lucide.createIcons();
}

// ==========================================
// 9. P2P VOICE ROOM (PEERJS)
// ==========================================
function initP2P() {
  ui.inviteBtn.addEventListener('click', () => {
    if (!app.roomId) {
      app.roomId = 'sala-' + Math.floor(1000 + Math.random() * 9000);
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
      setTimeout(() => ui.copyShareLinkBtn.textContent = 'Copiar', 2000);
    });
  });
}

function checkUrlRoom() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    app.roomId = room;
    app.currentUser = 'user2';
    ui.statusUser2.textContent = 'Conectando...';
    setupGuestPeer(room);
  }
}

function setupHostPeer(roomId) {
  if (typeof Peer === 'undefined') return;
  app.peer = new Peer(roomId);

  app.peer.on('call', async (call) => {
    if (!app.mediaStream) {
      try {
        app.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {}
    }

    call.answer(app.mediaStream);
    call.on('stream', (remoteStream) => {
      ui.remoteAudio.srcObject = remoteStream;
      onPartnerConnected('Sujeto 2');
    });
  });
}

function setupGuestPeer(targetRoom) {
  if (typeof Peer === 'undefined') return;
  app.peer = new Peer();

  app.peer.on('open', async () => {
    if (!app.mediaStream) {
      try {
        app.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {}
    }

    const call = app.peer.call(targetRoom, app.mediaStream);
    call.on('stream', (remoteStream) => {
      ui.remoteAudio.srcObject = remoteStream;
      onPartnerConnected('Sujeto 1');
    });
  });
}

function onPartnerConnected(partnerName) {
  app.hasRemotePartner = true;
  ui.avatarUser2.classList.remove('opacity-50');
  ui.statusUser2.textContent = '🟢 En vivo por voz';
  ui.statusUser2.className = 'text-[10px] text-emerald-400 font-bold';

  renderCard({
    type: 'hint',
    author: 'Sistema',
    text: `🎉 ¡${partnerName} se ha unido a la sala por voz! Ahora ambos pueden hablar directamente y la IA mediará sus intervenciones.`
  });
}

// ==========================================
// 10. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Main Mic Button
  ui.mainMicBtn.addEventListener('click', toggleMicrophone);

  // Text Input Send
  const sendText = () => {
    const val = ui.textInput.value.trim();
    if (!val) return;
    ui.textInput.value = '';
    handleUserInput(val);
  };

  ui.textSendBtn.addEventListener('click', sendText);
  ui.textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendText();
  });

  // Voice Toggle
  ui.voiceToggleBtn.addEventListener('click', () => {
    app.voiceEnabled = !app.voiceEnabled;
    if (app.voiceEnabled) {
      ui.voiceIcon.className = 'w-4 h-4 text-emerald-400';
    } else {
      window.speechSynthesis?.cancel();
      ui.voiceIcon.className = 'w-4 h-4 text-slate-500';
    }
  });

  // Reset Session
  ui.resetSessionBtn.addEventListener('click', () => {
    window.speechSynthesis?.cancel();
    app.currentTopic = null;
    app.turnCount = 0;
    ui.activeTopicText.textContent = '¿De qué te gustaría hablar hoy?';
    ui.cardsContainer.innerHTML = `
      <div class="p-4 rounded-2xl bg-surface border border-slate-800/80 text-xs text-slate-300 shadow-md">
        <p class="leading-relaxed">
          Sesión reiniciada. Presiona el micrófono abajo y plantea cualquier tema para debatir.
        </p>
      </div>
    `;
    updateStageUI('idle');
  });
}
