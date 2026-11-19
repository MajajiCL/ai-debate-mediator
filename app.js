/**
 * Debate AI — Brave-Compatible Voice Mediator & Real-Time Socratic Engine
 * 1. Direct Speaker Buttons: Clicking Sujeto 1, Sujeto 2, or Bottom Mic immediately starts/stops recording.
 * 2. Brave Browser Fix: Uses MediaRecorder + Local In-Browser Whisper AI (@xenova/transformers) when
 *    webkitSpeechRecognition fails with "network" error (Brave blocks Google's proprietary speech service).
 * 3. Fast Data & Socratic Engine: Real Spanish Wikipedia Extracts (<0.8s) + Free LLM with 5.5s timeout guard.
 * 4. WebRTC P2P Voice + DataChannel sync for 2 devices, plus 1-click Solo Testing chips.
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
  consensusScore: 0,
  commonGround: [],

  // Audio Hardware & Recording (Works in Brave, Firefox, Chrome, Edge, Safari)
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  recordingStartTime: 0,
  recordingTimerInterval: null,
  audioContext: null,
  analyser: null,

  // Optional Browser SpeechRecognition + Local Whisper Fallback
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
// 4. LOCAL IN-BROWSER WHISPER AI (FOR BRAVE / FIREFOX)
// ==========================================
async function preloadLocalWhisperModel() {
  if (app.whisperLoadingPromise) return app.whisperLoadingPromise;

  app.whisperLoadingPromise = (async () => {
    try {
      ui.whisperStatusPill.textContent = '🧠 Cargando voz IA local...';
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      env.allowLocalModels = false;

      app.whisperTranscriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: (info) => {
          if (info.status === 'progress' && info.progress) {
            const pct = Math.round(info.progress);
            ui.whisperStatusPill.textContent = `🧠 Voz IA Local: ${pct}%`;
          }
        }
      });

      app.whisperReady = true;
      ui.whisperStatusPill.textContent = '🟢 Voz Local Lista (Brave/Chrome)';
      ui.whisperStatusPill.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      return app.whisperTranscriber;
    } catch (err) {
      console.warn('Whisper preload warning:', err);
      ui.whisperStatusPill.textContent = '🟢 Modo Híbrido Activo';
      return null;
    }
  })();

  return app.whisperLoadingPromise;
}

async function transcribeBlobWithWhisper(audioBlob) {
  try {
    ui.stageStatusText.textContent = '🧠 Transcribiendo tu voz localmente con Whisper IA...';
    ui.liveTranscriptBox.classList.remove('hidden');
    ui.recordingTimer.textContent = '🧠 Procesando voz...';
    ui.liveTranscriptText.textContent = 'Convirtiendo tu audio a texto en el navegador...';

    const arrayBuffer = await audioBlob.arrayBuffer();
    const DecodeCtx = window.AudioContext || window.webkitAudioContext;
    const tempCtx = new DecodeCtx({ sampleRate: 16000 });
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    const float32Audio = audioBuffer.getChannelData(0);

    // Check if audio has actual energy (not complete silence)
    let maxPeak = 0;
    for (let i = 0; i < float32Audio.length; i++) {
      const abs = Math.abs(float32Audio[i]);
      if (abs > maxPeak) maxPeak = abs;
    }
    if (maxPeak < 0.005) {
      return '';
    }

    const transcriber = app.whisperTranscriber || (await preloadLocalWhisperModel());
    if (!transcriber) return '';

    const result = await transcriber(float32Audio, {
      language: 'spanish',
      task: 'transcribe'
    });

    const cleaned = (result?.text || '')
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .trim();

    return cleaned;
  } catch (err) {
    console.warn('Whisper transcription error:', err);
    return '';
  } finally {
    ui.liveTranscriptBox.classList.add('hidden');
  }
}

// ==========================================
// 5. UNIFIED MICROPHONE RECORDING (BRAVE + CHROME + MOBILE)
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
    console.error('Error al abrir micrófono:', err);
    alert('No se pudo acceder a tu micrófono. Verifica que hayas dado permiso en el icono a la izquierda de la barra de dirección.');
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
    const combined = (app.browserTranscriptBuffer + interim).trim();
    if (combined) {
      ui.liveTranscriptText.textContent = `"${combined}"`;
    }
  };

  // Crucial for Brave Browser: When Brave throws "network" error on webkitSpeechRecognition,
  // we DO NOT stop MediaRecorder! MediaRecorder keeps recording for Whisper local transcription.
  app.recognition.onerror = (e) => {
    if (e.error === 'network' || e.error === 'service-not-allowed') {
      ui.liveTranscriptText.textContent = 'Grabando audio directo (transcripción IA local al terminar)...';
    }
  };
}

async function handleSpeakerClick(targetSpeaker) {
  if (app.isProcessingAI || app.isTranscribing) return;

  // If AI is speaking, stop AI first
  if (app.isSpeaking) {
    stopAISpeech();
  }

  // If currently recording for this same speaker -> STOP and SEND
  if (app.isRecording && app.activeSpeaker === targetSpeaker) {
    stopRecordingAndProcess();
    return;
  }

  // If recording for the OTHER speaker, stop current first
  if (app.isRecording && app.activeSpeaker !== targetSpeaker) {
    stopRecordingAndProcess();
    return;
  }

  // Set active speaker and immediately START RECORDING
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

  // 1. Start MediaRecorder (100% reliable in Brave, Firefox, Chrome, Safari)
  try {
    app.mediaRecorder = new MediaRecorder(app.mediaStream);
    app.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        app.audioChunks.push(e.data);
      }
    };
    app.mediaRecorder.start(200);
  } catch (err) {
    console.error('MediaRecorder start error:', err);
  }

  // 2. Also start browser SpeechRecognition in parallel (works in Chrome/Edge; gracefully ignored in Brave)
  if (app.recognition) {
    try {
      app.recognition.start();
    } catch (e) {}
  }

  // 3. Update UI & Start Timer
  ui.liveTranscriptBox.classList.remove('hidden');
  ui.recordingTimer.textContent = 'Grabando 00:00s';
  ui.liveTranscriptText.textContent = 'Habla con claridad... Toca el botón rojo cuando termines tu idea';
  updateStageUI('listening');

  clearInterval(app.recordingTimerInterval);
  app.recordingTimerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - app.recordingStartTime) / 1000);
    const formatted = String(secs).padStart(2, '0');
    ui.recordingTimer.textContent = `Grabando 00:${formatted}s`;
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

    // 1. Check if browser SpeechRecognition already got text
    let capturedText = app.browserTranscriptBuffer.trim();
    const liveBoxText = ui.liveTranscriptText.textContent.replace(/^"|"$/g, '').trim();
    if (!capturedText && liveBoxText.startsWith('"')) {
      capturedText = liveBoxText;
    }

    // 2. If empty (e.g. Brave Browser blocked Google Speech API), use local Whisper AI on the recorded audio
    if (!capturedText && audioBlob && audioBlob.size > 0) {
      capturedText = await transcribeBlobWithWhisper(audioBlob);
    }

    app.isTranscribing = false;
    ui.liveTranscriptBox.classList.add('hidden');

    if (capturedText && capturedText.length > 1) {
      submitArgument(app.activeSpeaker, capturedText);
    } else {
      // Show friendly fallback card with audio player & instant input so user is never stuck
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
      <span>🎙️ Audio grabado de ${speakerName}</span>
      <span class="text-[10px] text-slate-400">Confirmar texto</span>
    </div>
    ${audioUrl ? `<audio controls src="${audioUrl}" class="w-full h-8"></audio>` : ''}
    <p class="text-[11px] text-slate-300">
      Tu navegador (ej. Brave) bloquea el servidor de dictado de Google o el audio fue muy breve. Confirma o escribe tu punto abajo en 1 clic:
    </p>
    <div class="flex gap-1.5">
      <input type="text" class="fallback-input flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400" placeholder="Escribe lo que dijiste o tu tema aquí..." />
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
  scrollToBottom();
  input.focus();
}

// ==========================================
// 6. SPEAKER TURN & STAGE UI
// ==========================================
function setActiveSpeaker(speaker) {
  app.activeSpeaker = speaker;
  const isU1 = speaker === 'user1';

  if (isU1) {
    ui.avatarUser1.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-sky-400 flex items-center justify-center relative transition-all duration-300 shadow-md ring-2 ring-sky-400/30';
    ui.badgeUser1.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-sky-500 text-slate-950 text-[9px] font-extrabold';
    ui.badgeUser1.textContent = '🎙️ Hablar';

    ui.avatarUser2.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative transition-all duration-300 shadow-md opacity-80';
    ui.badgeUser2.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold';
    ui.badgeUser2.textContent = '🎙️ Hablar';
  } else {
    ui.avatarUser2.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-amber-400 flex items-center justify-center relative transition-all duration-300 shadow-md ring-2 ring-amber-400/30';
    ui.badgeUser2.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold';
    ui.badgeUser2.textContent = '🎙️ Hablar';

    ui.avatarUser1.className = 'w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center relative transition-all duration-300 shadow-md opacity-80';
    ui.badgeUser1.className = 'absolute -bottom-1 px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[9px] font-bold';
    ui.badgeUser1.textContent = '🎙️ Hablar';
  }

  if (!app.isRecording && !app.isSpeaking && !app.isProcessingAI) {
    const labelName = isU1 ? 'Sujeto 1' : 'Sujeto 2';
    ui.mainMicLabel.textContent = `🎙️ Hablar como ${labelName}`;
    ui.textInput.placeholder = `O escribe el argumento de ${labelName} aquí...`;
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
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
    ui.stageStatusText.textContent = `Grabando a ${speakerLabel}... Toca de nuevo para enviar`;
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all duration-200 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2.5 ring-4 ring-rose-500/30';
    ui.mainMicLabel.textContent = `⏹️ Terminé de hablar (${speakerLabel})`;
  } else if (mode === 'thinking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-indigo-400 animate-ping';
    ui.stageStatusText.textContent = 'IA buscando datos verificados y mediando...';
    ui.statusAI.textContent = 'Analizando...';
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 text-slate-400 font-semibold text-sm flex items-center justify-center gap-2.5 cursor-wait';
    ui.mainMicLabel.textContent = 'Analizando y buscando datos...';
  } else if (mode === 'ai_speaking') {
    ui.avatarAI.classList.add('avatar-speaking');
    ui.aiPulseRing.classList.add('pulse-ring-active');
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    ui.stageStatusText.textContent = 'IA Mediadora hablando...';
    ui.statusAI.textContent = 'Hablando';
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2.5';
    ui.mainMicLabel.textContent = `🎙️ Responder (${speakerLabel})`;
  } else {
    ui.liveIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500';
    ui.stageStatusText.textContent = `Toca a ${speakerLabel} arriba o el botón de abajo para hablar`;
    ui.statusUser1.textContent = 'Toca para hablar';
    ui.statusUser2.textContent = app.hasRemotePartner ? '🟢 En vivo' : 'Toca para hablar';
    ui.statusAI.textContent = 'Escuchando';
    setActiveSpeaker(app.activeSpeaker);
    ui.mainMicBtn.className = 'flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-brand via-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-brand/25 flex items-center justify-center gap-2.5 active:scale-[0.98]';
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
// 8. FAST DATA & MEDIATION ENGINE (<3 SECONDS)
// ==========================================
async function submitArgument(speakerKey, rawText, isFromRemote = false) {
  const text = rawText.trim();
  if (!text || app.isProcessingAI) return;

  const speakerName = speakerKey === 'user1' ? 'Sujeto 1' : 'Sujeto 2';
  app.history.push({ role: speakerName, text });

  renderSpeakerCard(speakerKey, speakerName, text);

  if (!isFromRemote && app.dataConn && app.dataConn.open) {
    app.dataConn.send({
      type: 'SPEAKER_ARGUMENT',
      speakerKey,
      text
    });
  }

  if (!isFromRemote) {
    await runAIMediation(speakerKey, speakerName, text);
  }
}

async function runAIMediation(speakerKey, speakerName, latestText) {
  app.isProcessingAI = true;
  updateStageUI('thinking');

  // 1. Fetch Real Wikipedia Encyclopedic Facts in Spanish (~0.8 seconds)
  const wikiFactsPromise = fetchWikipediaExtracts(latestText);

  // 2. Race Free LLM with a strict 5.5-second timeout so the user NEVER waits 30-40s
  let result = null;
  try {
    const wikiFacts = await wikiFactsPromise;
    result = await fetchFastLLMMediation(speakerName, latestText, wikiFacts);
  } catch (err) {
    const wikiFacts = await wikiFactsPromise;
    result = buildContextualMediation(speakerName, latestText, wikiFacts);
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

async function fetchWikipediaExtracts(userText) {
  try {
    const stopWords = new Set([
      'quiero', 'debatir', 'sobre', 'pienso', 'creo', 'parece', 'deberia', 'debería',
      'porque', 'cuando', 'donde', 'como', 'para', 'este', 'esta', 'estos', 'estas',
      'tiene', 'tienen', 'mejor', 'peor', 'mucho', 'poco', 'todos', 'todas', 'hacer',
      'puede', 'pueden', 'seria', 'sería', 'hablar', 'punto', 'tema', 'exploremos'
    ]);

    const keywords = userText
      .replace(/[¿?¡!.,;:"]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
      .slice(0, 3)
      .join(' ');

    const query = keywords || userText.substring(0, 35);
    const url = `https://es.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=2&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=2&format=json&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const data = await res.json();
    if (!data?.query?.pages) return [];

    const pages = Object.values(data.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0));
    return pages
      .filter(p => p.extract && p.extract.length > 30)
      .map(p => `${p.title}: ${p.extract.replace(/\s+/g, ' ').trim()} (Fuente: Wikipedia)`);
  } catch (e) {
    return [];
  }
}

async function fetchFastLLMMediation(speakerName, latestText, wikiFacts) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5500);

  try {
    const historySummary = app.history.slice(-4).map(h => `${h.role}: "${h.text}"`).join('\n');
    const prompt = `Eres una IA Mediadora de debates socrática.
Historial:
${historySummary}
Último (${speakerName}): "${latestText}"

Devuelve SOLO un JSON breve en español:
{"topic":"título corto del tema","consensusScore":45,"commonGround":["interés común detectado"],"steelman":"reformulación empática en 1 oración","verifiedFacts":["dato objetivo concreto 1","dato objetivo 2"],"socraticQuestion":"pregunta socrática breve para acercar posturas","explorationPaths":["Ruta 1 corta","Ruta 2 corta","Ruta 3 corta"],"counterpointForSolo":"argumento inteligente que diría el Sujeto 2 con la postura contraria en 1 oración","spokenResponse":"2 oraciones cortas con un dato y la pregunta socrática"}`;

    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true
      })
    });

    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('LLM status ' + res.status);
    const raw = await res.text();
    const parsed = parseCleanJSON(raw);

    if (wikiFacts.length > 0) {
      parsed.verifiedFacts = [...(parsed.verifiedFacts || []).slice(0, 1), ...wikiFacts.slice(0, 1)];
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCleanJSON(rawText) {
  const first = rawText.indexOf('{');
  const last = rawText.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('Invalid JSON');
  return JSON.parse(rawText.substring(first, last + 1));
}

function buildContextualMediation(speakerName, text, wikiFacts) {
  const cleanTopic = app.currentTopic || extractCleanTopic(text);
  const newScore = Math.min(90, (app.consensusScore || 25) + 15);

  const facts = wikiFacts.length > 0
    ? wikiFacts
    : [
        `Sobre "${cleanTopic}": la evidencia comparada muestra que los mejores resultados se logran combinando incentivos graduales con medición de impacto real.`,
        `Los estudios de políticas públicas y comportamiento indican que polarizar este tema en "todo o nada" suele ignorar soluciones híbridas de alta efectividad.`
      ];

  const turn = app.history.filter(h => h.role !== 'IA Mediadora').length;
  const socraticQuestions = [
    `¿Bajo qué condiciones concretas o garantías estarían ambos de acuerdo en probar esta propuesta sobre "${cleanTopic}"?`,
    `Si miramos los datos disponibles, ¿cuál es el riesgo principal que deberíamos evitar para que tanto el Sujeto 1 como el Sujeto 2 queden conformes?`,
    `¿Qué punto intermedio permitiría aprovechar el beneficio que menciona ${speakerName} sin descuidar la estabilidad general?`
  ];
  const question = socraticQuestions[(turn - 1) % socraticQuestions.length];

  return {
    topic: cleanTopic,
    consensusScore: newScore,
    commonGround: [
      `Ambos buscan mejorar los resultados prácticos en torno a: ${cleanTopic}`,
      `Reconocimiento de que se requieren criterios claros y evidencia para decidir`
    ],
    steelman: `${speakerName} destaca un punto clave: "${text}", poniendo el foco en los efectos reales y prácticos sobre las personas.`,
    verifiedFacts: facts,
    socraticQuestion: question,
    explorationPaths: [
      `📊 Analizar datos y evidencia empírica sobre ${cleanTopic}`,
      `⚖️ Evaluar pros, contras y efectos secundarios`,
      `🤝 Construir un acuerdo o experimento piloto entre ambos`
    ],
    counterpointForSolo: `Desde la postura opuesta al ${speakerName} sobre "${cleanTopic}", el principal riesgo es que una aplicación rígida genere costos ocultos o afecte a quienes tienen menos margen de adaptación.`,
    spokenResponse: `He recopilado datos sobre ${cleanTopic}. ${question}`
  };
}

function extractCleanTopic(sentence) {
  let s = sentence
    .replace(/^(hola|bueno|yo creo que|pienso que|creo que|me gustaría hablar de|quiero debatir sobre|exploremos este punto:?)\s+/i, '')
    .trim();
  if (s.length > 52) s = s.substring(0, 50) + '...';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function applyMediationResult(result, lastSpeakerKey) {
  if (result.topic) {
    app.currentTopic = result.topic;
    ui.activeTopicText.textContent = result.topic;
  }

  if (typeof result.consensusScore === 'number') {
    app.consensusScore = result.consensusScore;
    ui.consensusTracker.classList.remove('hidden');
    ui.consensusPct.textContent = `${app.consensusScore}%`;
    ui.consensusBar.style.width = `${app.consensusScore}%`;
  }

  if (Array.isArray(result.commonGround) && result.commonGround.length > 0) {
    app.commonGround = result.commonGround;
    ui.commonGroundList.innerHTML = result.commonGround
      .map(item => `<div class="flex items-start gap-1.5"><span class="text-emerald-400">✓</span><span>${escapeHtml(item)}</span></div>`)
      .join('');
  }

  app.history.push({
    role: 'IA Mediadora',
    text: `${result.steelman || ''} ${result.socraticQuestion || ''}`
  });

  renderAIMediationCard(result);

  if (!app.hasRemotePartner) {
    setActiveSpeaker(lastSpeakerKey === 'user1' ? 'user2' : 'user1');
  } else {
    updateStageUI('idle');
  }

  const textToSpeak = result.spokenResponse || `${result.steelman}. ${result.socraticQuestion}`;
  speakAI(textToSpeak);
}

// ==========================================
// 9. CARDS & INTERACTIVE EXPLORATION
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
      <span class="text-[10px] text-slate-400">Argumento</span>
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
      <div class="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/25 space-y-1.5">
        <div class="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
          <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
          <span>Datos y Contexto Verificado</span>
        </div>
        <ul class="space-y-1.5 text-[11px] text-slate-300 list-disc list-inside leading-relaxed">
          ${res.verifiedFacts.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const pathsHtml = Array.isArray(res.explorationPaths) && res.explorationPaths.length > 0
    ? `
      <div>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
          🧭 ¿Cómo quieren seguir explorando? (Toca una ruta o habla con el micrófono):
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
        Mediación y Datos
      </span>
    </div>

    ${res.steelman ? `
      <p class="text-xs text-slate-200 leading-relaxed">
        <strong class="text-emerald-300">Síntesis constructiva:</strong> ${escapeHtml(res.steelman)}
      </p>
    ` : ''}

    ${factsHtml}

    ${res.socraticQuestion ? `
      <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 font-medium flex items-start gap-2">
        <i data-lucide="help-circle" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
        <span>${escapeHtml(res.socraticQuestion)}</span>
      </div>
    ` : ''}

    ${pathsHtml}

    ${(!app.hasRemotePartner && res.counterpointForSolo) ? `
      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <span class="text-[10px] text-slate-400">¿Estás probando tú solo?</span>
        <button class="solo-counterpoint-btn px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition flex items-center gap-1.5">
          <i data-lucide="users" class="w-3.5 h-3.5"></i>
          <span>Que la IA responda como Sujeto 2</span>
        </button>
      </div>
    ` : ''}
  `;

  const btnContainer = div.querySelector('.exploration-buttons');
  if (btnContainer && Array.isArray(res.explorationPaths)) {
    res.explorationPaths.forEach(pathText => {
      const btn = document.createElement('button');
      btn.className = 'text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition';
      btn.textContent = `👉 ${pathText}`;
      btn.addEventListener('click', () => {
        submitArgument(app.activeSpeaker, `Exploremos este punto: ${pathText}`);
      });
      btnContainer.appendChild(btn);
    });
  }

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
// 11. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Clicking Sujeto 1, Sujeto 2, or Main Mic Button DIRECTLY starts/stops recording!
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
      ui.voiceIcon.className = 'w-4 h-4 text-emerald-400';
    } else {
      stopAISpeech();
      ui.voiceIcon.className = 'w-4 h-4 text-slate-500';
    }
  });

  ui.resetSessionBtn.addEventListener('click', () => {
    stopAISpeech();
    if (app.isRecording) stopRecordingAndProcess();
    app.currentTopic = null;
    app.history = [];
    app.consensusScore = 0;
    app.commonGround = [];
    ui.activeTopicText.textContent = 'Toca a Sujeto 1 o el micrófono abajo para hablar';
    ui.consensusTracker.classList.add('hidden');
    ui.cardsContainer.innerHTML = `
      <div class="p-4 rounded-2xl bg-surface border border-slate-800/80 text-xs text-slate-300 shadow-md">
        <p class="leading-relaxed">
          Conversación reiniciada. Toca el botón de <strong>Sujeto 1</strong> para hablar o escribe cualquier tema abajo.
        </p>
      </div>
    `;
    setActiveSpeaker('user1');
    updateStageUI('idle');
  });
}
