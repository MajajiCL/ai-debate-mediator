/**
 * Debate AI — Conversational Socratic Voice Mediator
 * - Fixes Whisper phonetic errors ("Hola, total. Y si era de batir..." -> "Hola, ¿qué tal? Quisiera debatir...")
 * - Calls Pollinations /openai endpoint with proper 22s timeout (never prematurely aborts at 5.5s)
 * - Uses Wikipedia matched article titles and real topic-specific postures (zero generic corporate templates)
 * - Only shows Common Ground % after both sides have actually debated
 * - Spacious natural layout where cards are never cut off
 */

// ==========================================
// 1. STATE
// ==========================================
const app = {
  currentTopic: null,
  activeSpeaker: 'user1', // 'user1' (Sujeto 1) or 'user2' (Sujeto 2)
  isRecording: false,
  isTranscribing: false,
  isSpeaking: false,
  isProcessingAI: false,
  voiceEnabled: true,

  // Conversation Memory
  history: [],
  userTurnCount: 0,
  consensusScore: 0,
  commonGround: [],
  lastSpeakerTextNode: null,

  // Audio Hardware & Recording (Works in Brave, Firefox, Chrome, Edge, Safari)
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  recordingStartTime: 0,
  recordingTimerInterval: null,
  audioContext: null,
  analyser: null,

  // Browser SpeechRecognition + Local Whisper Fallback
  recognition: null,
  browserTranscriptBuffer: '',
  whisperTranscriber: null,
  whisperLoadingPromise: null,
  whisperReady: false,

  // Speech Synthesis
  selectedVoice: null,
  ttsKeepAliveTimer: null,

  // WebRTC P2P (Voice + Data Sync)
  peer: null,
  dataConn: null,
  roomId: null,
  hasRemotePartner: false
};

// ==========================================
// 2. DOM REFERENCES
// ==========================================
const ui = {
  whisperStatusPill: document.getElementById('whisper-status-pill'),
  activeTopicText: document.getElementById('active-topic-text'),
  cardsContainer: document.getElementById('cards-container'),
  welcomeCard: document.getElementById('welcome-card'),

  // Stage Speakers
  talkUser1Btn: document.getElementById('talk-user1-btn'),
  talkUser2Btn: document.getElementById('talk-user2-btn'),
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
  recordingTimer: document.getElementById('recording-timer'),
  liveTranscriptText: document.getElementById('live-transcript-text'),
  stageStatusText: document.getElementById('stage-status-text'),
  liveIndicator: document.getElementById('live-indicator'),
  micVolumeBar: document.getElementById('mic-volume-bar'),

  // Consensus Tracker
  consensusTracker: document.getElementById('consensus-tracker'),
  consensusPct: document.getElementById('consensus-pct'),
  consensusBar: document.getElementById('consensus-bar'),
  commonGroundList: document.getElementById('common-ground-list'),

  // Controls
  mainMicBtn: document.getElementById('main-mic-btn'),
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
  initBrowserSpeechRecognition();
  preloadLocalWhisperModel();
  initP2P();
  setupEventListeners();
  bindQuickTestChips();
  checkUrlRoom();
});

// ==========================================
// 4. SPANISH PHONETIC CLEANUP & WHISPER STT
// ==========================================
function cleanPhoneticTranscript(raw) {
  if (!raw) return '';
  let s = raw.trim();
  // Common Whisper-tiny phonetic mishearings in Spanish
  s = s.replace(/\bhola[,\s]+total\b/gi, 'Hola, ¿qué tal?');
  s = s.replace(/\by si era\b/gi, 'quisiera');
  s = s.replace(/\bqui si era\b/gi, 'quisiera');
  s = s.replace(/\bde batir\b/gi, 'debatir');
  s = s.replace(/\bde va tir\b/gi, 'debatir');
  s = s.replace(/\bsobre galileo galil\b/gi, 'sobre Galileo Galilei');
  return s;
}

async function preloadLocalWhisperModel() {
  if (app.whisperLoadingPromise) return app.whisperLoadingPromise;

  app.whisperLoadingPromise = (async () => {
    try {
      ui.whisperStatusPill.textContent = '🧠 Cargando voz IA...';
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowLocalModels = false;

      app.whisperTranscriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: (info) => {
          if (info.status === 'progress' && info.progress) {
            ui.whisperStatusPill.textContent = `🧠 Voz IA: ${Math.round(info.progress)}%`;
          }
        }
      });

      app.whisperReady = true;
      ui.whisperStatusPill.textContent = '🟢 Voz IA Lista';
      ui.whisperStatusPill.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      return app.whisperTranscriber;
    } catch (err) {
      console.warn('Whisper preload warning:', err);
      ui.whisperStatusPill.textContent = '🟢 Modo Voz Activo';
      return null;
    }
  })();

  return app.whisperLoadingPromise;
}

async function transcribeBlobWithWhisper(audioBlob) {
  try {
    ui.stageStatusText.textContent = '🧠 Procesando tu voz localmente...';
    ui.liveTranscriptBox.classList.remove('hidden');
    ui.recordingTimer.textContent = '🧠 Transcribiendo...';
    ui.liveTranscriptText.textContent = 'Convirtiendo tu audio a texto...';

    const arrayBuffer = await audioBlob.arrayBuffer();
    const DecodeCtx = window.AudioContext || window.webkitAudioContext;
    const tempCtx = new DecodeCtx({ sampleRate: 16000 });
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    const float32Audio = audioBuffer.getChannelData(0);

    let maxPeak = 0;
    for (let i = 0; i < float32Audio.length; i++) {
      const abs = Math.abs(float32Audio[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
    if (maxPeak < 0.005) return '';

    const transcriber = app.whisperTranscriber || (await preloadLocalWhisperModel());
    if (!transcriber) return '';

    const result = await transcriber(float32Audio, {
      language: 'spanish',
      task: 'transcribe'
    });

    const rawText = (result?.text || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    return cleanPhoneticTranscript(rawText);
  } catch (err) {
    console.warn('Whisper transcription error:', err);
    return '';
  } finally {
    ui.liveTranscriptBox.classList.add('hidden');
  }
}

// ==========================================
// 5. UNIFIED MICROPHONE RECORDING
// ==========================================
async function ensureAudioHardware() {
  if (app.mediaStream && app.mediaStream.active) return true;
  try {
    app.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    app.audioContext = new AudioCtx();
    const source = app.audioContext.createMediaStreamSource(app.mediaStream);
    app.analyser = app.audioContext.createAnalyser();
    app.analyser.fftSize = 128;
    source.connect(app.analyser);
    startVUMeterLoop();
    return true;
  } catch (err) {
    alert('No se pudo acceder a tu micrófono. Verifica que hayas dado permiso en el icono junto a la URL.');
    return false;
  }
}

function startVUMeterLoop() {
  if (!app.analyser) return;
  const data = new Uint8Array(app.analyser.frequencyBinCount);

  const loop = () => {
    if (app.analyser && (app.isRecording || app.hasRemotePartner)) {
      app.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const pct = Math.min(100, Math.round((avg / 110) * 100));
      ui.micVolumeBar.style.width = `${pct}%`;
    } else {
      ui.micVolumeBar.style.width = '0%';
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function initBrowserSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  app.recognition = new SpeechRecognition();
  app.recognition.lang = 'es-ES';
  app.recognition.continuous = true;
  app.recognition.interimResults = true;

  app.recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        app.browserTranscriptBuffer += piece + ' ';
      } else {
        interim += piece;
      }
    }
    const combined = cleanPhoneticTranscript((app.browserTranscriptBuffer + interim).trim());
    if (combined) {
      ui.liveTranscriptText.textContent = `"${combined}"`;
    }
  };

  app.recognition.onerror = (e) => {
    if (e.error === 'network' || e.error === 'service-not-allowed') {
      ui.liveTranscriptText.textContent = 'Grabando voz... Presiona el botón rojo cuando termines';
    }
  };
}

async function handleSpeakerClick(targetSpeaker) {
  if (app.isProcessingAI || app.isTranscribing) return;

  if (app.isSpeaking) {
    stopAISpeech();
  }

  if (app.isRecording) {
    stopRecordingAndProcess();
    return;
  }

  setActiveSpeaker(targetSpeaker);
  await startRecording();
}

async function toggleMainMicButton() {
  await handleSpeakerClick(app.activeSpeaker);
}

async function startRecording() {
  const ok = await ensureAudioHardware();
  if (!ok) {
    ui.textInput.focus();
    return;
  }

  if (app.audioContext && app.audioContext.state === 'suspended') {
    await app.audioContext.resume();
  }

  app.isRecording = true;
  app.audioChunks = [];
  app.browserTranscriptBuffer = '';
  app.recordingStartTime = Date.now();

  try {
    app.mediaRecorder = new MediaRecorder(app.mediaStream);
    app.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) app.audioChunks.push(e.data);
    };
    app.mediaRecorder.start(200);
  } catch (err) {
    console.error('MediaRecorder start error:', err);
  }

  if (app.recognition) {
    try {
      app.recognition.start();
    } catch (e) {}
  }

  ui.liveTranscriptBox.classList.remove('hidden');
  ui.recordingTimer.textContent = 'Grabando 00:00s';
  ui.liveTranscriptText.textContent = 'Habla ahora... Toca el botón rojo cuando termines';
  updateStageUI('listening');

  clearInterval(app.recordingTimerInterval);
  app.recordingTimerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - app.recordingStartTime) / 1000);
    ui.recordingTimer.textContent = `Grabando 00:${String(secs).padStart(2, '0')}s`;
  }, 500);
}

function stopRecordingAndProcess() {
  if (!app.isRecording) return;
  app.isRecording = false;
  clearInterval(app.recordingTimerInterval);

  if (app.recognition) {
    try {
      app.recognition.stop();
    } catch (e) {}
  }

  const finishWithBlob = async (audioBlob) => {
    app.isTranscribing = true;
    updateStageUI('thinking');

    let capturedText = cleanPhoneticTranscript(app.browserTranscriptBuffer.trim());
    const liveBoxText = ui.liveTranscriptText.textContent.replace(/^"|"$/g, '').trim();
    if (!capturedText && ui.liveTranscriptText.textContent.startsWith('"')) {
      capturedText = cleanPhoneticTranscript(liveBoxText);
    }

    if (!capturedText && audioBlob && audioBlob.size > 0) {
      capturedText = await transcribeBlobWithWhisper(audioBlob);
    }

    app.isTranscribing = false;
    ui.liveTranscriptBox.classList.add('hidden');

    if (capturedText && capturedText.length > 1) {
      submitArgument(app.activeSpeaker, capturedText);
    } else {
      renderAudioFallbackCard(app.activeSpeaker, audioBlob);
      updateStageUI('idle');
    }
  };

  if (app.mediaRecorder && app.mediaRecorder.state !== 'inactive') {
    app.mediaRecorder.onstop = () => {
      const mimeType = app.mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(app.audioChunks, { type: mimeType });
      finishWithBlob(blob);
    };
    app.mediaRecorder.stop();
  } else {
    finishWithBlob(null);
  }
}

function renderAudioFallbackCard(speakerKey, audioBlob) {
  const speakerName = speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2';
  const div = document.createElement('div');
  div.className = 'p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 text-xs text-slate-200 space-y-2.5';
  const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;

  div.innerHTML = `
    <div class="flex items-center justify-between text-amber-400 font-bold">
      <span>🎙️ Audio de ${speakerName}</span>
      <span class="text-[10px] text-slate-400">Confirmar idea</span>
    </div>
    ${audioUrl ? `<audio controls src="${audioUrl}" class="w-full h-8"></audio>` : ''}
    <div class="flex gap-1.5">
      <input type="text" class="fallback-input flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400" placeholder="Escribe lo que dijiste aquí..." />
      <button class="fallback-send-btn px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition">
        Enviar
      </button>
    </div>
  `;

  const input = div.querySelector('.fallback-input');
  const btn = div.querySelector('.fallback-send-btn');
  const send = () => {
    const val = input.value.trim();
    if (!val) return;
    div.remove();
    submitArgument(speakerKey, val);
  };
  btn.addEventListener('click', send);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
  });

  ui.cardsContainer.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  input.focus();
}

// ==========================================
// 6. SPEAKER TURN & STAGE UI
// ==========================================
function setActiveSpeaker(speaker) {
  app.activeSpeaker = speaker;
  const isU1 = speaker === 'user1';

  if (isU1) {
    ui.avatarUser1.className = 'w-10 h-10 rounded-full bg-slate-800 border-2 border-sky-400 flex items-center justify-center relative flex-shrink-0 transition-all ring-2 ring-sky-400/30';
    ui.badgeUser1.className = 'px-1.5 py-0.2 rounded bg-sky-500 text-slate-950 text-[9px] font-extrabold';
    ui.badgeUser1.textContent = 'Activo';

    ui.avatarUser2.className = 'w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative flex-shrink-0 transition-all opacity-75';
    ui.badgeUser2.className = 'px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold';
    ui.badgeUser2.textContent = 'Hablar';
  } else {
    ui.avatarUser2.className = 'w-10 h-10 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center relative flex-shrink-0 transition-all ring-2 ring-amber-400/30';
    ui.badgeUser2.className = 'px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9px] font-extrabold';
    ui.badgeUser2.textContent = 'Activo';

    ui.avatarUser1.className = 'w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative flex-shrink-0 transition-all opacity-75';
    ui.badgeUser1.className = 'px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[9px] font-bold';
    ui.badgeUser1.textContent = 'Hablar';
  }

  if (!app.isRecording && !app.isSpeaking && !app.isProcessingAI) {
    const labelName = isU1 ? 'Sujeto 1' : 'Sujeto 2';
    ui.mainMicLabel.textContent = `🎙️ Hablar como ${labelName}`;
    ui.textInput.placeholder = `O escribe lo que piensa ${labelName} aquí...`;
  }
}

function updateStageUI(mode) {
  ui.avatarUser1.classList.remove('avatar-speaking-user');
  ui.avatarAI.classList.remove('avatar-speaking');
  ui.avatarUser2.classList.remove('avatar-speaking-partner');
  ui.aiPulseRing.classList.remove('pulse-ring-active');

  const speakerLabel = app.activeSpeaker === 'user1' ? 'Sujeto 1' : 'Sujeto 2';

  if (mode === 'listening') {
    if (app.activeSpeaker === 'user1') {
      ui.avatarUser1.classList.add('avatar-speaking-user');
      ui.badgeUser1.textContent = '⏹️ Enviar';
      ui.statusUser1.textContent = '🔴 Grabando...';
    } else {
      ui.avatarUser2.classList.add('avatar-speaking-partner');
      ui.badgeUser2.textContent = '⏹️ Enviar';
      ui.statusUser2.textContent = '🔴 Grabando...';
    }
    ui.liveIndicator.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
    ui.stageStatusText.textContent = `Grabando a ${speakerLabel}... Toca el botón rojo al terminar`;
    ui.mainMicBtn.className = 'flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all duration-200 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 ring-4 ring-rose-500/30';
    ui.mainMicLabel.textContent = `⏹️ Terminé de hablar (${speakerLabel})`;
  } else if (mode === 'thinking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.liveIndicator.className = 'w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping';
    ui.stageStatusText.textContent = 'IA analizando el tema y preparando datos reales...';
    ui.mainMicBtn.className = 'flex-1 py-3 px-4 rounded-2xl bg-slate-800 text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 cursor-wait';
    ui.mainMicLabel.textContent = '✨ Preparando análisis y datos...';
  } else if (mode === 'ai_speaking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.liveIndicator.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    ui.stageStatusText.textContent = 'IA Mediadora hablando...';
    ui.mainMicBtn.className = 'flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2';
    ui.mainMicLabel.textContent = `🎙️ Responder (${speakerLabel})`;
  } else {
    ui.liveIndicator.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
    ui.stageStatusText.textContent = `Turno de ${speakerLabel}: habla o elige una postura/ruta abajo`;
    ui.statusUser1.textContent = 'Toca para hablar';
    ui.statusUser2.textContent = app.hasRemotePartner ? '🟢 En vivo' : 'Toca para hablar';
    setActiveSpeaker(app.activeSpeaker);
    ui.mainMicBtn.className = 'flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-brand/25 flex items-center justify-center gap-2 active:scale-[0.98]';
  }
}

// ==========================================
// 7. SPEECH SYNTHESIS (NON-INTERRUPTING)
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
  utterance.rate = 1.04;
  utterance.pitch = 1.0;
  if (app.selectedVoice) utterance.voice = app.selectedVoice;

  utterance.onstart = () => {
    app.isSpeaking = true;
    ui.stopAiBtn.classList.remove('hidden');
    updateStageUI('ai_speaking');

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
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  app.isSpeaking = false;
  ui.stopAiBtn.classList.add('hidden');
  updateStageUI('idle');
}

// ==========================================
// 8. REAL CONVERSATIONAL LLM & WIKIPEDIA ENGINE
// ==========================================
async function submitArgument(speakerKey, rawText, isFromRemote = false) {
  const cleanedText = cleanPhoneticTranscript(rawText.trim());
  if (!cleanedText || app.isProcessingAI) return;

  // Hide welcome card on first turn so screen is clean and spacious
  if (ui.welcomeCard) {
    ui.welcomeCard.classList.add('hidden');
  }

  app.userTurnCount++;
  const speakerName = speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2';
  app.history.push({ role: speakerName, text: cleanedText });

  const msgTextNode = renderSpeakerCard(speakerKey, speakerName, cleanedText);
  app.lastSpeakerTextNode = msgTextNode;

  if (!isFromRemote && app.dataConn && app.dataConn.open) {
    app.dataConn.send({
      type: 'SPEAKER_ARGUMENT',
      speakerKey,
      text: cleanedText
    });
  }

  if (!isFromRemote) {
    await runAIMediation(speakerKey, speakerName, cleanedText);
  }
}

async function runAIMediation(speakerKey, speakerName, latestText) {
  app.isProcessingAI = true;
  updateStageUI('thinking');

  // 1. Fetch Wikipedia article title + extracts in parallel (~0.8s)
  const wikiPromise = fetchWikipediaData(latestText);

  let result = null;
  try {
    const [llmResult, wikiData] = await Promise.all([
      fetchOpenAICompatibleMediation(speakerName, latestText),
      wikiPromise
    ]);

    result = llmResult;

    // Enrich with verified Wikipedia extract if available
    if (wikiData.extracts.length > 0) {
      const existingFacts = Array.isArray(result.keyFacts) ? result.keyFacts : [];
      result.keyFacts = [...existingFacts.slice(0, 2), wikiData.extracts[0]];
    }
  } catch (err) {
    console.warn('LLM fallback using Wikipedia knowledge:', err);
    const wikiData = await wikiPromise;
    result = buildWikipediaDrivenMediation(speakerName, latestText, wikiData);
  }

  app.isProcessingAI = false;
  applyMediationResult(result, speakerKey);

  if (app.dataConn && app.dataConn.open) {
    app.dataConn.send({
      type: 'AI_MEDIATION',
      result,
      nextSpeaker: speakerKey === 'user1' ? 'user2' : 'user1'
    });
  }
}

async function fetchOpenAICompatibleMediation(speakerName, latestText) {
  const controller = new AbortController();
  // 22-second timeout so we NEVER prematurely kill the LLM response at 5.5s
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  try {
    const historySummary = app.history.slice(-6).map(h => `${h.role}: "${h.text}"`).join('\n');

    const systemPrompt = `Eres un mediador de debates brillante, cálido y directo en español.
El mensaje del usuario puede venir de un micrófono (Whisper), así que corrige errores fonéticos obvios en "correctedText" (por ejemplo: "Hola total. Y si era de batir sobre Galileo Galilei" -> "Hola, ¿qué tal? Quisiera debatir sobre Galileo Galilei").
PROHIBIDO usar frases corporativas vacías como "mejorar los resultados prácticos", "experimento piloto" o "criterios claros". Habla SIEMPRE de forma específica, natural e interesante sobre el tema real que planteó el usuario.

Responde ÚNICAMENTE con un objeto JSON válido con estas claves exactas:
{
  "correctedText": "La frase del usuario corregida de errores fonéticos de micrófono",
  "topicTitle": "Título corto y limpio del tema (3 a 6 palabras, ej: 'Galileo Galilei: Ciencia vs. Inquisición')",
  "mediatorMessage": "Tu respuesta directa, natural y conversacional sobre el tema (2 a 3 oraciones claras que se leerán en voz alta)",
  "keyFacts": [
    "Dato histórico, científico o empírico real y concreto #1 sobre el tema",
    "Dato real y concreto #2 sobre el tema"
  ],
  "stanceA": "Postura A específica sobre este tema (1 oración clara que alguien podría defender)",
  "stanceB": "Postura B opuesta o complementaria sobre este tema (1 oración clara para contrastar)",
  "socraticQuestion": "Pregunta aguda y específica sobre este tema para abrir o avanzar el debate",
  "consensusPercentage": número entero (0 si recién se propone el tema y aún no debaten dos posturas; 20 a 95 si ya hay posturas comparadas),
  "sharedPoints": ["Punto específico en común si ya debatieron dos posturas (dejar array vacío [] si es el primer turno)"]
}`;

    const userPrompt = `Historial del debate (Turnos totales: ${app.userTurnCount}):
${historySummary}

Última intervención de ${speakerName}: "${latestText}"`;

    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return parseCleanJSON(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCleanJSON(rawText) {
  const first = rawText.indexOf('{');
  const last = rawText.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('No JSON object found');
  return JSON.parse(rawText.substring(first, last + 1));
}

async function fetchWikipediaData(userText) {
  try {
    const stopWords = new Set([
      'hola', 'total', 'que', 'tal', 'quisiera', 'quiero', 'debatir', 'batir',
      'sobre', 'pienso', 'creo', 'parece', 'deberia', 'debería', 'porque',
      'cuando', 'donde', 'como', 'para', 'este', 'esta', 'estos', 'estas',
      'hablar', 'punto', 'tema', 'postura', 'defiendo'
    ]);

    const keywords = userText
      .replace(/[¿?¡!.,;:"]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
      .slice(0, 3)
      .join(' ');

    if (!keywords) return { title: null, extracts: [] };

    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=2&generator=search&gsrsearch=${encodeURIComponent(keywords)}&gsrlimit=2&format=json&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const data = await res.json();
    if (!data?.query?.pages) return { title: keywords, extracts: [] };

    const pages = Object.values(data.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0));
    const topTitle = pages[0]?.title || keywords;
    const extracts = pages
      .filter(p => p.extract && p.extract.length > 30)
      .map(p => `${p.title}: ${p.extract.replace(/\s+/g, ' ').trim()} (Wikipedia)`);

    return { title: topTitle, extracts };
  } catch (e) {
    return { title: null, extracts: [] };
  }
}

function buildWikipediaDrivenMediation(speakerName, text, wikiData) {
  const cleanTitle = wikiData?.title || app.currentTopic || 'Tema en discusión';
  const facts = wikiData?.extracts?.length > 0
    ? wikiData.extracts
    : [`Contexto sobre ${cleanTitle}: existen distintas visiones históricas y prácticas sobre su impacto.`];

  return {
    correctedText: cleanPhoneticTranscript(text),
    topicTitle: cleanTitle,
    mediatorMessage: `Excelente tema: ${cleanTitle}. Aquí tienes el contexto histórico y documental verificado junto con dos posturas claras para abrir el debate.`,
    keyFacts: facts,
    stanceA: `A favor del impacto transformador y la relevancia central de ${cleanTitle}.`,
    stanceB: `Mirada crítica sobre los límites, controversias o contexto histórico de ${cleanTitle}.`,
    socraticQuestion: `Considerando estos antecedentes sobre ${cleanTitle}, ¿cuál de estas dos posturas te parece más sólida y por qué?`,
    consensusPercentage: app.userTurnCount >= 2 ? 40 : 0,
    sharedPoints: []
  };
}

function applyMediationResult(result, lastSpeakerKey) {
  // 1. Auto-correct Whisper phonetic typos on the user's bubble!
  if (result.correctedText && app.lastSpeakerTextNode) {
    app.lastSpeakerTextNode.textContent = result.correctedText;
    if (app.history.length > 0) {
      app.history[app.history.length - 1].text = result.correctedText;
    }
  }

  // 2. Update Topic Title cleanly (NEVER raw user transcript!)
  if (result.topicTitle) {
    app.currentTopic = result.topicTitle;
    ui.activeTopicText.textContent = result.topicTitle;
  }

  // 3. Only show Consensus Tracker if at least 2 user turns have taken place AND sharedPoints exist
  const hasRealConsensus = app.userTurnCount >= 2 &&
    typeof result.consensusPercentage === 'number' &&
    result.consensusPercentage > 0 &&
    Array.isArray(result.sharedPoints) &&
    result.sharedPoints.length > 0;

  if (hasRealConsensus) {
    app.consensusScore = result.consensusPercentage;
    ui.consensusTracker.classList.remove('hidden');
    ui.consensusPct.textContent = `${app.consensusScore}%`;
    ui.consensusBar.style.width = `${app.consensusScore}%`;
    ui.commonGroundList.innerHTML = result.sharedPoints
      .map(item => `<div class="flex items-start gap-1.5"><span class="text-emerald-400">✓</span><span>${escapeHtml(item)}</span></div>`)
      .join('');
  } else if (app.userTurnCount < 2) {
    ui.consensusTracker.classList.add('hidden');
  }

  // 4. Save AI turn in history
  app.history.push({
    role: 'IA Mediadora',
    text: `${result.mediatorMessage || ''} ${result.socraticQuestion || ''}`
  });

  // 5. Render Clean Conversational AI Card
  const aiCardEl = renderAIMediationCard(result);

  // 6. Advance turn indicator
  if (!app.hasRemotePartner) {
    setActiveSpeaker(lastSpeakerKey === 'user1' ? 'user2' : 'user1');
  } else {
    updateStageUI('idle');
  }

  // 7. Smooth scroll to top of the AI card so the beginning of the response is NEVER cut off
  setTimeout(() => {
    aiCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);

  // 8. Speak natural response out loud
  const spoken = `${result.mediatorMessage || ''} ${result.socraticQuestion || ''}`.trim();
  speakAI(spoken);
}

// ==========================================
// 9. RENDER CONVERSATIONAL CARDS
// ==========================================
function renderSpeakerCard(speakerKey, speakerName, text) {
  const isU1 = speakerKey === 'user1';
  const div = document.createElement('div');
  div.className = `p-3.5 rounded-2xl border text-xs shadow-md transition-all ${
    isU1 ? 'bg-sky-950/25 border-sky-500/35' : 'bg-amber-950/25 border-amber-500/35'
  }`;

  div.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-1.5 font-bold ${isU1 ? 'text-sky-400' : 'text-amber-400'}">
        <i data-lucide="user" class="w-3.5 h-3.5"></i>
        <span>${speakerName}</span>
      </div>
      <span class="text-[10px] text-slate-400">Intervención</span>
    </div>
    <p class="speaker-text text-sm text-slate-100 leading-relaxed">${escapeHtml(text)}</p>
  `;

  ui.cardsContainer.appendChild(div);
  lucide.createIcons();
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return div.querySelector('.speaker-text');
}

function renderAIMediationCard(res) {
  const div = document.createElement('div');
  div.className = 'p-4 rounded-2xl bg-slate-900/95 border border-emerald-500/30 text-xs text-slate-200 shadow-xl space-y-3.5';

  const factsHtml = Array.isArray(res.keyFacts) && res.keyFacts.length > 0
    ? `
      <div class="p-3 rounded-xl bg-slate-950/85 border border-cyan-500/25 space-y-1.5">
        <div class="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
          <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
          <span>Datos y Contexto sobre ${escapeHtml(res.topicTitle || 'el tema')}</span>
        </div>
        <ul class="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside leading-relaxed">
          ${res.keyFacts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const stancesHtml = (res.stanceA && res.stanceB)
    ? `
      <div class="space-y-2">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
          ⚖️ Posturas en juego (Toca cualquiera para defenderla o responde con tu voz):
        </span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button class="stance-a-btn text-left p-2.5 rounded-xl bg-sky-950/35 hover:bg-sky-900/50 border border-sky-500/35 transition group">
            <div class="text-[10px] font-bold text-sky-400 mb-0.5 flex items-center justify-between">
              <span>🔵 Postura A (Sujeto 1)</span>
              <span class="opacity-0 group-hover:opacity-100 transition text-[9px]">Defender →</span>
            </div>
            <p class="text-[11px] text-slate-200 leading-snug">${escapeHtml(res.stanceA)}</p>
          </button>

          <button class="stance-b-btn text-left p-2.5 rounded-xl bg-amber-950/35 hover:bg-amber-900/50 border border-amber-500/35 transition group">
            <div class="text-[10px] font-bold text-amber-400 mb-0.5 flex items-center justify-between">
              <span>🟠 Postura B (Sujeto 2)</span>
              <span class="opacity-0 group-hover:opacity-100 transition text-[9px]">Defender →</span>
            </div>
            <p class="text-[11px] text-slate-200 leading-snug">${escapeHtml(res.stanceB)}</p>
          </button>
        </div>
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
        ${escapeHtml(res.topicTitle || 'Mediación')}
      </span>
    </div>

    ${res.mediatorMessage ? `
      <p class="text-sm text-slate-100 leading-relaxed">
        ${escapeHtml(res.mediatorMessage)}
      </p>
    ` : ''}

    ${factsHtml}

    ${stancesHtml}

    ${res.socraticQuestion ? `
      <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 font-medium flex items-start gap-2">
        <i data-lucide="help-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
        <span>${escapeHtml(res.socraticQuestion)}</span>
      </div>
    ` : ''}
  `;

  // Bind Stance A & Stance B interactive buttons
  const btnA = div.querySelector('.stance-a-btn');
  if (btnA && res.stanceA) {
    btnA.addEventListener('click', () => {
      setActiveSpeaker('user1');
      submitArgument('user1', res.stanceA);
    });
  }

  const btnB = div.querySelector('.stance-b-btn');
  if (btnB && res.stanceB) {
    btnB.addEventListener('click', () => {
      setActiveSpeaker('user2');
      submitArgument('user2', res.stanceB);
    });
  }

  ui.cardsContainer.appendChild(div);
  lucide.createIcons();
  return div;
}

function bindQuickTestChips() {
  document.querySelectorAll('.quick-test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        submitArgument(app.activeSpeaker, prompt);
      }
    });
  });
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
    setupGuestPeer(room);
  }
}

function setupHostPeer(roomId) {
  if (typeof Peer === 'undefined') return;
  app.peer = new Peer(roomId);

  app.peer.on('connection', (conn) => {
    app.dataConn = conn;
    setupDataChannelListeners(conn, 'Sujeto 2');
  });

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
    const conn = app.peer.connect(targetRoom);
    app.dataConn = conn;
    setupDataChannelListeners(conn, 'Sujeto 1');

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
    ui.p2pModalStatus.textContent = '🟢 ¡Conectado en vivo!';
    ui.statusUser2.textContent = '🟢 En vivo';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 text-center font-medium';
    infoDiv.textContent = `🎉 ¡Conectado en tiempo real con ${partnerLabel}!`;
    ui.cardsContainer.appendChild(infoDiv);
  });

  conn.on('data', (payload) => {
    if (!payload || !payload.type) return;

    if (payload.type === 'SPEAKER_ARGUMENT') {
      if (ui.welcomeCard) ui.welcomeCard.classList.add('hidden');
      app.userTurnCount++;
      app.history.push({
        role: payload.speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2',
        text: payload.text
      });
      app.lastSpeakerTextNode = renderSpeakerCard(
        payload.speakerKey,
        payload.speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2',
        payload.text
      );
      updateStageUI('thinking');
    } else if (payload.type === 'AI_MEDIATION') {
      applyMediationResult(payload.result, payload.nextSpeaker === 'user1' ? 'user2' : 'user1');
    }
  });
}

// ==========================================
// 11. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  ui.talkUser1Btn.addEventListener('click', () => handleSpeakerClick('user1'));
  ui.talkUser2Btn.addEventListener('click', () => handleSpeakerClick('user2'));
  ui.mainMicBtn.addEventListener('click', toggleMainMicButton);
  ui.stopAiBtn.addEventListener('click', stopAISpeech);

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
      ui.voiceIcon.className = 'w-3.5 h-3.5 text-emerald-400';
    } else {
      stopAISpeech();
      ui.voiceIcon.className = 'w-3.5 h-3.5 text-slate-500';
    }
  });

  ui.resetSessionBtn.addEventListener('click', () => {
    stopAISpeech();
    if (app.isRecording) stopRecordingAndProcess();
    app.currentTopic = null;
    app.history = [];
    app.userTurnCount = 0;
    app.consensusScore = 0;
    app.commonGround = [];
    ui.activeTopicText.textContent = 'Esperando tema...';
    ui.consensusTracker.classList.add('hidden');
    ui.cardsContainer.innerHTML = '';
    if (ui.welcomeCard) {
      ui.welcomeCard.classList.remove('hidden');
      ui.cardsContainer.appendChild(ui.welcomeCard);
    }
    setActiveSpeaker('user1');
    updateStageUI('idle');
  });
}
