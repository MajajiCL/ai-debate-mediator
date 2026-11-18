/**
 * AI Debate Mediator — Common Ground Engine & P2P Voice Room
 * 100% Free Open Web Architecture (PeerJS WebRTC, Web Audio API, Wikipedia API, Local Socratic Heuristics)
 */

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
const state = {
  activeScenarioId: 'scenario_ai',
  currentStepIndex: 0,
  isPlaying: false,
  playInterval: null,
  voiceEnabled: true,
  geminiApiKey: localStorage.getItem('gemini_api_key') || '',
  selectedVoice: null,
  
  // Microphone & Audio Stream
  localAudioStream: null,
  audioContext: null,
  analyserNode: null,
  isMicMuted: false,
  micPermissionGranted: false,
  
  // P2P Room (PeerJS)
  peer: null,
  currentCall: null,
  roomCode: null,
  isHost: false,
  
  // Debate Metrics
  consensusScore: 0,
  tensionLevel: 'Baja',
  
  // Data Store
  nodes: [],
  links: [],
  facts: [],
  selectedNode: null,
  
  // Voice Synthesis Status
  isSpeaking: false
};

// ==========================================
// 2. PRESET SCENARIOS DATA
// ==========================================
const SCENARIOS = {
  scenario_ai: {
    title: 'IA y Empleo: ¿Destrucción o Evolución Laboral?',
    description: 'Debate sobre el impacto de la automatización por IA en el mercado laboral y la reconversión productiva.',
    debaterA: {
      name: 'Dr. Julián Ramos',
      role: 'Economista de Innovación Tecnológica',
      stance: 'La IA impulsará una ola histórica de productividad, eliminando tareas repetitivas y creando industrias de alto valor.'
    },
    debaterB: {
      name: 'Dra. Elena Silva',
      role: 'Socióloga e Investigadora Laboral',
      stance: 'La velocidad del reemplazo cognitivo sobrepasará los ciclos de capacitación, provocando precarización y polarización social.'
    },
    steps: [
      {
        speaker: 'A',
        quote: 'Históricamente, toda revolución tecnológica —desde el vapor hasta el software— destruyó tareas, pero generó más empleos netos y mayor bienestar material.',
        label: 'Creación neta histórica de empleo',
        category: 'debaterA',
        steelmanning: 'La tecnología eleva el techo productivo general; el progreso histórico demuestra que surgen profesiones antes inconcebibles.'
      },
      {
        speaker: 'B',
        quote: 'La diferencia crucial hoy es la velocidad exponencial. La IA no solo automatiza esfuerzo físico, sino razonamiento humano antes de que la sociedad pueda reaccionar.',
        label: 'Velocidad de disrupción cognitiva',
        category: 'debaterB',
        steelmanning: 'A diferencia de transiciones previas que duraron décadas, la IA avanza en meses, comprimiendo el tiempo disponible para reconvertir a millones de trabajadores.'
      },
      {
        speaker: 'FACT',
        quote: 'Estudio FMI & WEF: Se proyecta que el 40% del empleo mundial está expuesto a la IA; no obstante, el 60% en economías avanzadas puede complementar al trabajador elevando salarios si hay capacitación.',
        label: 'Estudio FMI: 40% exposición vs complementariedad',
        category: 'factcheck',
        source: 'FMI World Economic Outlook & WEF Future of Jobs',
        steelmanning: 'El riesgo real no es la extinción del trabajo, sino una brecha distributiva entre quienes logren complementarse con la IA y quienes queden rezagados.'
      },
      {
        speaker: 'AI',
        quote: 'Observo un punto de encuentro velado: ambos reconocen que la IA desatará una ola de productividad masiva. El conflicto real no es si la tecnología es positiva o negativa, sino cómo gestionar la velocidad de la transición sin desamparar a nadie.',
        label: 'Foco común: Velocidad de transición y contención',
        category: 'consensus',
        steelmanning: 'El objetivo común es maximizar los frutos de la productividad asegurando que los costes de adaptación sean asumidos colectivamente.'
      },
      {
        speaker: 'A',
        quote: 'Concuerdo en que no podemos dejar a la gente a su suerte. Las empresas tecnológicas y el Estado deben coinvertir en fondos masivos de reconversión continua.',
        label: 'Inversión en reconversión y re-skilling',
        category: 'debaterA',
        steelmanning: 'El desarrollo tecnológico debe ir aparejado de un compromiso fiscal y corporativo de capacitación permanente.'
      },
      {
        speaker: 'B',
        quote: 'Si existen garantías vinculantes de que los incrementos de productividad financiarán una red de transición y reducción de jornada, la adopción de IA es viable.',
        label: 'Productividad reinvertida en bienestar',
        category: 'debaterB',
        steelmanning: 'La automatización es aceptable siempre que el dividendo de la productividad se traduzca en calidad de vida y no en precariedad.'
      },
      {
        speaker: 'CONSENSUS',
        quote: 'Pacto de Transición Justa: Fomentar el despliegue de IA condicionando sus beneficios fiscales a la inversión en capital humano y fondos de transición laboral.',
        label: 'Pacto de Transición Tecnológica Justa',
        category: 'consensus',
        steelmanning: 'Punto de máxima convergencia: tecnología de vanguardia protegida por un estado de bienestar adaptado a la era digital.'
      }
    ]
  },

  scenario_energy: {
    title: 'Transición Energética: ¿Nuclear como base o 100% Renovables?',
    description: 'Controversia técnica y medioambiental sobre el mix de descarbonización energética global.',
    debaterA: {
      name: 'Ing. Mateo Cruz',
      role: 'Especialista en Redes Eléctricas y Nuclear',
      stance: 'La energía nuclear proporciona potencia de carga base firme, libre de carbono y con menor uso de suelo que cualquier otra fuente.'
    },
    debaterB: {
      name: 'Lic. Clara Montes',
      role: 'Analista de Energía Renovable y Clima',
      stance: 'Las renovables con almacenamiento y redes inteligentes son más rápidas de desplegar, más económicas y carecen de riesgos de proliferación o residuos.'
    },
    steps: [
      {
        speaker: 'A',
        quote: 'La intermitencia del viento y el sol obliga a respaldar con gas o requerir baterías gigantescas que el planeta hoy no tiene capacidad minera de producir.',
        label: 'Intermitencia y límites del almacenamiento',
        category: 'debaterA',
        steelmanning: 'Garantizar el suministro industrial 24/7 sin emitir CO2 requiere fuentes firmes no dependientes del clima.'
      },
      {
        speaker: 'B',
        quote: 'Construir reactores nucleares toma entre 10 y 15 años y cuesta miles de millones; la crisis climática exige reducciones drásticas antes de 2035.',
        label: 'Costos y plazos de construcción nuclear',
        category: 'debaterB',
        steelmanning: 'Cada dólar invertido en nuclear hoy reduce menos emisiones a corto plazo que si se invierte en solar y eólica inmediatas.'
      },
      {
        speaker: 'FACT',
        quote: 'IPCC & Agencia Internacional de Energía (AIE): Las emisiones en ciclo de vida de la nuclear (12g CO2/kWh) son idénticas a la eólica marina y cuatro veces menores que la solar fotovoltaica.',
        label: 'IPCC: Emisiones de ciclo de vida equivalentes',
        category: 'factcheck',
        source: 'IPCC Working Group III - Annex III Matrix',
        steelmanning: 'Ambas opciones son herramientas legítimas de descarbonización profunda desde el prisma de gases de efecto invernadero.'
      },
      {
        speaker: 'AI',
        quote: 'Ambas partes comparten la urgencia de abandonar los combustibles fósiles cuanto antes. La discrepancia radica en el horizonte temporal: velocidad urgente vs. estabilidad estructural de la red.',
        label: 'Prioridad compartida: Descarbonización total',
        category: 'consensus',
        steelmanning: 'El objetivo primordial es desmantelar el carbón y el gas; discutir renovables vs nuclear no debe prolongar el uso de fósiles.'
      },
      {
        speaker: 'CONSENSUS',
        quote: 'Estrategia Híbrida: Despliegue masivo inmediato de solar y eólica a corto plazo, complementado con reactores modulares (SMR) y extensión de vida útil para la industria pesada.',
        label: 'Matriz Descarbonizada Complementaria',
        category: 'consensus',
        steelmanning: 'Maximizar renovables hoy mientras se asegura base nuclear para contingencias y procesos industriales de alta demanda.'
      }
    ]
  },

  scenario_privacy: {
    title: 'Privacidad Digital vs. Seguridad Ciudadana',
    description: 'Equilibrio entre videovigilancia biométrica con IA en espacios públicos y derechos fundamentales.',
    debaterA: {
      name: 'Carlos Valenzuela',
      role: 'Consultor de Seguridad y Prevención',
      stance: 'El reconocimiento facial y la analítica predictiva en espacios públicos previenen delitos graves y salvan vidas inocentes.'
    },
    debaterB: {
      name: 'Sofía Arancibia',
      role: 'Abogada de Derechos Digitales',
      stance: 'La vigilancia masiva erradica la presunción de inocencia, genera sesgos discriminatorios y consolida un estado panóptico.'
    },
    steps: [
      {
        speaker: 'A',
        quote: 'Un sistema biométrico en tiempo real puede ubicar a un niño secuestrado o un prófugo peligroso en minutos en terminales y estaciones.',
        label: 'Protección ciudadana y respuesta crítica',
        category: 'debaterA',
        steelmanning: 'La tecnología debe salvaguardar la vida y la integridad física frente a amenazas urgentes en espacios de alto tránsito.'
      },
      {
        speaker: 'B',
        quote: 'Los falsos positivos arrestan injustamente a minorías y crean un efecto disuasorio en el derecho a reunión pacífica y protesta ciudadana.',
        label: 'Riesgo de falsos positivos y censura civil',
        category: 'debaterB',
        steelmanning: 'Un sistema propenso a sesgos que opera sin control judicial previo degrada las libertades democráticas fundamentales.'
      },
      {
        speaker: 'FACT',
        quote: 'NIST (National Institute of Standards and Technology): Los algoritmos de reconocimiento facial modernos alcanzan un 99.8% de precisión en condiciones óptimas, pero la tasa de error sube hasta un 15% con iluminación deficiente o baja resolución.',
        label: 'NIST: Precisión condicional y variación de error',
        category: 'factcheck',
        source: 'NIST Face Recognition Vendor Test (FRVT)',
        steelmanning: 'La tecnología no es infalible; requiere condiciones técnicas estrictas y supervisión humana para evitar arrestos espurios.'
      },
      {
        speaker: 'AI',
        quote: 'Ninguno de ustedes propone impunidad para el crimen ni un estado policial sin frenos. El consenso requiere definir umbrales de activación muy estrictos.',
        label: 'Regla de Oro: Proporcionalidad y Control Judicial',
        category: 'consensus',
        steelmanning: 'Cualquier tecnología de vigilancia debe estar supeditada a orden judicial previa y auditoría de código independiente.'
      },
      {
        speaker: 'CONSENSUS',
        quote: 'Protocolo de Garantías Democráticas: Prohibición de vigilancia masiva indiscriminada, permitiendo reconocimiento biométrico únicamente bajo mandato judicial para delitos mayores, con auditoría algorítmica obligatoria.',
        label: 'Marco de Vigilancia Restringida y Auditada',
        category: 'consensus',
        steelmanning: 'Uso estrictamente justificado, proporcional y fiscalizado por tribunales, protegiendo tanto la seguridad como la libertad individual.'
      }
    ]
  },

  custom: {
    title: 'Debate Libre en Vivo (P2P o Local)',
    description: 'Conéctate por voz P2P con tu compañero o ingresa argumentos con tu micrófono. La IA mediará sin costo alguno.',
    debaterA: {
      name: 'Sujeto 1',
      role: 'Postura 1',
      stance: 'Ingresa o dicta tus argumentos a la izquierda.'
    },
    debaterB: {
      name: 'Sujeto 2',
      role: 'Postura 2',
      stance: 'Ingresa o dicta tus argumentos a la izquierda.'
    },
    steps: []
  }
};

// ==========================================
// 3. CANVAS PHYSICS GRAPH ENGINE
// ==========================================
class GraphEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.links = [];
    this.particles = [];
    
    // Camera Transform
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.draggedNode = null;
    this.hoveredNode = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupInteractions();
    this.startLoop();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(dpr, dpr);
  }

  setupInteractions() {
    const toWorld = (px, py) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (px - rect.left - this.width / 2 - this.camera.x) / this.camera.zoom;
      const y = (py - rect.top - this.height / 2 - this.camera.y) / this.camera.zoom;
      return { x, y };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const clicked = this.getNodeAt(x, y);

      if (clicked) {
        this.draggedNode = clicked;
        clicked.pinned = true;
        selectNode(clicked);
      } else {
        this.isDragging = true;
        this.dragStart = { x: e.clientX - this.camera.x, y: e.clientY - this.camera.y };
      }
    });

    window.addEventListener('mousemove', (e) => {
      const { x, y } = toWorld(e.clientX, e.clientY);
      
      if (this.draggedNode) {
        this.draggedNode.x = x;
        this.draggedNode.y = y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
      } else if (this.isDragging) {
        this.camera.x = e.clientX - this.dragStart.x;
        this.camera.y = e.clientY - this.dragStart.y;
      } else {
        this.hoveredNode = this.getNodeAt(x, y);
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.draggedNode) {
        this.draggedNode.pinned = false;
        this.draggedNode = null;
      }
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.camera.zoom = Math.max(0.3, Math.min(2.5, this.camera.zoom * zoomFactor));
    });
  }

  getNodeAt(x, y) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (Math.hypot(dx, dy) <= n.radius) {
        return n;
      }
    }
    return null;
  }

  resetCamera() {
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  addNode(data) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 110 + Math.random() * 80;
    
    let initialX = Math.cos(angle) * dist;
    let initialY = Math.sin(angle) * dist;

    if (data.category === 'debaterA') initialX = -180 + (Math.random() - 0.5) * 80;
    if (data.category === 'debaterB') initialX = 180 + (Math.random() - 0.5) * 80;
    if (data.category === 'consensus') initialX = (Math.random() - 0.5) * 40;
    if (data.category === 'factcheck') initialY = -140 + (Math.random() - 0.5) * 60;

    const node = {
      id: data.id || `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      label: data.label,
      quote: data.quote,
      category: data.category,
      speaker: data.speaker,
      steelmanning: data.steelmanning || '',
      source: data.source || '',
      x: initialX,
      y: initialY,
      vx: 0,
      vy: 0,
      radius: data.category === 'consensus' ? 42 : 36,
      created: Date.now()
    };

    this.nodes.push(node);
    return node;
  }

  addLink(sourceId, targetId, type = 'argues') {
    const source = this.nodes.find(n => n.id === sourceId);
    const target = this.nodes.find(n => n.id === targetId);
    if (!source || !target) return;

    this.links.push({
      source,
      target,
      type,
      length: type === 'consensus' ? 120 : 160
    });
  }

  clear() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.resetCamera();
  }

  updatePhysics() {
    const kRepel = 7000;
    const kSpring = 0.05;
    const kCenter = 0.015;
    const damping = 0.85;

    // Repulsion
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 380) {
          const force = kRepel / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
          if (!b.pinned) { b.vx += fx; b.vy += fy; }
        }
      }
    }

    // Springs (Links)
    for (const link of this.links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.hypot(dx, dy) || 1;
      const displacement = dist - link.length;
      const force = displacement * kSpring;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!link.source.pinned) { link.source.vx += fx; link.source.vy += fy; }
      if (!link.target.pinned) { link.target.vx -= fx; link.target.vy -= fy; }
    }

    // Centering Force & Integration
    for (const n of this.nodes) {
      if (!n.pinned) {
        n.vx -= n.x * kCenter;
        n.vy -= n.y * kCenter;
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    // Spawn Energy Particles along consensus links
    if (Math.random() < 0.12) {
      const consensusLinks = this.links.filter(l => l.type === 'consensus');
      if (consensusLinks.length > 0) {
        const l = consensusLinks[Math.floor(Math.random() * consensusLinks.length)];
        this.particles.push({
          link: l,
          progress: 0,
          speed: 0.02 + Math.random() * 0.02
        });
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;
      if (p.progress >= 1) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.ctx.save();
    this.ctx.translate(this.width / 2 + this.camera.x, this.height / 2 + this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // Grid dots
    this.drawGrid();

    // Links
    for (const link of this.links) {
      this.ctx.beginPath();
      this.ctx.moveTo(link.source.x, link.source.y);
      this.ctx.lineTo(link.target.x, link.target.y);
      
      if (link.type === 'consensus') {
        this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([6, 3]);
      } else if (link.type === 'fact') {
        this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([4, 4]);
      } else {
        this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([]);
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Particles
    for (const p of this.particles) {
      const sx = p.link.source.x;
      const sy = p.link.source.y;
      const tx = p.link.target.x;
      const ty = p.link.target.y;
      const px = sx + (tx - sx) * p.progress;
      const py = sy + (ty - sy) * p.progress;

      this.ctx.beginPath();
      this.ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      this.ctx.fillStyle = '#34d399';
      this.ctx.shadowColor = '#10b981';
      this.ctx.shadowBlur = 8;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    // Nodes
    for (const node of this.nodes) {
      this.drawNode(node);
    }

    this.ctx.restore();
  }

  drawGrid() {
    const size = 60;
    const viewLeft = -this.width / (2 * this.camera.zoom) - this.camera.x / this.camera.zoom;
    const viewTop = -this.height / (2 * this.camera.zoom) - this.camera.y / this.camera.zoom;
    const viewRight = viewLeft + this.width / this.camera.zoom;
    const viewBottom = viewTop + this.height / this.camera.zoom;

    const startX = Math.floor(viewLeft / size) * size;
    const startY = Math.floor(viewTop / size) * size;

    this.ctx.fillStyle = 'rgba(51, 65, 85, 0.15)';
    for (let x = startX; x <= viewRight; x += size) {
      for (let y = startY; y <= viewBottom; y += size) {
        this.ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  drawNode(n) {
    const isSelected = state.selectedNode && state.selectedNode.id === n.id;
    const isHovered = this.hoveredNode && this.hoveredNode.id === n.id;

    let fillColor = '#1e293b';
    let strokeColor = '#475569';
    let glowColor = 'transparent';
    let iconLetter = 'S1';

    if (n.category === 'debaterA') {
      fillColor = '#1e3a8a';
      strokeColor = '#3b82f6';
      glowColor = 'rgba(59, 130, 246, 0.4)';
      iconLetter = 'S1';
    } else if (n.category === 'debaterB') {
      fillColor = '#78350f';
      strokeColor = '#f59e0b';
      glowColor = 'rgba(245, 158, 11, 0.4)';
      iconLetter = 'S2';
    } else if (n.category === 'consensus') {
      fillColor = '#064e3b';
      strokeColor = '#10b981';
      glowColor = 'rgba(16, 185, 129, 0.6)';
      iconLetter = '🤝';
    } else if (n.category === 'factcheck') {
      fillColor = '#164e63';
      strokeColor = '#06b6d4';
      glowColor = 'rgba(6, 182, 212, 0.5)';
      iconLetter = '✓';
    }

    if (isSelected || isHovered || n.category === 'consensus') {
      this.ctx.shadowColor = glowColor;
      this.ctx.shadowBlur = isSelected ? 22 : 14;
    } else {
      this.ctx.shadowBlur = 0;
    }

    this.ctx.beginPath();
    this.ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();

    this.ctx.lineWidth = isSelected ? 3.5 : 2;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Node icon
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(iconLetter, n.x, n.y);

    // Label below
    this.ctx.fillStyle = '#e2e8f0';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const maxLineLength = 18;
    const words = n.label.split(' ');
    let lines = [];
    let curLine = '';

    for (const w of words) {
      if ((curLine + ' ' + w).trim().length <= maxLineLength) {
        curLine = (curLine + ' ' + w).trim();
      } else {
        lines.push(curLine);
        curLine = w;
      }
    }
    if (curLine) lines.push(curLine);
    lines = lines.slice(0, 2);

    lines.forEach((line, idx) => {
      this.ctx.fillText(line, n.x, n.y + n.radius + 6 + idx * 13);
    });
  }

  startLoop() {
    const loop = () => {
      this.updatePhysics();
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ==========================================
// 4. MICROPHONE PERMISSION & LIVE VU-METER
// ==========================================
let graphEngine = null;

async function requestMicrophonePermission() {
  const btnText = document.getElementById('mic-perm-btn-text');
  const statusPill = document.getElementById('mic-status-pill');
  
  try {
    btnText.textContent = 'Solicitando permiso...';
    
    // Explicit browser prompt for microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.localAudioStream = stream;
    state.micPermissionGranted = true;

    // Setup Web Audio Analyser
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyserNode = state.audioContext.createAnalyser();
    state.analyserNode.fftSize = 256;
    source.connect(state.analyserNode);

    statusPill.textContent = '🟢 Conectado';
    statusPill.className = 'text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-950 text-emerald-400 border border-emerald-800';
    btnText.textContent = 'Micrófono Activo';
    document.getElementById('request-mic-permission-btn').className = 'w-full py-1.5 px-3 rounded-lg bg-emerald-900/40 text-emerald-300 text-xs font-medium border border-emerald-700/60 flex items-center justify-center gap-2';

    // Start live VU-meter animation loop
    startVUMeter();

    addStreamItem({
      speaker: 'AI',
      speakerLabel: 'Sistema de Audio',
      text: '¡Micrófono verificado con éxito! Puedes usar el botón de dictar o unirte a una sala de voz P2P.',
      badge: 'Audio Listo'
    });

    return stream;
  } catch (err) {
    console.error('Error al solicitar micrófono:', err);
    statusPill.textContent = '❌ Bloqueado';
    statusPill.className = 'text-[10px] px-2 py-0.5 rounded font-mono bg-rose-950 text-rose-400 border border-rose-800';
    btnText.textContent = 'Reintentar Permiso de Micrófono';
    
    alert('Permiso de micrófono no otorgado.\n\nPor favor, haz clic en el icono del candado en la barra de direcciones de tu navegador y selecciona "Permitir" en Micrófono para habilitarlo.');
    return null;
  }
}

function startVUMeter() {
  const bar = document.getElementById('mic-level-bar');
  const val = document.getElementById('mic-level-val');
  if (!state.analyserNode || !bar) return;

  const dataArray = new Uint8Array(state.analyserNode.frequencyBinCount);

  const checkLevel = () => {
    state.analyserNode.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const pct = Math.min(100, Math.round((avg / 128) * 100));

    bar.style.width = `${pct}%`;
    val.textContent = `${pct} %`;

    if (pct > 15) {
      state.isSpeaking = true;
      document.getElementById('audio-speaker-status').textContent = 'Voz detectada';
    } else {
      state.isSpeaking = false;
      document.getElementById('audio-speaker-status').textContent = 'Silencio';
    }

    requestAnimationFrame(checkLevel);
  };

  requestAnimationFrame(checkLevel);
}

// ==========================================
// 5. DISCORD-STYLE P2P VOICE ROOM (PeerJS)
// ==========================================
function initP2PRooms() {
  const openRoomBtn = document.getElementById('open-room-btn');
  const roomModal = document.getElementById('room-modal');
  const closeRoomBtn = document.getElementById('close-room-modal-btn');
  const createRoomBtn = document.getElementById('create-room-btn');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const copyLinkBtn = document.getElementById('copy-room-link-btn');

  openRoomBtn.addEventListener('click', () => roomModal.classList.remove('hidden'));
  closeRoomBtn.addEventListener('click', () => roomModal.classList.add('hidden'));

  // Check if room param in URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomInUrl = urlParams.get('room');
  if (roomInUrl) {
    document.getElementById('join-room-input').value = roomInUrl;
    roomModal.classList.remove('hidden');
  }

  // Create Room
  createRoomBtn.addEventListener('click', async () => {
    if (!state.localAudioStream) {
      const stream = await requestMicrophonePermission();
      if (!stream) return;
    }

    const randomCode = 'debate-' + Math.floor(1000 + Math.random() * 9000);
    state.roomCode = randomCode;
    state.isHost = true;

    setupPeerConnection(randomCode);

    document.getElementById('created-room-code').textContent = randomCode;
    document.getElementById('room-created-info').classList.remove('hidden');
  });

  // Copy Link
  copyLinkBtn.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      copyLinkBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> ¡Enlace Copiado!';
      lucide.createIcons();
      setTimeout(() => {
        copyLinkBtn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i> Copiar Enlace Directo';
        lucide.createIcons();
      }, 2000);
    });
  });

  // Join Room
  joinRoomBtn.addEventListener('click', async () => {
    const code = document.getElementById('join-room-input').value.trim().toLowerCase();
    if (!code) return;

    if (!state.localAudioStream) {
      const stream = await requestMicrophonePermission();
      if (!stream) return;
    }

    state.roomCode = code;
    state.isHost = false;
    setupPeerConnection(null, code);
  });

  // Mute & Hangup Call Bar
  document.getElementById('mute-call-btn').addEventListener('click', toggleMute);
  document.getElementById('hangup-call-btn').addEventListener('click', hangupCall);
}

function setupPeerConnection(hostId, targetIdToJoin = null) {
  if (typeof Peer === 'undefined') {
    alert('PeerJS no disponible. Verifica tu conexión a internet.');
    return;
  }

  // Initialize Peer on free public PeerJS cloud
  state.peer = hostId ? new Peer(hostId) : new Peer();

  state.peer.on('open', (id) => {
    console.log('Peer connected with ID:', id);

    if (targetIdToJoin) {
      // We are the caller (Debater B)
      connectToRemotePeer(targetIdToJoin);
    } else {
      // We are the host (Debater A)
      showCallBar(id, 'Esperando a que el Sujeto 2 se conecte...');
    }
  });

  // Incoming Call (Host receives call from Debater B)
  state.peer.on('call', (call) => {
    state.currentCall = call;
    call.answer(state.localAudioStream);

    call.on('stream', (remoteStream) => {
      attachRemoteAudio(remoteStream);
      showCallBar(state.roomCode, '¡Voz P2P Conectada con Sujeto 2!');
      document.getElementById('room-modal').classList.add('hidden');
      
      addStreamItem({
        speaker: 'AI',
        speakerLabel: 'Sala de Voz P2P',
        text: '¡Conexión establecida! Ambos sujetos están conectados en llamada directa por voz. Pueden comenzar a debatir.',
        badge: 'En Vivo'
      });
    });

    call.on('close', () => {
      alert('La otra persona se ha desconectado de la sala.');
      hangupCall();
    });
  });

  state.peer.on('error', (err) => {
    console.error('Peer error:', err);
    if (err.type === 'peer-unavailable') {
      alert('La sala ingresada no existe o no está activa en este momento.');
    }
  });
}

function connectToRemotePeer(targetId) {
  const call = state.peer.call(targetId, state.localAudioStream);
  state.currentCall = call;

  call.on('stream', (remoteStream) => {
    attachRemoteAudio(remoteStream);
    showCallBar(targetId, '¡Voz P2P Conectada con Sujeto 1!');
    document.getElementById('room-modal').classList.add('hidden');

    addStreamItem({
      speaker: 'AI',
      speakerLabel: 'Sala de Voz P2P',
      text: '¡Te has unido a la sala de debate! Audio bidireccional activo.',
      badge: 'En Vivo'
    });
  });

  call.on('close', () => {
    alert('Llamada finalizada.');
    hangupCall();
  });
}

function attachRemoteAudio(stream) {
  const audioEl = document.getElementById('remote-p2p-audio');
  if (audioEl) {
    audioEl.srcObject = stream;
    audioEl.play().catch(e => console.log('Audio autoplay permit needed:', e));
  }
}

function showCallBar(roomCode, statusMsg) {
  const bar = document.getElementById('voice-call-bar');
  document.getElementById('active-room-code').textContent = roomCode;
  document.getElementById('p2p-peers-status').textContent = statusMsg;
  bar.classList.remove('hidden');
}

function toggleMute() {
  if (!state.localAudioStream) return;
  state.isMicMuted = !state.isMicMuted;
  state.localAudioStream.getAudioTracks().forEach(track => {
    track.enabled = !state.isMicMuted;
  });

  const label = document.getElementById('call-mic-label');
  const icon = document.getElementById('call-mic-icon');
  if (state.isMicMuted) {
    label.textContent = 'Desmutear';
    icon.setAttribute('data-lucide', 'mic-off');
    icon.className = 'w-3 h-3 text-rose-400';
  } else {
    label.textContent = 'Mutear';
    icon.setAttribute('data-lucide', 'mic');
    icon.className = 'w-3 h-3 text-emerald-400';
  }
  lucide.createIcons();
}

function hangupCall() {
  if (state.currentCall) state.currentCall.close();
  if (state.peer) state.peer.destroy();
  state.currentCall = null;
  state.peer = null;
  document.getElementById('voice-call-bar').classList.add('hidden');
}

// ==========================================
// 6. 100% FREE FACT-CHECKING (WIKIPEDIA API)
// ==========================================
async function searchWikipediaFact(query) {
  if (!query) return;
  const statusEl = document.getElementById('audio-speaker-status');
  statusEl.textContent = 'Consultando Wikipedia...';

  try {
    const url = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.query && data.query.search && data.query.search.length > 0) {
      const top = data.query.search[0];
      // Strip HTML tags from snippet
      const cleanSnippet = top.snippet.replace(/<\/?[^>]+(>|$)/g, "");

      const factNode = graphEngine.addNode({
        label: top.title,
        quote: cleanSnippet + '...',
        category: 'factcheck',
        speaker: 'FACT',
        source: `Wikipedia en español: "${top.title}"`
      });

      // Link to recent node
      if (graphEngine.nodes.length > 1) {
        const prev = graphEngine.nodes[graphEngine.nodes.length - 2];
        graphEngine.addLink(prev.id, factNode.id, 'fact');
      }

      state.facts.push(factNode);
      addFactItem(factNode);

      addStreamItem({
        speaker: 'FACT',
        speakerLabel: `Verificación Libre (Wikipedia)`,
        text: `"${top.title}": ${cleanSnippet}...`,
        badge: 'Dato Abierto',
        source: `https://es.wikipedia.org/wiki/${encodeURIComponent(top.title)}`
      });

      calculateMetrics();
    } else {
      alert('No se encontraron artículos relevantes en Wikipedia para esa búsqueda.');
    }
  } catch (err) {
    console.error('Error Wikipedia API:', err);
  } finally {
    statusEl.textContent = 'Silencio';
  }
}

// ==========================================
// 7. SPEECH SYNTHESIS & SCENARIO ENGINE
// ==========================================
function speakText(text) {
  if (!state.voiceEnabled || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.0;

  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
  }

  utterance.onstart = () => {
    state.isSpeaking = true;
    document.getElementById('audio-speaker-status').textContent = 'IA Mediadora hablando...';
  };
  utterance.onend = () => {
    state.isSpeaking = false;
    document.getElementById('audio-speaker-status').textContent = 'Silencio';
  };

  window.speechSynthesis.speak(utterance);
}

function initVoices() {
  if (!window.speechSynthesis) return;
  const populate = () => {
    const voices = window.speechSynthesis.getVoices();
    const esVoices = voices.filter(v => v.lang.startsWith('es'));
    const select = document.getElementById('voice-select');
    if (!select) return;

    select.innerHTML = '';
    const voiceList = esVoices.length > 0 ? esVoices : voices;
    voiceList.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });

    if (esVoices.length > 0) {
      state.selectedVoice = esVoices[0];
      select.value = esVoices[0].name;
    }
  };

  populate();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populate;
  }
}

function loadScenario(scenarioId) {
  state.activeScenarioId = scenarioId;
  state.currentStepIndex = 0;
  stopAutoplay();

  const sc = SCENARIOS[scenarioId];
  if (!sc) return;

  document.getElementById('scenario-description').textContent = sc.description;
  document.getElementById('debater-a-name').textContent = sc.debaterA.name;
  document.getElementById('debater-a-stance').textContent = sc.debaterA.stance;
  document.getElementById('debater-b-name').textContent = sc.debaterB.name;
  document.getElementById('debater-b-stance').textContent = sc.debaterB.stance;

  graphEngine.clear();
  document.getElementById('stream-container').innerHTML = '';
  document.getElementById('facts-container').innerHTML = '<p class="text-xs text-slate-500 italic text-center py-4">No se han emitido verificaciones de datos aún.</p>';

  addStreamItem({
    speaker: 'AI',
    speakerLabel: 'IA Mediadora Socrática',
    text: `Iniciando debate: "${sc.title}". Bienvenidos ${sc.debaterA.name} y ${sc.debaterB.name}. Mi labor es mapear acuerdos, neutralizar falacias y guiarlos hacia un entendimiento compartido a costo cero.`,
    badge: 'Inicio'
  });

  state.nodes = [];
  state.links = [];
  state.facts = [];
  state.consensusScore = 0;
  state.tensionLevel = 'Baja';
  updateMetricsUI();
  updateStepCounter();

  const controls = document.getElementById('scenario-controls');
  if (scenarioId === 'custom') {
    controls.classList.add('hidden');
  } else {
    controls.classList.remove('hidden');
  }
}

function executeStep() {
  const sc = SCENARIOS[state.activeScenarioId];
  if (!sc || !sc.steps || state.currentStepIndex >= sc.steps.length) {
    stopAutoplay();
    return;
  }

  const step = sc.steps[state.currentStepIndex];
  state.currentStepIndex++;
  updateStepCounter();

  const node = graphEngine.addNode({
    label: step.label,
    quote: step.quote,
    category: step.category,
    speaker: step.speaker,
    steelmanning: step.steelmanning,
    source: step.source || ''
  });

  const prevNodes = graphEngine.nodes.filter(n => n.id !== node.id);
  if (prevNodes.length > 0) {
    const lastNode = prevNodes[prevNodes.length - 1];
    const linkType = step.category === 'consensus' ? 'consensus' : (step.category === 'factcheck' ? 'fact' : 'argues');
    graphEngine.addLink(lastNode.id, node.id, linkType);

    if (step.category === 'consensus') {
      const nodeA = prevNodes.slice().reverse().find(n => n.category === 'debaterA');
      const nodeB = prevNodes.slice().reverse().find(n => n.category === 'debaterB');
      if (nodeA) graphEngine.addLink(nodeA.id, node.id, 'consensus');
      if (nodeB) graphEngine.addLink(nodeB.id, node.id, 'consensus');
    }
  }

  let speakerLabel = 'Sujeto 1';
  let badge = 'Argumento';
  let speakerName = sc.debaterA.name;

  if (step.speaker === 'B') {
    speakerLabel = 'Sujeto 2';
    speakerName = sc.debaterB.name;
  } else if (step.speaker === 'AI') {
    speakerLabel = 'IA Mediadora (Voz)';
    badge = 'Intervención';
    speakerName = 'IA Mediadora';
  } else if (step.speaker === 'FACT') {
    speakerLabel = 'Verificación Fáctica';
    badge = 'Dato';
    speakerName = 'Fact-Checker';
  } else if (step.speaker === 'CONSENSUS') {
    speakerLabel = 'Consenso Detectado';
    badge = 'Acuerdo';
    speakerName = 'Consenso';
  }

  addStreamItem({
    speaker: step.speaker,
    speakerLabel: `${speakerLabel} (${speakerName})`,
    text: step.quote,
    badge: badge,
    steelmanning: step.steelmanning,
    source: step.source
  });

  if (step.category === 'factcheck') {
    state.facts.push(step);
    addFactItem(step);
  }

  calculateMetrics();

  if (step.speaker === 'AI' || step.speaker === 'CONSENSUS') {
    speakText(step.quote);
  }
}

function calculateMetrics() {
  const total = graphEngine.nodes.length;
  const consensusCount = graphEngine.nodes.filter(n => n.category === 'consensus').length;
  const factsCount = graphEngine.nodes.filter(n => n.category === 'factcheck').length;

  if (total === 0) {
    state.consensusScore = 0;
    state.tensionLevel = 'Baja';
  } else {
    state.consensusScore = Math.min(100, Math.round((consensusCount * 35) + (factsCount * 10) + (total * 4)));
    if (state.consensusScore > 70) state.tensionLevel = 'Resuelta';
    else if (state.consensusScore > 40) state.tensionLevel = 'Moderada';
    else state.tensionLevel = 'Elevada';
  }

  updateMetricsUI();
}

function updateMetricsUI() {
  const pctEl = document.getElementById('consensus-percentage');
  const barEl = document.getElementById('consensus-progress-bar');
  const badgeEl = document.getElementById('tension-badge');
  const nodeCountEl = document.getElementById('nodes-count');
  const agreeCountEl = document.getElementById('agreements-count');
  const factCountEl = document.getElementById('fact-count');

  if (pctEl) pctEl.textContent = `${state.consensusScore}%`;
  if (barEl) barEl.style.width = `${state.consensusScore}%`;
  if (nodeCountEl) nodeCountEl.textContent = graphEngine ? graphEngine.nodes.length : 0;
  if (agreeCountEl) agreeCountEl.textContent = graphEngine ? graphEngine.nodes.filter(n => n.category === 'consensus').length : 0;
  if (factCountEl) factCountEl.textContent = state.facts.length;

  if (badgeEl) {
    badgeEl.textContent = state.tensionLevel;
    if (state.tensionLevel === 'Resuelta' || state.tensionLevel === 'Baja') {
      badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800';
    } else if (state.tensionLevel === 'Moderada') {
      badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800';
    } else {
      badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800';
    }
  }
}

function updateStepCounter() {
  const sc = SCENARIOS[state.activeScenarioId];
  const el = document.getElementById('step-counter');
  if (!el || !sc || !sc.steps) return;
  el.textContent = `Paso ${state.currentStepIndex} / ${sc.steps.length}`;
}

function toggleAutoplay() {
  if (state.isPlaying) stopAutoplay();
  else startAutoplay();
}

function startAutoplay() {
  state.isPlaying = true;
  document.getElementById('autoplay-icon').setAttribute('data-lucide', 'pause');
  document.getElementById('autoplay-text').textContent = 'Pausa';
  lucide.createIcons();

  state.playInterval = setInterval(() => {
    const sc = SCENARIOS[state.activeScenarioId];
    if (!sc || state.currentStepIndex >= sc.steps.length) {
      stopAutoplay();
      return;
    }
    executeStep();
  }, 4200);
}

function stopAutoplay() {
  state.isPlaying = false;
  if (state.playInterval) clearInterval(state.playInterval);
  state.playInterval = null;
  const icon = document.getElementById('autoplay-icon');
  const text = document.getElementById('autoplay-text');
  if (icon) icon.setAttribute('data-lucide', 'play');
  if (text) text.textContent = 'Auto';
  lucide.createIcons();
}

// ==========================================
// 8. STREAM, FACTS & INSPECTOR
// ==========================================
function addStreamItem(item) {
  const container = document.getElementById('stream-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'p-3 rounded-xl border transition-all duration-300 text-xs shadow-md ';

  let borderStyle = 'border-slate-800 bg-slate-900/80';
  let badgeColor = 'bg-slate-800 text-slate-300';
  let iconName = 'message-square';

  if (item.speaker === 'A') {
    borderStyle = 'border-blue-900/60 bg-blue-950/20';
    badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    iconName = 'user';
  } else if (item.speaker === 'B') {
    borderStyle = 'border-amber-900/60 bg-amber-950/20';
    badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    iconName = 'user';
  } else if (item.speaker === 'AI' || item.speaker === 'CONSENSUS') {
    borderStyle = 'border-emerald-800/60 bg-emerald-950/30 glow-emerald';
    badgeColor = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    iconName = 'sparkles';
  } else if (item.speaker === 'FACT') {
    borderStyle = 'border-cyan-800/60 bg-cyan-950/30';
    badgeColor = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    iconName = 'check-circle';
  }

  div.className += borderStyle;

  div.innerHTML = `
    <div class="flex items-center justify-between mb-1.5">
      <div class="flex items-center gap-1.5">
        <span class="p-1 rounded bg-slate-800">
          <i data-lucide="${iconName}" class="w-3 h-3 text-slate-300"></i>
        </span>
        <span class="font-bold text-slate-200">${item.speakerLabel}</span>
      </div>
      <span class="text-[9px] font-semibold px-2 py-0.5 rounded ${badgeColor}">${item.badge}</span>
    </div>
    <p class="text-slate-300 leading-relaxed">${item.text}</p>
    ${item.steelmanning ? `
      <div class="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-emerald-300/90 italic flex items-start gap-1">
        <i data-lucide="sparkles" class="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5"></i>
        <span><strong>Steelmanning:</strong> ${item.steelmanning}</span>
      </div>
    ` : ''}
    ${item.source ? `
      <div class="mt-1 text-[10px] text-cyan-400/80 font-mono">Fuente: ${item.source}</div>
    ` : ''}
  `;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function addFactItem(fact) {
  const container = document.getElementById('facts-container');
  if (!container) return;

  if (state.facts.length === 1) container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'p-3 rounded-xl border border-cyan-800/60 bg-cyan-950/30 text-xs shadow-md';
  div.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <span class="font-bold text-cyan-400 flex items-center gap-1.5">
        <i data-lucide="check-check" class="w-3.5 h-3.5"></i>
        ${fact.label}
      </span>
      <span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Verificado</span>
    </div>
    <p class="text-slate-300 leading-relaxed mb-1.5">${fact.quote}</p>
    <div class="text-[10px] text-cyan-300/80 font-mono bg-slate-950/60 p-1 rounded border border-slate-800">
      📚 ${fact.source}
    </div>
  `;
  container.appendChild(div);
  lucide.createIcons();
}

function selectNode(node) {
  state.selectedNode = node;
  const inspector = document.getElementById('node-inspector');
  if (!inspector) return;

  const badge = document.getElementById('inspector-badge');
  const title = document.getElementById('inspector-title');
  const content = document.getElementById('inspector-content');
  const steelmanBox = document.getElementById('inspector-steelman-box');
  const steelmanText = document.getElementById('inspector-steelman-text');
  const factBox = document.getElementById('inspector-fact-box');
  const factText = document.getElementById('inspector-fact-text');
  const factSource = document.getElementById('inspector-fact-source');

  title.textContent = node.label;
  content.textContent = node.quote;

  let badgeText = 'Premisa';
  let badgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';

  if (node.category === 'debaterA') {
    badgeText = 'Sujeto 1';
    badgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
  } else if (node.category === 'debaterB') {
    badgeText = 'Sujeto 2';
    badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
  } else if (node.category === 'consensus') {
    badgeText = 'Punto de Consenso';
    badgeClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  } else if (node.category === 'factcheck') {
    badgeText = 'Verificación Fáctica';
    badgeClass = 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
  }

  badge.textContent = badgeText;
  badge.className = `px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass}`;

  if (node.steelmanning) {
    steelmanBox.classList.remove('hidden');
    steelmanText.textContent = node.steelmanning;
  } else {
    steelmanBox.classList.add('hidden');
  }

  if (node.source) {
    factBox.classList.remove('hidden');
    factText.textContent = node.quote;
    factSource.textContent = `Fuente: ${node.source}`;
  } else {
    factBox.classList.add('hidden');
  }

  inspector.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
}

function closeInspector() {
  state.selectedNode = null;
  document.getElementById('node-inspector')?.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
}

// ==========================================
// 9. LIVE DICTATION & ARGUMENT LOGIC
// ==========================================
function setupLiveInputs() {
  const sendA = document.getElementById('send-a-btn');
  const sendB = document.getElementById('send-b-btn');
  const inputA = document.getElementById('input-a-text');
  const inputB = document.getElementById('input-b-text');

  const handleSend = (speaker, inputEl) => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    processUserArgument(speaker, text);
  };

  if (sendA) sendA.addEventListener('click', () => handleSend('A', inputA));
  if (sendB) sendB.addEventListener('click', () => handleSend('B', inputB));
  if (inputA) inputA.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend('A', inputA); });
  if (inputB) inputB.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend('B', inputB); });

  // Mic dictation setup
  setupDictation('mic-a-btn', 'A', inputA);
  setupDictation('mic-b-btn', 'B', inputB);

  // Wikipedia Search
  const wikiBtn = document.getElementById('wiki-search-btn');
  const wikiInput = document.getElementById('wiki-query-input');
  wikiBtn.addEventListener('click', () => searchWikipediaFact(wikiInput.value.trim()));
  wikiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchWikipediaFact(wikiInput.value.trim()); });
}

function setupDictation(btnId, speaker, inputEl) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.title = 'Usa Chrome o Edge para reconocimiento por voz web';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;

  let isRecording = false;

  btn.addEventListener('click', async () => {
    // Ensure permission is granted first
    if (!state.micPermissionGranted) {
      const stream = await requestMicrophonePermission();
      if (!stream) return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
        isRecording = true;
        btn.classList.add('ring-2', 'ring-emerald-400', 'bg-emerald-800');
        document.getElementById('audio-speaker-status').textContent = `Escuchando Sujeto ${speaker}...`;
      } catch (err) {
        console.error('Speech recognition error:', err);
      }
    }
  });

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    inputEl.value = text;
    processUserArgument(speaker, text);
  };

  recognition.onend = () => {
    isRecording = false;
    btn.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-800');
    document.getElementById('audio-speaker-status').textContent = 'Silencio';
  };

  recognition.onerror = () => {
    isRecording = false;
    btn.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-800');
    document.getElementById('audio-speaker-status').textContent = 'Silencio';
  };
}

async function processUserArgument(speaker, text) {
  // If Gemini API Key exists, use it
  if (state.geminiApiKey) {
    await callGeminiMediation(speaker, text);
    return;
  }

  // Otherwise: 100% Free Local Socratic Engine
  processHeuristicArgument(speaker, text);
}

function processHeuristicArgument(speaker, text) {
  const isA = speaker === 'A';
  const category = isA ? 'debaterA' : 'debaterB';
  const label = text.length > 25 ? text.substring(0, 24) + '...' : text;
  
  const steelman = isA 
    ? `El Sujeto 1 defiende que ${label.toLowerCase()}, priorizando la estabilidad y los principios clave.`
    : `El Sujeto 2 argumenta que ${label.toLowerCase()}, enfocándose en la equidad y la protección del conjunto.`;

  const node = graphEngine.addNode({
    label: label,
    quote: text,
    category: category,
    speaker: speaker,
    steelmanning: steelman
  });

  const prevNodes = graphEngine.nodes.filter(n => n.id !== node.id);
  if (prevNodes.length > 0) {
    graphEngine.addLink(prevNodes[prevNodes.length - 1].id, node.id, 'argues');
  }

  addStreamItem({
    speaker: speaker,
    speakerLabel: `Sujeto ${speaker}`,
    text: text,
    badge: 'Argumento',
    steelmanning: steelman
  });

  // Check if intervention should happen
  if (graphEngine.nodes.length % 2 === 0) {
    setTimeout(() => generateSocraticBridge(), 1000);
  }

  calculateMetrics();
}

function generateSocraticBridge() {
  const nodes = graphEngine.nodes;
  const nodeA = nodes.slice().reverse().find(n => n.category === 'debaterA');
  const nodeB = nodes.slice().reverse().find(n => n.category === 'debaterB');

  if (nodeA && nodeB) {
    const question = `Ambos lados buscan resolver un dilema legítimo: el Sujeto 1 prioriza "${nodeA.label}" mientras que el Sujeto 2 resalta "${nodeB.label}". ¿Qué salvaguarda garantizaría los intereses de ambos simultáneamente?`;

    const consensusNode = graphEngine.addNode({
      label: 'Salvaguarda de Interés Mutuo',
      quote: question,
      category: 'consensus',
      speaker: 'AI',
      steelmanning: 'La divergencia es de método, no de objetivo: ambos buscan protección y equilibrio.'
    });

    graphEngine.addLink(nodeA.id, consensusNode.id, 'consensus');
    graphEngine.addLink(nodeB.id, consensusNode.id, 'consensus');

    addStreamItem({
      speaker: 'AI',
      speakerLabel: 'IA Mediadora (Voz)',
      text: question,
      badge: 'Puente Socrático',
      steelmanning: 'Ambas partes buscan una solución viable; el reto es pactar las condiciones.'
    });

    speakText(question);
    calculateMetrics();
  }
}

async function callGeminiMediation(speaker, text) {
  try {
    document.getElementById('audio-speaker-status').textContent = 'Analizando con Gemini...';
    const prompt = `Actúa como una IA Mediadora socrática neutral. El participante ${speaker} acaba de afirmar: "${text}".
Contexto previo: ${JSON.stringify(graphEngine.nodes.map(n => ({ label: n.label, speaker: n.speaker })))}.
Responde con un JSON estricto:
{
  "label": "resumen de 3 o 4 palabras",
  "steelmanning": "reformulación constructiva empática",
  "mediatorIntervention": "pregunta o puente socrático breve si procede (o vacía)"
}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!res.ok) throw new Error('Gemini API Error');
    const data = await res.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);

    const node = graphEngine.addNode({
      label: result.label || text.substring(0, 20),
      quote: text,
      category: speaker === 'A' ? 'debaterA' : 'debaterB',
      speaker: speaker,
      steelmanning: result.steelmanning
    });

    if (graphEngine.nodes.length > 1) {
      graphEngine.addLink(graphEngine.nodes[graphEngine.nodes.length - 2].id, node.id, 'argues');
    }

    addStreamItem({
      speaker: speaker,
      speakerLabel: `Sujeto ${speaker}`,
      text: text,
      badge: 'Argumento',
      steelmanning: result.steelmanning
    });

    if (result.mediatorIntervention) {
      const consensusNode = graphEngine.addNode({
        label: 'Puente Socrático',
        quote: result.mediatorIntervention,
        category: 'consensus',
        speaker: 'AI',
        steelmanning: result.steelmanning
      });
      graphEngine.addLink(node.id, consensusNode.id, 'consensus');
      addStreamItem({
        speaker: 'AI',
        speakerLabel: 'IA Mediadora (Gemini)',
        text: result.mediatorIntervention,
        badge: 'Intervención',
        steelmanning: result.steelmanning
      });
      speakText(result.mediatorIntervention);
    }

    calculateMetrics();
  } catch (err) {
    console.error('Gemini fallback:', err);
    processHeuristicArgument(speaker, text);
  } finally {
    document.getElementById('audio-speaker-status').textContent = 'Silencio';
  }
}

// ==========================================
// 10. REPORT EXPORT MODAL
// ==========================================
function openReportModal() {
  const modal = document.getElementById('report-modal');
  const content = document.getElementById('report-content');
  if (!modal || !content) return;

  const sc = SCENARIOS[state.activeScenarioId];
  const consensusNodes = graphEngine.nodes.filter(n => n.category === 'consensus');
  const factsNodes = graphEngine.nodes.filter(n => n.category === 'factcheck');

  content.innerHTML = `
    <div class="border-b border-slate-800 pb-3">
      <h2 class="text-base font-bold text-emerald-400">${sc.title}</h2>
      <p class="text-xs text-slate-400 mt-0.5">Fecha: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <div class="flex items-center gap-4 mt-2 text-xs">
        <span>Consenso: <strong class="text-emerald-400">${state.consensusScore}%</strong></span>
        <span>Tensión: <strong class="text-slate-200">${state.tensionLevel}</strong></span>
        <span>Nodos evaluados: <strong class="text-slate-200">${graphEngine.nodes.length}</strong></span>
      </div>
    </div>

    <div>
      <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400"></i> Terreno Común y Consensos
      </h3>
      ${consensusNodes.length > 0 ? `
        <ul class="space-y-2">
          ${consensusNodes.map(c => `
            <li class="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
              <span class="font-semibold text-emerald-300 block mb-0.5">${c.label}</span>
              <p class="text-slate-300 text-[11px]">${c.quote}</p>
              ${c.steelmanning ? `<div class="text-[10px] text-emerald-400/80 italic mt-1">Principio compartido: ${c.steelmanning}</div>` : ''}
            </li>
          `).join('')}
        </ul>
      ` : '<p class="text-slate-500 italic">No se consolidaron consensos formales aún.</p>'}
    </div>

    <div>
      <h3 class="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-cyan-400"></i> Hechos Verificados
      </h3>
      ${factsNodes.length > 0 ? `
        <ul class="space-y-2">
          ${factsNodes.map(f => `
            <li class="p-2 rounded-lg bg-cyan-950/20 border border-cyan-900/40 text-[11px]">
              <span class="font-semibold text-cyan-300 block">${f.label}</span>
              <p class="text-slate-300">${f.quote}</p>
              <span class="text-[9px] text-cyan-400/80 font-mono mt-0.5 block">📚 ${f.source}</span>
            </li>
          `).join('')}
        </ul>
      ` : '<p class="text-slate-500 italic">Sin verificaciones fácticas registradas.</p>'}
    </div>
  `;

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeReportModal() {
  document.getElementById('report-modal')?.classList.add('hidden');
}

function copyReportMarkdown() {
  const sc = SCENARIOS[state.activeScenarioId];
  const consensusNodes = graphEngine.nodes.filter(n => n.category === 'consensus');
  const factsNodes = graphEngine.nodes.filter(n => n.category === 'factcheck');

  const md = `# Acta de Mediación de Debate: ${sc.title}
**Consenso:** ${state.consensusScore}% | **Tensión:** ${state.tensionLevel}

## Puntos de Consenso
${consensusNodes.map(c => `- **${c.label}**: ${c.quote}`).join('\n')}

## Hechos Verificados
${factsNodes.map(f => `- **${f.label}**: ${f.quote} [${f.source}]`).join('\n')}

---
*Generado por AI Debate Mediator P2P.*`;

  navigator.clipboard.writeText(md).then(() => {
    const btn = document.getElementById('copy-report-btn');
    if (btn) {
      btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> ¡Copiado!';
      lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i> Copiar Markdown';
        lucide.createIcons();
      }, 2000);
    }
  });
}

// ==========================================
// 11. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const graphCanvas = document.getElementById('graph-canvas');
  graphEngine = new GraphEngine(graphCanvas);

  initVoices();
  loadScenario('scenario_ai');

  // Mic permission explicit button
  document.getElementById('request-mic-permission-btn').addEventListener('click', requestMicrophonePermission);

  // P2P Voice Rooms
  initP2PRooms();

  // Scenario Selector
  document.getElementById('scenario-select').addEventListener('change', (e) => loadScenario(e.target.value));

  // Step Controls
  document.getElementById('step-btn').addEventListener('click', executeStep);
  document.getElementById('autoplay-btn').addEventListener('click', toggleAutoplay);
  document.getElementById('reset-btn').addEventListener('click', () => loadScenario(state.activeScenarioId));

  // Canvas Zoom Buttons
  document.getElementById('zoom-in-btn').addEventListener('click', () => {
    graphEngine.camera.zoom = Math.min(2.5, graphEngine.camera.zoom * 1.2);
  });
  document.getElementById('zoom-out-btn').addEventListener('click', () => {
    graphEngine.camera.zoom = Math.max(0.3, graphEngine.camera.zoom / 1.2);
  });
  document.getElementById('zoom-reset-btn').addEventListener('click', () => graphEngine.resetCamera());

  // Node Inspector Close
  document.getElementById('close-inspector-btn').addEventListener('click', closeInspector);

  // Tabs Switcher
  const tabStream = document.getElementById('tab-stream-btn');
  const tabFacts = document.getElementById('tab-facts-btn');
  const streamContainer = document.getElementById('stream-container');
  const factsContainer = document.getElementById('facts-container');

  tabStream.addEventListener('click', () => {
    tabStream.className = 'text-xs font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition';
    tabFacts.className = 'text-xs font-medium px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 transition';
    streamContainer.classList.remove('hidden');
    factsContainer.classList.add('hidden');
  });

  tabFacts.addEventListener('click', () => {
    tabFacts.className = 'text-xs font-semibold px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 transition';
    tabStream.className = 'text-xs font-medium px-2 py-1 rounded-md text-slate-400 hover:text-slate-200 transition';
    factsContainer.classList.remove('hidden');
    streamContainer.classList.add('hidden');
  });

  // Voice Toggle Button
  const voiceBtn = document.getElementById('toggle-voice-btn');
  const voiceIcon = document.getElementById('voice-icon');
  voiceBtn.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    if (state.voiceEnabled) {
      voiceIcon.className = 'w-4 h-4 text-emerald-400';
    } else {
      window.speechSynthesis?.cancel();
      voiceIcon.className = 'w-4 h-4 text-slate-500';
      state.isSpeaking = false;
      document.getElementById('audio-speaker-status').textContent = 'Silencio';
    }
  });

  // Settings Modal
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    document.getElementById('gemini-api-key').value = state.geminiApiKey;
    settingsModal.classList.remove('hidden');
  });
  document.getElementById('close-settings-modal-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const key = document.getElementById('gemini-api-key').value.trim();
    state.geminiApiKey = key;
    localStorage.setItem('gemini_api_key', key);
    settingsModal.classList.add('hidden');
  });

  // Report Modal
  document.getElementById('open-report-btn').addEventListener('click', openReportModal);
  document.getElementById('close-report-modal-btn').addEventListener('click', closeReportModal);
  document.getElementById('copy-report-btn').addEventListener('click', copyReportMarkdown);
  document.getElementById('print-report-btn').addEventListener('click', () => window.print());

  setupLiveInputs();
});
