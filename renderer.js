const video = document.querySelector('#video');
const canvas = document.querySelector('#picture');
const stage = document.querySelector('#stage');
const staticPicture = document.querySelector('#staticPicture');
const compositeCanvas = document.createElement('canvas');
const compositeContext = compositeCanvas.getContext('2d', { alpha: false });
compositeCanvas.className = 'picture-fallback';
compositeCanvas.setAttribute('aria-hidden', 'true');
compositeCanvas.hidden = true;
canvas.insertAdjacentElement('afterend', compositeCanvas);
const tvSet = document.querySelector('#tvSet');
const statusEl = document.querySelector('#status');
const titleEl = document.querySelector('#mediaTitle');
const caption = document.querySelector('#caption');
const playButton = document.querySelector('#playButton');
const seek = document.querySelector('#seek');
const currentTimeEl = document.querySelector('#timeCurrent');
const durationEl = document.querySelector('#timeDuration');
const audioOutputSelect = document.querySelector('#audioOutput');
const subtitleSelect = document.querySelector('#subtitleTracks');
const videoDial = document.querySelector('#volume');
const scanlineDial = document.querySelector('#scanlines');
const curveDial = document.querySelector('#curve');
const edgeBlurDial = document.querySelector('#edgeBlur');
const hueDial = document.querySelector('#hue');
const vhsScanDial = document.querySelector('#vhsScan');
const glitchDial = document.querySelector('#glitch');
const brokenTapeDial = document.querySelector('#brokenTape');
const glowDial = document.querySelector('#glow');
const glareDial = document.querySelector('#glare');
const fxAmountDial = document.querySelector('#fxAmount');
const pictureModeSelect = document.querySelector('#pictureMode');
const displayModeSelect = document.querySelector('#displayMode');
const pictureBypassToggle = document.querySelector('#pictureBypassToggle');
const audioBypassToggle = document.querySelector('#audioBypassToggle');
const audioEffectSelect = document.querySelector('#audioEffectSelect');
const cabinetTintInput = document.querySelector('#cabinetTint');
const inputButton = document.querySelector('#inputButton');
const soundEffectsToggle = document.querySelector('#soundEffectsToggle');
const soundEffectsVolumeControl = document.querySelector('#soundEffectsVolume');
const soundEffectsReadout = document.querySelector('#soundEffectsReadout');
const pictureDials = [scanlineDial, curveDial, edgeBlurDial, hueDial, vhsScanDial, glitchDial, brokenTapeDial, glowDial, glareDial];
const allDials = [videoDial, ...pictureDials, fxAmountDial];
const playlistSelect = document.querySelector('#playlistSelect');
const playlistName = document.querySelector('#playlistName');
const playlistItemsEl = document.querySelector('#playlistItems');
const channelStatus = document.querySelector('#channelStatus');
const channelRootPath = document.querySelector('#channelRootPath');
const channelSummary = document.querySelector('#channelSummary');
const addChannelButton = document.querySelector('#addChannelButton');
const rescanChannelButton = document.querySelector('#rescanChannelButton');
const channelSurfName = document.querySelector('#channelSurfName');
const channelSurfOverlay = document.querySelector('#channelSurfOverlay');
const channelDownButton = document.querySelector('#channelDownButton');
const channelUpButton = document.querySelector('#channelUpButton');
const tvGuideDialog = document.querySelector('#tvGuideDialog');
const tvGuidePage = document.querySelector('#tvGuidePage');
const tvGuidePageContent = document.querySelector('#tvGuidePageContent');
const tvSettingsDialog = document.querySelector('#tvSettingsDialog');
let guideRefreshTimer = null;
let channelSurfOverlayTimer = null;
let tvGuidePageIndex = 0;
const GUIDE_WINDOW_SECONDS = 6 * 60 * 60;
const GUIDE_VISIBLE_PROGRAMS = 36;
const TV_SEARCHING_GRACE_MS = 900;
let tvSearching = false;
let tvSearchingTimer = null;
let moviePrerollState = null;
let moviePrerollMoviePath = '';
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
const PLAYLISTS_KEY = 'saturdayTube.playlists.v1';
const CONTROLS_KEY = 'saturdayTube.controls.v1';
const SESSION_KEY = 'saturdayTube.session.v1';
const METADATA_KEY = 'saturdayTube.metadata.v2';
const METADATA_OVERRIDE_KEY = 'saturdayTube.metadataOverrides.v1';
const SHELF_KEY = 'saturdayTube.shelf.root.v1';
const CHANNELS_KEY = 'saturdayTube.channels.v1';
const METADATA_TTL = 30 * 24 * 60 * 60 * 1000;
const METADATA_MISS_TTL = 12 * 60 * 60 * 1000;
const MAX_METADATA_CACHE_ENTRIES = 500;
const libraryDialog = document.querySelector('#libraryDialog');
const libraryShelves = document.querySelector('#libraryShelves');
const librarySearch = document.querySelector('#librarySearch');
const libraryBreadcrumbs = document.querySelector('#libraryBreadcrumbs');
const libraryUpButton = document.querySelector('#libraryUpButton');
const libraryAddButton = document.querySelector('#libraryAddButton');
const libraryAddFileButton = document.querySelector('#libraryAddFileButton');
const libraryActivity = document.querySelector('#libraryActivity');
const libraryActivityText = document.querySelector('#libraryActivityText');
const libraryImportPanel = document.querySelector('#libraryImportProgress');
const libraryImportTitle = document.querySelector('#libraryImportTitle');
const libraryImportSummary = document.querySelector('#libraryImportSummary');
const libraryImportMeter = document.querySelector('#libraryImportMeter');
const libraryImportItems = document.querySelector('#libraryImportItems');
const libraryImportClear = document.querySelector('#libraryImportClear');
const libraryDestination = document.querySelector('#libraryDestination');
const finishButtons = Array.from(document.querySelectorAll('[data-finish]'));
let libraryView = null;
let shelfRestorePromise = null;
let librarySelection = new Set();
let libraryImportInProgress = false;
let libraryImportDismissTimer = null;
const LIBRARY_IMPORT_SUCCESS_DISMISS_MS = 1800;
const libraryImportRows = new Map();
let libraryImportTotal = 0;
let libraryImportCompleted = 0;
const metadataCache = new Map();
const metadataOverrides = new Map();
const metadataRequests = new Map();
const metadataQueue = [];
let metadataActiveRequests = 0;
const METADATA_CONCURRENCY = 3;
function updateLibraryActivity() {
  const message = libraryImportInProgress
    ? 'ADDING TAPES · PER-TAPE COPY STATUS BELOW…'
    : metadataRequests.size
      ? `FETCHING TITLES & COVERS · ${metadataRequests.size} LEFT…`
      : '';
  if (!libraryActivity || !libraryActivityText) return;
  libraryActivity.hidden = !message;
  libraryActivity.setAttribute('aria-busy', String(Boolean(message)));
  libraryActivityText.textContent = message;
}
function markMetadataLoading(view) {
  view.note.classList.add('is-loading');
  view.note.setAttribute('aria-busy', 'true');
  view.note.textContent = 'LOOKING UP TITLE…';
}
let currentSubtitleTrack = null;
let externalTrackCount = 0;
let hasVideo = false;
let glProgram = null;
let texture = null;
let textureWidth = 0;
let textureHeight = 0;
let lastUploadedTime = -1;
let lastRenderedSource = null;
let lastRenderedExtension = null;
let glContextLost = false;
let pictureFallback = false;
let pictureFiltersEnabled = true;
let audioFiltersEnabled = true;
let selectedPictureMode = 'color';
let displayMode = 'crt';
let selectedAudioEffect = 'clean';
let soundEffectsEnabled = true;
let soundEffectsVolume = 100;
let selectedInput = 'video';
let transitionInput = '';
let resumeVideoAfterStatic = false;
let resumeTVAfterStatic = false;
let staticReturnInput = 'video';
let transitionStatic = false;
let channelTuneToken = 0;
let activeChannelTuneMetric = null;
let channelPrewarmToken = 0;
let channelPrewarmPromise = null;
let queuedChannelPrewarm = null;
const MAX_ADJACENT_CHANNELS_TO_PREWARM = 2;
let preferredAudioOutputId = 'default';
let activeAudioOutputId = 'default';
let audioOutputDevices = [];
let staticInputUrl = '';
const soundEffectAudio = new Map();
const soundEffectGainNodes = new Map();
const soundEffectPlayTokens = new Map();
let soundEffectsAudioContext = null;
let soundEffectsLimiter = null;
let staticPictureSource = null;
let staticPictureGain = null;
let audioContext = null;
let audioGraphFailed = false;
let mediaSource = null;
let masterGain = null;
let dryGain = null;
let wetGain = null;
let effectHighpass = null;
let effectLowpass = null;
let effectPeak = null;
let effectDrive = null;
let effectDelay = null;
let wowLfoGain = null;
let humGain = null;
let staticGain = null;
let currentFinish = 'wood';
let cabinetTint = '#9b6334';
let playlists = [];
let activePlaylistId = '';
let channels = [];
let activeChannelId = '';
let channelsStartupReady = false;
let channelSetupNotice = '';
const channelAudioCompatibleMedia = new Map();
const channelAudioCompatibilityJobs = new Map();
const CHANNEL_PLAYBACK_SAVE_INTERVAL_MS = 5000;
const MAX_SAVED_CHANNEL_QUEUE_ENTRIES = 6000;
const MAX_SAVED_CHANNEL_HISTORY_ENTRIES = 1000;
let currentIndex = -1;
let pendingPlaybackRestore = null;
let playbackRequestId = 0;
const localTapeCopyJobs = new Map();
const ejectingManagedPaths = new Set();
let switchingTracks = false;
let lastCompositePaused = null;
let lastCompositeHasFrame = false;
let fallbackAttempted = false;
let playbackGeneration = 0;
let activePlaybackGeneration = -1;
let activePlaybackUrl = '';
let activePlaybackChannelId = '';
let activePlaybackTuneToken = -1;
let activePlaybackPath = '';
let extensionTimer = null;
let visibleFileExtension = '';
let cursorTimer = null;
let frameLoopRequest = null;
let shuttingOff = false;
let pendingStartupShutoff = false;
let startupIntroActive = true;

const vertexSource = `attribute vec2 p; varying vec2 uv; void main(){ uv=(p+1.0)*0.5; gl_Position=vec4(p,0.0,1.0); }`;
const fragmentSource = `precision mediump float;
varying vec2 uv; uniform sampler2D frame; uniform vec2 resolution; uniform float time; uniform float strength; uniform float scan; uniform float edgeBlur; uniform float hueShift; uniform float vhsScan; uniform float glitch; uniform float broken; uniform float glow; uniform float glare; uniform float pictureMode; uniform float rearProjection;
float hash(float n){return fract(sin(n)*43758.5453);}
mat3 hueTurn(float a){float c=cos(a),s=sin(a);return mat3(0.213+0.787*c-0.213*s,0.213-0.213*c+0.143*s,0.213-0.213*c-0.787*s,0.715-0.715*c-0.715*s,0.715+0.285*c+0.140*s,0.715-0.715*c+0.715*s,0.072-0.072*c+0.928*s,0.072-0.072*c-0.283*s,0.072+0.928*c+0.072*s);}
vec3 softSample(vec2 p,float radius){vec2 d=vec2(radius)/resolution;return (texture2D(frame,p).rgb*0.40+texture2D(frame,p+vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p-vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p+vec2(0.0,d.y)).rgb*0.15+texture2D(frame,p-vec2(0.0,d.y)).rgb*0.15);}
void main(){vec2 q=uv*2.0-1.0;float r2=dot(q,q);if(rearProjection<0.5)q*=1.0+strength*r2;vec2 t=q*0.5+0.5;t.y=1.0-t.y;if(t.x<0.0||t.x>1.0||t.y<0.0||t.y>1.0){gl_FragColor=vec4(0.025,0.03,0.025,1.0);return;}
float row=floor(t.y*resolution.y/7.0);float twitch=(hash(row+floor(time*19.0))-0.5)*0.006*glitch;float tear=step(0.992,hash(floor(time*14.0)+floor(t.y*23.0)))*glitch*0.012;float eventRate=0.12+vhsScan*0.65;float eventIndex=floor(time*eventRate);float eventPulse=step(0.80,hash(eventIndex+19.0));float bandY=fract(hash(eventIndex+41.0)+time*(0.02+vhsScan*0.20));float bandWidth=0.003+vhsScan*0.003;float triangularBand=max(0.0,1.0-abs(t.y-bandY)/bandWidth);float edgeJitter=(hash(row+eventIndex*3.0)-0.5);float tracking=eventPulse*triangularBand*edgeJitter*(0.008+vhsScan*0.025)*step(0.001,vhsScan);float microJitter=(hash(row+floor(time*(8.0+vhsScan*50.0)))-0.5)*vhsScan*0.0015;t.x=clamp(t.x+twitch+tear+tracking+microJitter,0.0,1.0);
float edge=smoothstep(0.15,1.15,r2);float blurRadius=edge*edgeBlur*1.2+rearProjection*0.65;float split=0.00015+vhsScan*0.0008+glitch*0.001;vec3 col=softSample(t,blurRadius);col.r=softSample(clamp(t+vec2(split,0.0),0.0,1.0),blurRadius).r;col.b=softSample(clamp(t-vec2(split,0.0),0.0,1.0),blurRadius).b;
col=hueTurn((hueShift-0.5)*6.28318)*col;float luma=dot(col,vec3(0.299,0.587,0.114));if(pictureMode>1.5)col=vec3(luma);else if(pictureMode>0.5){vec3 warm=vec3(luma*1.04,luma*1.01,luma*0.94);col=mix(col,warm,0.68);col=clamp((col-0.5)*0.82+0.5,0.0,1.0);}float lines=0.985+0.015*sin(t.y*resolution.y*3.14159);col*=mix(1.0,lines,scan);float dropout=step(0.995,hash(floor(t.y*resolution.y/3.0)+floor(time*8.0)))*broken*0.14;float snow=hash(floor(t.x*resolution.x/2.0)+floor(t.y*resolution.y/2.0)+floor(time*35.0))-0.5;col*=1.0-dropout;col+=snow*broken*0.012;vec3 bloom=max(softSample(t,2.0+glow*10.0)-vec3(0.62),vec3(0.0));col+=bloom*glow*0.42;float corner=1.0-0.12*r2;col*=corner;float grille=0.99+0.01*cos(t.x*resolution.x*3.14159);col*=mix(1.0,grille,scan*0.22);if(rearProjection>0.5){col=col*0.88+vec3(0.035,0.03,0.024);col=pow(max(col,vec3(0.0)),vec3(0.96));}float reflection=exp(-length((uv-vec2(0.21,0.18))*vec2(1.15,1.0))*10.0)*glare*0.11;col+=vec3(0.82,0.91,1.0)*reflection;gl_FragColor=vec4(col,1.0);}`;

function shader(type, source) {
  const item = gl.createShader(type);
  gl.shaderSource(item, source);
  gl.compileShader(item);
  if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
  return item;
}
function setupGL() {
  if (!gl) { setStatus('WEBGL NOT AVAILABLE'); return false; }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  glProgram = program;
  gl.useProgram(program);
  const points = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, points);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  textureWidth = 1;
  textureHeight = 1;
  lastUploadedTime = -1;
  glContextLost = false;
  return true;
}
function setStatus(text) { statusEl.textContent = text.toUpperCase(); }
function setPictureFallback(active) {
  pictureFallback = active;
  canvas.hidden = active;
  compositeCanvas.hidden = !active;
  lastUploadedTime = -1;
  lastCompositePaused = null;
}
function fmt(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainder = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}` : `${minutes}:${String(remainder).padStart(2,'0')}`;
}
const SOUND_EFFECT_FILES = {
  knob: 'quick/clicking.wav', button: 'quick/button-click.wav', hum: 'crt-hum-loop.wav',
  startup: 'quick/startup-chiptune.wav', powerOn: 'quick/crt-poweronanddegause.wav',
  vhsEject: 'quick/vhs-eject.wav', vhsInsert: 'quick/vhs-insert.wav', crtCutoff: 'quick/crt-poweroff.wav'
};
function ensureSoundEffectsAudioGraph() {
  if (soundEffectsAudioContext) return true;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return false;
  try {
    const context = new AudioContextType();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    limiter.connect(context.destination);
    staticPictureSource = context.createMediaElementSource(staticPicture);
    staticPictureGain = context.createGain();
    staticPictureGain.gain.value = 0;
    staticPictureSource.connect(staticPictureGain);
    staticPictureGain.connect(limiter);
    staticPicture.volume = 1;
    staticPicture.muted = false;
    soundEffectsAudioContext = context;
    soundEffectsLimiter = limiter;
    if (activeAudioOutputId !== 'default') {
      void routeContextToOutput(context, activeAudioOutputId).catch(error => {
        void setAudioOutputDevice('default', false, false);
        setStatus('OUTPUT DEVICE UNAVAILABLE · USING SYSTEM DEFAULT');
        console.warn('Sound-effects output routing failed; using system default', error);
      });
    }
    return true;
  } catch (error) {
    console.warn('Sound effects gain stage could not start; using standard media volume', error);
    return false;
  }
}
function soundEffectLevel(multiplier = 1) {
  return soundEffectsEnabled ? Math.max(0, Math.min(4, soundEffectsVolume / 100 * multiplier)) : 0;
}
function updateSoundEffectOutput(key) {
  const audio = soundEffectAudio.get(key);
  if (!audio) return;
  const level = soundEffectLevel(Number(audio.dataset.level || 1));
  const gain = soundEffectGainNodes.get(key);
  if (gain && soundEffectsAudioContext) {
    gain.gain.setTargetAtTime(level, soundEffectsAudioContext.currentTime, 0.025);
    audio.volume = 1;
  } else {
    audio.volume = Math.min(1, level);
  }
}
function resumeSoundEffectsAudioContext() {
  if (!soundEffectsAudioContext || soundEffectsAudioContext.state === 'running') return Promise.resolve();
  return soundEffectsAudioContext.resume().catch(error => {
    console.warn('Sound effects audio context did not resume', error);
  });
}
function primeSoundEffects() {
  ensureSoundEffectsAudioGraph();
  for (const [key, file] of Object.entries(SOUND_EFFECT_FILES)) {
    const audio = new Audio(`saturday://app/assets/audio/${file}`);
    audio.preload = 'auto';
    audio.loop = key === 'hum' || key === 'static';
    audio.addEventListener('error', () => console.warn(`Sound effect could not be preloaded: ${file}; media error ${audio.error?.code || 'unknown'}`));
    soundEffectAudio.set(key, audio);
    if (soundEffectsAudioContext && soundEffectsLimiter) {
      try {
        const source = soundEffectsAudioContext.createMediaElementSource(audio);
        const gain = soundEffectsAudioContext.createGain();
        source.connect(gain);
        gain.connect(soundEffectsLimiter);
        soundEffectGainNodes.set(key, gain);
      } catch (error) {
        console.warn(`Sound effect gain routing failed for ${file}`, error);
      }
    }
    audio.load();
  }
}
function playSoundEffect(key, { loop = false, level = 1, restart = true } = {}) {
  const audio = soundEffectAudio.get(key);
  if (!audio || !soundEffectsEnabled || soundEffectsVolume <= 0) return null;
  const playToken = (soundEffectPlayTokens.get(key) || 0) + 1;
  soundEffectPlayTokens.set(key, playToken);
  audio.dataset.level = String(level);
  audio.loop = loop;
  updateSoundEffectOutput(key);
  if (restart) {
    audio.pause();
    audio.currentTime = 0;
  }
  resumeSoundEffectsAudioContext().then(() => {
    if (soundEffectPlayTokens.get(key) !== playToken || !soundEffectsEnabled || soundEffectsVolume <= 0) return;
    return audio.play();
  }).catch(error => console.warn(`Sound effect did not start (${key})`, error));
  return audio;
}
function stopSoundEffect(key) {
  const audio = soundEffectAudio.get(key);
  if (!audio) return;
  soundEffectPlayTokens.set(key, (soundEffectPlayTokens.get(key) || 0) + 1);
  audio.pause();
  audio.currentTime = 0;
}
function setLoopingSoundEffect(key, active, level) {
  const audio = soundEffectAudio.get(key);
  if (!audio) return;
  if (!active || !soundEffectsEnabled || soundEffectsVolume <= 0) {
    stopSoundEffect(key);
    return;
  }
  audio.loop = true;
  audio.dataset.level = String(level);
  updateSoundEffectOutput(key);
  if (audio.paused) playSoundEffect(key, { loop: true, level, restart: false });
}
function syncStaticPictureAudio() {
  const level = (selectedInput === 'static' || transitionStatic) && soundEffectsEnabled
    ? Math.max(0, Math.min(4, soundEffectsVolume / 100 * 0.45)) : 0;
  if (staticPictureGain && soundEffectsAudioContext) {
    staticPicture.muted = false;
    staticPicture.volume = 1;
    staticPictureGain.gain.setTargetAtTime(level, soundEffectsAudioContext.currentTime, 0.025);
  } else {
    staticPicture.volume = Math.min(1, level);
    staticPicture.muted = level === 0;
  }
}
function syncLoopingSoundEffects() {
  const playingHum = hasVideo && !video.paused && !shuttingOff && selectedAudioEffect === 'hum' && audioFiltersEnabled;
  const humLevel = 0.35 * (0.35 + 0.65 * dialValue(fxAmountDial) / 100);
  setLoopingSoundEffect('hum', playingHum, humLevel);
  syncStaticPictureAudio();
}
function syncSoundControls() {
  soundEffectsVolumeControl.value = String(soundEffectsVolume);
  soundEffectsReadout.value = `${soundEffectsVolume}%`;
  soundEffectsReadout.textContent = `${soundEffectsVolume}%`;
  soundEffectsToggle.classList.toggle('on', soundEffectsEnabled);
  soundEffectsToggle.setAttribute('aria-pressed', String(soundEffectsEnabled));
  soundEffectsToggle.setAttribute('aria-label', `Turn sound effects ${soundEffectsEnabled ? 'off' : 'on'}`);
  for (const [key, audio] of soundEffectAudio) {
    if (!soundEffectsEnabled) stopSoundEffect(key);
    updateSoundEffectOutput(key);
  }
  syncStaticPictureAudio();
  if (soundEffectsEnabled) syncLoopingSoundEffects();
}
function startStartupSequence() {
  shuttingOff = false;
  pendingStartupShutoff = false;
  startupIntroActive = true;
  stage.classList.remove('shutting-off');
  stage.classList.add('startup-intro', 'booting');
  playSoundEffect('powerOn');
  playSoundEffect('startup');
  window.setTimeout(() => {
    stage.classList.remove('booting');
    if (selectedInput === 'tv' && tvSearching && startupIntroActive) {
      startupIntroActive = false;
      stage.classList.remove('startup-intro');
      lastRenderedSource = null;
      lastCompositeHasFrame = false;
      lastCompositePaused = null;
      setTVSearching(true);
    }
    if (pendingStartupShutoff) {
      pendingStartupShutoff = false;
      shutOffPicture();
    }
  }, 1500);
}
const AUDIO_EFFECTS = {
  clean: { label: 'CLEAN', highpass: 18, lowpass: 22000, peak: 0, peakHz: 1800, drive: 0, delay: 0, wow: 0, hum: 0, noise: 0, mix: 0 },
  vhs: { label: 'VHS', highpass: 48, lowpass: 9200, peak: -2.5, peakHz: 2600, drive: 0.12, delay: 0.004, wow: 0.00035, hum: 0, noise: 0.0015, mix: 0.86 },
  hum: { label: 'CATHODE HUM', highpass: 22, lowpass: 11000, peak: 1.5, peakHz: 120, drive: 0, delay: 0, wow: 0, hum: 0, noise: 0, mix: 0.72 },
  am: { label: 'AM RADIO', highpass: 360, lowpass: 3400, peak: 3, peakHz: 1250, drive: 0.2, delay: 0, wow: 0, hum: 0, noise: 0.007, mix: 0.9 },
  lofi: { label: 'LO-FI', highpass: 90, lowpass: 5900, peak: -1, peakHz: 1700, drive: 0.24, delay: 0.002, wow: 0, hum: 0, noise: 0.001, mix: 0.86 },
  wow: { label: 'TAPE WOBBLE', highpass: 45, lowpass: 10500, peak: 0, peakHz: 1000, drive: 0.05, delay: 0.012, wow: 0.0032, hum: 0, noise: 0.002, mix: 0.78 }
};
function makeDriveCurve(amount) {
  if (!amount) return null;
  const curve = new Float32Array(1024);
  const drive = 1 + amount * 18;
  const ceiling = Math.tanh(drive);
  for (let i = 0; i < curve.length; i += 1) {
    const input = i * 2 / (curve.length - 1) - 1;
    curve[i] = Math.tanh(input * drive) / ceiling;
  }
  return curve;
}
function smoothAudioParam(param, value) {
  if (!param || !audioContext) return;
  const now = audioContext.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, 0.045);
}
async function routeContextToOutput(context, deviceId) {
  if (!context) return true;
  if (typeof context.setSinkId !== 'function') {
    if (deviceId === 'default') return true;
    throw new Error('This Electron build cannot select audio output devices.');
  }
  if (deviceId !== 'default') return context.setSinkId(deviceId);
  try { await context.setSinkId(''); }
  catch { await context.setSinkId('default'); }
  return true;
}
function refreshAudioOutputOptions(unavailable = false) {
  audioOutputSelect.replaceChildren(new Option(unavailable ? 'System default · saved device unavailable' : 'System default', 'default'));
  for (const device of audioOutputDevices) {
    if (!device.deviceId || device.deviceId === 'default') continue;
    audioOutputSelect.add(new Option(device.label || `Audio output ${audioOutputSelect.options.length}`, device.deviceId));
  }
  audioOutputSelect.add(new Option('Choose output device…', 'choose'));
  audioOutputSelect.value = activeAudioOutputId;
  if (!audioOutputSelect.value) audioOutputSelect.value = 'default';
}
async function setAudioOutputDevice(deviceId, persist = true, remember = true) {
  const target = deviceId || 'default';
  const contexts = [audioContext, soundEffectsAudioContext].filter(Boolean);
  try {
    await Promise.all(contexts.map(context => routeContextToOutput(context, target)));
    activeAudioOutputId = target;
    if (remember) preferredAudioOutputId = target;
    refreshAudioOutputOptions(false);
    if (persist) saveControlPreferences();
    return true;
  } catch (error) {
    const fallbackResults = await Promise.allSettled(contexts.map(context => routeContextToOutput(context, 'default')));
    activeAudioOutputId = 'default';
    if (persist && remember) {
      preferredAudioOutputId = 'default';
      saveControlPreferences();
    }
    refreshAudioOutputOptions(target !== 'default');
    setStatus('OUTPUT DEVICE UNAVAILABLE · USING SYSTEM DEFAULT');
    if (fallbackResults.some(result => result.status === 'rejected')) {
      console.warn('The system-default audio output could not be confirmed', fallbackResults);
    }
    console.warn('Audio output routing failed; playback remains on system default', error);
    return false;
  }
}
async function refreshAudioOutputDevices() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.enumerateDevices) {
    audioOutputDevices = [];
    await setAudioOutputDevice('default', false, false);
    refreshAudioOutputOptions(preferredAudioOutputId !== 'default');
    return;
  }
  try {
    audioOutputDevices = (await mediaDevices.enumerateDevices()).filter(device => device.kind === 'audiooutput');
  } catch (error) {
    audioOutputDevices = [];
    console.warn('Available audio outputs could not be listed', error);
  }
  const savedDeviceAvailable = preferredAudioOutputId === 'default'
    || audioOutputDevices.some(device => device.deviceId === preferredAudioOutputId);
  if (savedDeviceAvailable) {
    if (activeAudioOutputId !== preferredAudioOutputId) {
      await setAudioOutputDevice(preferredAudioOutputId, false, false);
    } else {
      refreshAudioOutputOptions(false);
    }
  } else {
    await setAudioOutputDevice('default', false, false);
    refreshAudioOutputOptions(true);
  }
}
async function chooseAudioOutput() {
  const selectOutput = navigator.mediaDevices?.selectAudioOutput;
  if (typeof selectOutput !== 'function') {
    refreshAudioOutputOptions(preferredAudioOutputId !== 'default');
    setStatus('USE SYSTEM DEFAULT · DEVICE PICKER UNAVAILABLE');
    return;
  }
  try {
    const chosen = await selectOutput.call(navigator.mediaDevices);
    if (!chosen?.deviceId) return refreshAudioOutputOptions(preferredAudioOutputId !== 'default');
    if (!audioOutputDevices.some(device => device.deviceId === chosen.deviceId)) audioOutputDevices.push(chosen);
    await setAudioOutputDevice(chosen.deviceId);
  } catch (error) {
    refreshAudioOutputOptions(preferredAudioOutputId !== 'default');
    console.warn('Audio output device was not selected', error);
  }
}
function setMasterVolume() {
  const volume = dialValue(videoDial) / 100;
  video.defaultMuted = false;
  if (masterGain) {
    video.volume = 1;
    video.muted = false;
    smoothAudioParam(masterGain.gain, volume);
  } else {
    video.volume = volume;
    video.muted = false;
  }
}
function needsAudioEffectGraph() {
  return audioFiltersEnabled && selectedAudioEffect !== 'clean';
}
function ensureAudioGraph() {
  if (audioGraphFailed) return false;
  if (audioContext) return true;
  if (!needsAudioEffectGraph()) return false;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return false;
  try {
    audioContext = new AudioContextType();
    mediaSource = audioContext.createMediaElementSource(video);
    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();
    masterGain = audioContext.createGain();
    effectHighpass = audioContext.createBiquadFilter();
    effectHighpass.type = 'highpass';
    effectLowpass = audioContext.createBiquadFilter();
    effectLowpass.type = 'lowpass';
    effectPeak = audioContext.createBiquadFilter();
    effectPeak.type = 'peaking';
    effectDrive = audioContext.createWaveShaper();
    effectDrive.oversample = '2x';
    effectDelay = audioContext.createDelay(0.05);
    const wowOscillator = audioContext.createOscillator();
    wowOscillator.frequency.value = 0.72;
    wowLfoGain = audioContext.createGain();
    wowLfoGain.gain.value = 0;
    wowOscillator.connect(wowLfoGain);
    wowLfoGain.connect(effectDelay.delayTime);
    wowOscillator.start();

    const humOscillator = audioContext.createOscillator();
    humOscillator.type = 'sine';
    humOscillator.frequency.value = 60;
    humGain = audioContext.createGain();
    humGain.gain.value = 0;
    humOscillator.connect(humGain);
    humGain.connect(masterGain);
    humOscillator.start();

    const noiseBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.8), audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    const noiseBand = audioContext.createBiquadFilter();
    noiseBand.type = 'bandpass';
    noiseBand.frequency.value = 1800;
    noiseBand.Q.value = 0.7;
    staticGain = audioContext.createGain();
    staticGain.gain.value = 0;
    noiseSource.connect(noiseBand);
    noiseBand.connect(staticGain);
    staticGain.connect(masterGain);
    noiseSource.start();

    mediaSource.connect(dryGain);
    dryGain.connect(masterGain);
    mediaSource.connect(effectHighpass);
    effectHighpass.connect(effectLowpass);
    effectLowpass.connect(effectPeak);
    effectPeak.connect(effectDrive);
    effectDrive.connect(effectDelay);
    effectDelay.connect(wetGain);
    wetGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
    if (activeAudioOutputId !== 'default') {
      routeContextToOutput(audioContext, activeAudioOutputId).catch(error => {
        void setAudioOutputDevice('default', false, false);
        setStatus('OUTPUT DEVICE UNAVAILABLE · USING SYSTEM DEFAULT');
        console.warn('Movie output routing failed; using system default', error);
      });
    }
    video.volume = 1;
    video.muted = false;
    applyAudioEffect(false);
    setMasterVolume();
    return true;
  } catch (error) {
    audioGraphFailed = true;
    if (mediaSource && audioContext) {
      try {
        mediaSource.disconnect();
        humGain?.disconnect();
        staticGain?.disconnect();
        const cleanOutput = audioContext.createGain();
        cleanOutput.gain.value = dialValue(videoDial) / 100;
        cleanOutput.connect(audioContext.destination);
        mediaSource.connect(cleanOutput);
        masterGain = cleanOutput;
        video.volume = 1;
        video.muted = false;
      } catch (fallbackError) {
        console.error('Clean playback fallback could not be connected', fallbackError);
      }
    }
    console.error('Audio effect chain could not start', error);
    setStatus('AUDIO FX UNAVAILABLE · CLEAN PLAYBACK REMAINS');
    return false;
  }
}
async function unlockPlaybackAudio() {
  ensureAudioGraph();
  video.defaultMuted = false;
  video.muted = false;
  setMasterVolume();
  if (audioContext && audioContext.state !== 'running') {
    try { await audioContext.resume(); }
    catch (error) { console.warn('Playback audio context did not resume', error); }
  }
  return !audioContext || audioContext.state === 'running';
}
async function startVideoPlayback() {
  await unlockPlaybackAudio();
  video.defaultMuted = false;
  video.muted = false;
  setMasterVolume();
  return video.play();
}
function applyAudioEffect(save = true) {
  const preset = AUDIO_EFFECTS[selectedAudioEffect] || AUDIO_EFFECTS.clean;
  const mix = !audioFiltersEnabled || selectedAudioEffect === 'clean' ? 0 : dialValue(fxAmountDial) / 100 * preset.mix;
  audioEffectSelect.value = selectedAudioEffect;
  if (save && needsAudioEffectGraph() && !audioContext) ensureAudioGraph();
  if (save && audioContext?.state === 'suspended') audioContext.resume().catch(error => console.warn('Playback audio context did not resume', error));
  if (effectHighpass && !audioGraphFailed) {
    smoothAudioParam(effectHighpass.frequency, preset.highpass);
    smoothAudioParam(effectLowpass.frequency, preset.lowpass);
    smoothAudioParam(effectPeak.frequency, preset.peakHz);
    smoothAudioParam(effectPeak.gain, preset.peak * mix);
    effectDrive.curve = makeDriveCurve(preset.drive * mix);
    smoothAudioParam(effectDelay.delayTime, preset.delay);
    smoothAudioParam(wowLfoGain.gain, preset.wow * mix);
    smoothAudioParam(dryGain.gain, 1 - mix);
    smoothAudioParam(wetGain.gain, mix);
    const playing = hasVideo && !video.paused ? 1 : 0;
    smoothAudioParam(humGain.gain, preset.hum * mix * playing);
    smoothAudioParam(staticGain.gain, preset.noise * mix * playing);
  }
  syncLoopingSoundEffects();
  if (save) saveControlPreferences();
}
function setAudioEffect(name, save = true) {
  selectedAudioEffect = Object.hasOwn(AUDIO_EFFECTS, name) ? name : 'clean';
  audioEffectSelect.value = selectedAudioEffect;
  applyAudioEffect(save);
}
function setFinish(name, save = true) {
  if (!['wood', 'grey', 'black', 'clear'].includes(name)) return;
  currentFinish = name;
  document.body.dataset.finish = name;
  tvSet.dataset.finish = name;
  finishButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.finish === name)));
  if (save) saveControlPreferences();
}
function setCabinetTint(value, save = true) {
  if (!/^#[\da-f]{6}$/i.test(String(value || ''))) return;
  cabinetTint = value.toLowerCase();
  cabinetTintInput.value = cabinetTint;
  tvSet.style.setProperty('--cabinet-tint', cabinetTint);
  document.body.style.setProperty('--cabinet-tint', cabinetTint);
  if (save) saveControlPreferences();
}
function saveControlPreferences() {
  try {
    localStorage.setItem(CONTROLS_KEY, JSON.stringify({
      dials: Object.fromEntries(allDials.map(dial => [dial.id, dialValue(dial)])),
      effect: selectedAudioEffect,
      finish: currentFinish,
      cabinetTint,
      pictureFiltersEnabled,
      audioFiltersEnabled,
      pictureMode: selectedPictureMode,
      displayMode,
      input: selectedInput,
      soundEffectsEnabled,
      soundEffectsVolume,
      activePlaylistId,
      audioOutputId: preferredAudioOutputId
    }));
  } catch (error) { console.warn('Control preferences could not be saved', error); }
}
function restoreControlPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTROLS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    for (const dial of allDials) {
      const value = saved.dials?.[dial.id];
      if (Number.isFinite(value)) setDialValue(dial, value);
    }
    const legacyTints = { yellow: '#c49a32', red: '#b54642', green: '#39804d', blue: '#3e6caa' };
    const legacyFinish = ['yellow', 'red', 'green', 'blue'].includes(saved.finish) ? saved.finish : '';
    setFinish(legacyFinish ? 'wood' : saved.finish, false);
    setCabinetTint(saved.cabinetTint || legacyTints[legacyFinish] || cabinetTint, false);
    if (typeof saved.effect === 'string') setAudioEffect(saved.effect, false);
    if (typeof saved.pictureFiltersEnabled === 'boolean') pictureFiltersEnabled = saved.pictureFiltersEnabled;
    else if (typeof saved.videoFiltersEnabled === 'boolean' || typeof saved.tvFiltersEnabled === 'boolean') {
      pictureFiltersEnabled = saved.videoFiltersEnabled !== false && saved.tvFiltersEnabled !== false;
    }
    if (typeof saved.audioFiltersEnabled === 'boolean') audioFiltersEnabled = saved.audioFiltersEnabled;
    if (typeof saved.audioOutputId === 'string') preferredAudioOutputId = saved.audioOutputId;
    if (['color', 'lowstim', 'bw'].includes(saved.pictureMode)) selectedPictureMode = saved.pictureMode;
    if (['crt', 'rear'].includes(saved.displayMode)) displayMode = saved.displayMode;
    if (['video', 'static', 'tv'].includes(saved.input)) selectedInput = saved.input;
    if (typeof saved.soundEffectsEnabled === 'boolean') soundEffectsEnabled = saved.soundEffectsEnabled;
    if (Number.isFinite(saved.soundEffectsVolume)) soundEffectsVolume = Math.max(0, Math.min(400, Math.round(saved.soundEffectsVolume)));
    pictureModeSelect.value = selectedPictureMode;
    displayModeSelect.value = displayMode;
    syncBypassControls();
    syncSoundControls();
  } catch (error) { console.warn('Control preferences could not be restored', error); }
}
function syncBypassControls() {
  pictureBypassToggle.classList.toggle('on', !pictureFiltersEnabled);
  pictureBypassToggle.setAttribute('aria-pressed', String(!pictureFiltersEnabled));
  audioBypassToggle.classList.toggle('on', !audioFiltersEnabled);
  audioBypassToggle.setAttribute('aria-pressed', String(!audioFiltersEnabled));
  const modeLabel = pictureFiltersEnabled ? ({ color: 'COLOR', lowstim: 'LOWSTIM', bw: 'B&W' }[selectedPictureMode] || 'COLOR') : 'COLOR';
  const outputMode = selectedInput === 'static' ? 'STATIC' : selectedInput === 'tv' ? 'TV' : pictureFiltersEnabled && displayMode === 'rear' ? 'REAR PROJECTION' : 'CRT';
  const visibleInput = transitionStatic && transitionInput ? transitionInput : selectedInput;
  const previousVisibleInput = tvSet.dataset.input;
  tvSet.dataset.input = visibleInput;
  document.body.dataset.input = visibleInput;
  if (previousVisibleInput && previousVisibleInput !== visibleInput) lastRenderedSource = null;
  document.querySelector('#displayBadge').textContent = `${modeLabel} ${outputMode}`;
  inputButton.textContent = selectedInput === 'static' ? 'STATIC' : selectedInput === 'tv' ? 'TV' : 'VIDEO';
  inputButton.setAttribute('aria-pressed', String(selectedInput === 'static' || selectedInput === 'tv'));
  inputButton.setAttribute('aria-label', `Input is ${selectedInput.toUpperCase()}; cycle to the next input`);
  const pictureInput = tvSet.dataset.input || selectedInput;
  document.querySelector('#emptyState .empty-copy').hidden = pictureInput === 'tv';
  document.querySelector('#picture').setAttribute('aria-label', pictureInput === 'tv'
    ? 'CRT picture: A little Saturday magic.'
    : 'CRT picture: A little Saturday magic. Open the tape shelf from the VHS loader at right.');
}
function startStaticPicture() {
  if (!staticInputUrl) {
    setStatus('STATIC INPUT IS LOADING');
    return;
  }
  ensureSoundEffectsAudioGraph();
  syncStaticPictureAudio();
  resumeSoundEffectsAudioContext();
  staticPicture.play().catch(error => {
    console.warn('TV static picture/audio did not start', error);
    setStatus('STATIC INPUT COULD NOT PLAY');
  });
}
function pauseVideoForInputSwitch() {
  if (!hasVideo || video.paused) return;
  switchingTracks = true;
  video.pause();
  switchingTracks = false;
}
function setInputSource(source, save = true) {
  const next = ['static', 'tv'].includes(source) ? source : 'video';
  const previous = selectedInput;
  if (save && startupIntroActive) {
    startupIntroActive = false;
    stage.classList.remove('startup-intro');
  }
  if (next === previous && !transitionStatic) {
    if (next === 'tv') void startActiveChannel();
    return;
  }
  if (save) window.dispatchEvent(new Event('saturdayTube-input-changing'));
  channelTuneToken += 1;
  if (save) savePlaybackSession();

  if (next === 'static') {
    staticReturnInput = previous;
    resumeVideoAfterStatic = previous === 'video' && hasVideo && !video.paused;
    resumeTVAfterStatic = previous === 'tv' && hasVideo && !video.paused;
    pauseVideoForInputSwitch();
  } else if (previous === 'tv') {
    saveChannelPlaybackState();
    pauseVideoForInputSwitch();
  } else if (previous === 'video' && next === 'tv') {
    pauseVideoForInputSwitch();
  }

  const applyInput = () => {
    transitionStatic = false;
    transitionInput = '';
    selectedInput = next;
    setTVSearching(next === 'tv');
    if (next === 'tv' && previous !== 'tv') clearChannelVideoForInputChange();
    if (next === 'static') {
      stage.classList.add('static-channel');
      startStaticPicture();
    } else {
      stage.classList.remove('static-channel');
      staticPicture.pause();
      syncStaticPictureAudio();
      if (next === 'tv') {
        void startActiveChannel();
      } else if ((previous === 'tv') || (previous === 'static' && staticReturnInput === 'tv')) {
        clearChannelVideoForInputChange();
        void restoreManualVideoSession();
      } else if (previous === 'static' && resumeVideoAfterStatic && hasVideo) {
        startVideoPlayback().catch(() => {});
      }
      resumeVideoAfterStatic = false;
      resumeTVAfterStatic = false;
    }
    syncBypassControls();
    syncLoopingSoundEffects();
    renderPlaylist();
    if (save) {
      savePlaybackSession();
      saveControlPreferences();
    }
  };

  applyInput();
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}
function metadataKey(request) {
  const query = String(request?.query || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '');
  return [
    request?.mode === 'series' ? 'series' : 'title',
    query,
    /^\d{4}$/.test(String(request?.year || '')) ? request.year : '',
    /^\d{4}$/.test(String(request?.seriesYear || '')) ? request.seriesYear : '',
    String(request?.episodeCode || '').toUpperCase(),
    String(request?.episodeTitle || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '')
  ].filter(Boolean).join(':');
}
function setMetadataCacheEntry(key, entry) {
  metadataCache.delete(key);
  metadataCache.set(key, entry);
  while (metadataCache.size > MAX_METADATA_CACHE_ENTRIES) metadataCache.delete(metadataCache.keys().next().value);
}
function saveMetadataCache() {
  try {
    const entries = Array.from(metadataCache.entries()).slice(-MAX_METADATA_CACHE_ENTRIES);
    localStorage.setItem(METADATA_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (error) { console.warn('Local metadata cache could not be saved', error); }
}
function restoreMetadataCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(METADATA_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return;
    const now = Date.now();
    const valid = Object.entries(saved).filter(([, entry]) => {
      const ttl = entry?.value === null ? METADATA_MISS_TTL : METADATA_TTL;
      return entry && Number.isFinite(entry.at) && now - entry.at >= 0 && now - entry.at < ttl
        && (entry.value === null || (typeof entry.value === 'object' && typeof entry.value.title === 'string'));
    }).sort((left, right) => left[1].at - right[1].at).slice(-MAX_METADATA_CACHE_ENTRIES);
    for (const [key, entry] of valid) setMetadataCacheEntry(key, entry);
  } catch (error) { console.warn('Local metadata cache could not be read', error); }
}
function saveMetadataOverrides() {
  try {
    localStorage.setItem(METADATA_OVERRIDE_KEY, JSON.stringify(Object.fromEntries(metadataOverrides)));
  } catch (error) { console.warn('Manual tape labels could not be saved', error); }
}
function restoreMetadataOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(METADATA_OVERRIDE_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return;
    for (const [filePath, entry] of Object.entries(saved)) {
      if (entry && typeof entry.metadata?.title === 'string' && entry.metadata.title.trim()) metadataOverrides.set(filePath, entry);
    }
  } catch (error) { console.warn('Manual tape labels could not be restored', error); }
}
function setArtworkStatus(card, status, message, state) {
  if (status) {
    status.textContent = message;
    status.dataset.state = state;
  }
  if (card) card.setAttribute('aria-busy', String(state === 'loading'));
}
function renderMetadata(view, metadata) {
  const { note, cover, cassette, artworkStatus, card, parsed, item } = view;
  const lookupUnavailable = Boolean(metadata?.lookupUnavailable);
  view.metadata = metadata;
  view.renderToken += 1;
  note.classList.remove('is-loading');
  note.removeAttribute('aria-busy');
  if (lookupUnavailable) {
    note.textContent = 'Metadata lookup unavailable; the original filename is retained.';
    note.title = metadata.message || 'Try again when the connection is available.';
  } else if (metadata) {
    note.textContent = [metadata.title, metadata.year, metadata.source].filter(Boolean).join(' · ');
    note.title = metadata.detail || '';
  } else {
    note.textContent = 'No reliable match; the original filename is retained.';
    note.title = '';
  }
  const title = metadata?.title || parsed.displayTitle || parsed.query || item.name.replace(/\.[^.]+$/, '') || 'VIDEO TAPE';
  const mode = metadataOverrides.get(item.path)?.mode || parsed.mode;
  const subtitle = parsed.episodeCode
    ? [parsed.episodeCode, parsed.episodeTitle].filter(Boolean).join(' · ')
    : mode === 'series'
      ? (metadata?.year ? `Series · ${metadata.year}` : 'TV SERIES')
      : [metadata?.year || parsed.year].filter(Boolean).join('') || 'LOCAL TAPE';
  view.captionTitle.textContent = title;
  view.captionTitle.title = title;
  view.captionDetail.textContent = subtitle;
  view.captionDetail.title = subtitle;
  const technical = [
    `File: ${item.name}`,
    `Size: ${formatBytes(item.size) || 'unknown'}`,
    metadata?.source ? `Match source: ${metadata.source}` : '',
    metadata?.kind ? `Type: ${metadata.kind}` : '',
    metadata?.detail || ''
  ].filter(Boolean);
  view.technical.textContent = technical.join(' · ');
  if (!cover || !cassette) return;
  let safeImage = '';
  try {
    const parsedImage = new URL(metadata?.image || '');
    if (parsedImage.protocol === 'https:' && ['static.tvmaze.com', 'upload.wikimedia.org'].includes(parsedImage.hostname)) safeImage = parsedImage.href;
  } catch { /* Missing or untrusted artwork keeps the VHS illustration. */ }
  cover.dataset.renderToken = String(view.renderToken);
  if (lookupUnavailable) {
    cover.hidden = true;
    cover.removeAttribute('src');
    cover.removeAttribute('data-state');
    cassette.hidden = false;
    setArtworkStatus(card, artworkStatus, 'OFFLINE · RETRY WHEN ONLINE', 'error');
  } else if (safeImage) {
    cover.alt = `${metadata.title || 'Movie'} cover`;
    cover.dataset.state = 'loading';
    cover.hidden = false;
    cassette.hidden = false;
    setArtworkStatus(card, artworkStatus, 'LOADING COVER…', 'loading');
    cover.src = safeImage;
  } else {
    cover.removeAttribute('src');
    cover.removeAttribute('data-state');
    cover.hidden = true;
    cassette.hidden = false;
    setArtworkStatus(card, artworkStatus, metadata ? 'NO COVER ART' : 'NO EXACT MATCH · FILENAME KEPT', metadata ? 'fallback' : 'empty');
  }
}
function pumpMetadataQueue() {
  while (metadataActiveRequests < METADATA_CONCURRENCY && metadataQueue.length) {
    const job = metadataQueue.shift();
    metadataActiveRequests += 1;
    window.tube.lookupMetadata(job.request).catch(error => {
      console.warn('Internet metadata lookup failed', error);
      return { lookupUnavailable: true, message: String(error?.message || 'The title service could not be reached.') };
    }).then(metadata => {
      if (!metadata?.lookupUnavailable && job.cacheResult) {
        setMetadataCacheEntry(job.key, { at: Date.now(), value: metadata });
        saveMetadataCache();
      }
      job.resolve(metadata);
    }).finally(() => {
      metadataRequests.delete(job.key);
      metadataActiveRequests -= 1;
      updateLibraryActivity();
      pumpMetadataQueue();
    });
  }
}
function queueMetadataLookup(request, { force = false, cacheResult = true } = {}) {
  const key = metadataKey(request);
  if (!key || String(request?.query || '').trim().length < 2) return Promise.resolve(null);
  const cached = metadataCache.get(key);
  const ttl = cached?.value === null ? METADATA_MISS_TTL : METADATA_TTL;
  if (cached && Date.now() - cached.at >= 0 && Date.now() - cached.at < ttl) {
    if (!force) {
      setMetadataCacheEntry(key, cached);
      return Promise.resolve(cached.value);
    }
  } else if (cached) metadataCache.delete(key);
  if (metadataRequests.has(key)) return metadataRequests.get(key);
  const promise = new Promise(resolve => metadataQueue.push({ key, request: {
    query: String(request.query).trim(),
    year: String(request.year || ''),
    seriesYear: String(request.seriesYear || ''),
    mode: request.mode === 'series' ? 'series' : 'title',
    series: String(request.series || ''),
    episodeCode: String(request.episodeCode || ''),
    episodeTitle: String(request.episodeTitle || ''),
    displayTitle: String(request.displayTitle || request.query).trim()
  }, cacheResult, resolve }));
  metadataRequests.set(key, promise);
  updateLibraryActivity();
  pumpMetadataQueue();
  return promise;
}
function lookupLibraryMetadata(view) {
  const override = metadataOverrides.get(view.item.path);
  if (override?.metadata) {
    view.editorTitle.value = override.query || override.metadata.title;
    view.editorYear.value = override.year || override.metadata.year || '';
    view.editorMode.value = override.mode === 'series' ? 'series' : 'title';
    renderMetadata(view, override.metadata);
    return;
  }
  view.editorTitle.value = view.parsed.query || view.parsed.displayTitle || '';
  view.editorYear.value = view.parsed.year || '';
  view.editorMode.value = view.parsed.mode === 'series' ? 'series' : 'title';
  markMetadataLoading(view);
  setArtworkStatus(view.card, view.artworkStatus, 'LOOKING UP METADATA…', 'loading');
  queueMetadataLookup(view.parsed).then(metadata => {
    if (view.card.isConnected) renderMetadata(view, metadata);
  });
}
function libraryEmpty(title, detail) {
  const empty = document.createElement('div');
  empty.className = 'library-empty';
  const reel = document.createElement('span');
  reel.className = 'empty-reel';
  reel.textContent = '◉';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = detail;
  empty.append(reel, heading, copy);
  libraryShelves.replaceChildren(empty);
}
function drawLibraryBreadcrumbs() {
  libraryBreadcrumbs.replaceChildren();
  if (!libraryView) {
    const hint = document.createElement('span');
    hint.textContent = 'Choose a folder to start your shelves';
    libraryBreadcrumbs.append(hint);
    libraryUpButton.disabled = true;
    return;
  }
  const root = libraryView.root;
  const rootLabel = root.split('/').filter(Boolean).at(-1) || 'Macintosh HD';
  const addCrumb = (label, destination, current = false) => {
    const crumb = document.createElement('button');
    crumb.type = 'button';
    crumb.textContent = label;
    crumb.disabled = current;
    crumb.addEventListener('click', () => loadLibraryFolder(destination));
    libraryBreadcrumbs.append(crumb);
  };
  addCrumb(rootLabel, root, libraryView.current === root);
  const relative = libraryView.current.slice(root.length).split('/').filter(Boolean);
  let destination = root.replace(/\/$/, '');
  relative.forEach((segment, index) => {
    destination = `${destination}/${segment}` || '/';
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '›';
    libraryBreadcrumbs.append(separator);
    addCrumb(segment, destination, index === relative.length - 1);
  });
  libraryUpButton.disabled = libraryView.current === root;
}
function updateLibrarySelection() {
  const count = librarySelection.size;
  document.querySelector('#librarySelectionCount').textContent = count ? `${count} TAPE${count === 1 ? '' : 'S'} SELECTED · ADD TO PLAYLIST` : 'TAP A TAPE TO PLAY · SHIFT-TAP TO QUEUE';
  libraryAddButton.disabled = count === 0;
  libraryShelves.querySelectorAll('.library-tape[data-tape-path]').forEach(card => {
    const selected = librarySelection.has(card.dataset.tapePath);
    card.classList.toggle('selected', selected);
    card.querySelector('.library-tape-play')?.setAttribute('aria-pressed', String(selected));
  });
}
function makeLibraryCard(item, folder = false) {
  const card = document.createElement(folder ? 'button' : 'article');
  if (folder) card.type = 'button';
  card.className = folder ? 'library-folder-card' : 'library-tape';
  card.dataset.tapePath = item.path;
  if (folder) {
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '▰';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const note = document.createElement('small');
    note.textContent = 'OPEN SHELF';
    card.append(icon, name, note);
    card.addEventListener('click', () => loadLibraryFolder(item.path));
    return card;
  }
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'library-tape-play';
  play.setAttribute('aria-label', `Play ${item.name}`);
  play.setAttribute('aria-pressed', String(librarySelection.has(item.path)));
  const artwork = document.createElement('span');
  artwork.className = 'library-artwork-frame';
  const cassette = document.createElement('span');
  cassette.className = 'library-cassette';
  cassette.setAttribute('aria-hidden', 'true');
  const reels = document.createElement('i');
  const reelsRight = document.createElement('i');
  const cassetteLabel = document.createElement('b');
  const cassetteWordmark = document.createElement('span');
  cassetteWordmark.textContent = 'VHS VIDEO';
  cassetteLabel.append(cassetteWordmark);
  cassette.append(reels, reelsRight, cassetteLabel);
  const cover = document.createElement('img');
  cover.className = 'library-cover';
  cover.loading = 'lazy';
  cover.hidden = true;
  const name = document.createElement('strong');
  name.className = 'library-tape-name';
  const subtitle = document.createElement('small');
  subtitle.className = 'library-tape-subtitle';
  artwork.append(cassette, cover);
  play.append(artwork, name, subtitle);
  const note = document.createElement('span');
  note.className = 'library-metadata';
  note.setAttribute('role', 'status');
  const artworkStatus = document.createElement('span');
  artworkStatus.className = 'library-artwork-status';
  artworkStatus.setAttribute('aria-live', 'polite');
  const details = document.createElement('details');
  details.className = 'library-tape-info';
  const summary = document.createElement('summary');
  summary.textContent = 'INFO · MATCH';
  const panel = document.createElement('div');
  panel.className = 'library-tape-info-panel';
  const technical = document.createElement('p');
  technical.className = 'library-tape-technical';
  const editorTitle = document.createElement('input');
  editorTitle.type = 'text';
  editorTitle.maxLength = 100;
  editorTitle.autocomplete = 'off';
  editorTitle.setAttribute('aria-label', `Search title for ${item.name}`);
  const editorYear = document.createElement('input');
  editorYear.type = 'text';
  editorYear.inputMode = 'numeric';
  editorYear.maxLength = 4;
  editorYear.placeholder = 'Year (optional)';
  editorYear.setAttribute('aria-label', 'Release year, optional');
  const editorMode = document.createElement('select');
  editorMode.setAttribute('aria-label', 'Lookup type');
  editorMode.append(new Option('Movie / title', 'title'), new Option('TV series', 'series'));
  const searchButton = document.createElement('button');
  searchButton.type = 'button';
  searchButton.textContent = 'FIND EXACT';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'SAVE LABEL';
  const autoButton = document.createElement('button');
  autoButton.type = 'button';
  autoButton.textContent = 'AUTO LOOKUP';
  const editor = document.createElement('div');
  editor.className = 'library-tape-editor';
  editor.append(editorTitle, editorYear, editorMode, searchButton, saveButton, autoButton);
  panel.append(technical, editor);
  details.append(summary, panel);
  card.append(play, artworkStatus, note, details);
  const view = {
    item, card, play, note, cover, cassette, artworkStatus, parsed: window.tube.parseMetadataFilename(item.name),
    captionTitle: name, captionDetail: subtitle, technical, editorTitle, editorYear, editorMode,
    renderToken: 0, manualLookupToken: 0, metadata: null
  };
  cover.addEventListener('load', () => {
    if (!cover.isConnected || cover.dataset.renderToken !== String(view.renderToken)) return;
    cover.dataset.state = 'ready';
    cassette.hidden = true;
    setArtworkStatus(card, artworkStatus, 'COVER READY', 'ready');
  });
  cover.addEventListener('error', () => {
    if (!cover.isConnected || cover.dataset.renderToken !== String(view.renderToken)) return;
    cover.hidden = true;
    cover.removeAttribute('src');
    cover.removeAttribute('data-state');
    cassette.hidden = false;
    setArtworkStatus(card, artworkStatus, 'COVER UNAVAILABLE · VHS LABEL SHOWN', 'error');
  });
  play.addEventListener('click', event => {
    if (event.shiftKey) {
      if (librarySelection.has(item.path)) librarySelection.delete(item.path);
      else librarySelection.add(item.path);
      updateLibrarySelection();
      return;
    }
    playLibraryTape(item);
  });
  searchButton.addEventListener('click', async () => {
    const query = editorTitle.value.trim();
    const year = editorYear.value.trim();
    if (query.length < 2 || (year && !/^\d{4}$/.test(year))) {
      technical.textContent = 'Enter a title of at least two characters and an optional four-digit year.';
      return;
    }
    const token = ++view.manualLookupToken;
    const request = { query, year, mode: editorMode.value === 'series' ? 'series' : 'title' };
    setArtworkStatus(card, artworkStatus, 'CHECKING EXACT MATCH…', 'loading');
    technical.textContent = `Checking an exact ${request.mode === 'series' ? 'series' : 'title'} match for “${query}”…`;
    const match = await queueMetadataLookup(request, { force: true, cacheResult: false });
    if (!card.isConnected || token !== view.manualLookupToken) return;
    if (match?.lookupUnavailable) {
      technical.textContent = `Lookup unavailable. The existing label was left unchanged. ${match.message || ''}`.trim();
      setArtworkStatus(card, artworkStatus, 'OFFLINE · EXISTING LABEL KEPT', 'error');
    } else if (!match) {
      technical.textContent = `No exact match for “${query}”. The current tape label and artwork were left unchanged.`;
      setArtworkStatus(card, artworkStatus, 'NO EXACT MATCH · EXISTING LABEL KEPT', 'fallback');
    } else {
      metadataOverrides.set(item.path, { query, year, mode: request.mode, metadata: match, updatedAt: Date.now() });
      saveMetadataOverrides();
      renderMetadata(view, match);
    }
  });
  saveButton.addEventListener('click', () => {
    const query = editorTitle.value.trim();
    const year = editorYear.value.trim();
    if (query.length < 2 || (year && !/^\d{4}$/.test(year))) {
      technical.textContent = 'Enter a title of at least two characters and an optional four-digit year.';
      return;
    }
    view.manualLookupToken += 1;
    const metadata = { title: query, year, kind: 'Manual label', detail: '', image: '', source: 'Manual label', url: '' };
    metadataOverrides.set(item.path, { query, year, mode: editorMode.value === 'series' ? 'series' : 'title', metadata, updatedAt: Date.now() });
    saveMetadataOverrides();
    renderMetadata(view, metadata);
  });
  autoButton.addEventListener('click', () => {
    view.manualLookupToken += 1;
    metadataOverrides.delete(item.path);
    saveMetadataOverrides();
    metadataCache.delete(metadataKey(view.parsed));
    saveMetadataCache();
    lookupLibraryMetadata(view);
  });
  lookupLibraryMetadata(view);
  return card;
}
function addLibraryShelf(title, items, folder = false) {
  if (!items.length) return;
  const section = document.createElement('section');
  section.className = 'library-shelf';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const row = document.createElement('div');
  row.className = 'library-shelf-row';
  items.forEach(item => row.append(makeLibraryCard(item, folder)));
  section.append(heading, row);
  libraryShelves.append(section);
}
function renderLibrary() {
  drawLibraryBreadcrumbs();
  if (!libraryView) {
    libraryDestination.textContent = 'LOCAL MAC SHELF · ORIGINALS KEPT';
    libraryDestination.title = 'Adding a tape makes an app-managed local copy; source files are kept.';
    document.querySelector('#libraryCount').textContent = 'SHELVES EMPTY';
    libraryEmpty('THE SHELVES ARE WAITING', 'Set a destination on this Mac. Imports are safely copied there and stay on your shelf after restart.');
    updateLibrarySelection();
    return;
  }
  const rootLabel = libraryView.root.split('/').filter(Boolean).at(-1) || 'LOCAL SHELF';
  libraryDestination.textContent = `SHELF: ${rootLabel} · LOCAL COPIES ON THIS MAC`;
  libraryDestination.title = `${libraryView.root} · Adding tapes copies them into Saturday Tube local storage.`;
  const query = librarySearch.value.trim().toLocaleLowerCase();
  const directories = libraryView.directories.filter(item => item.name.toLocaleLowerCase().includes(query));
  const files = libraryView.files.filter(item => item.name.toLocaleLowerCase().includes(query));
  const omitted = libraryView.omitted ? ` · ${libraryView.omitted} MORE IN THIS FOLDER` : '';
  document.querySelector('#libraryCount').textContent = `${files.length} TAPE${files.length === 1 ? '' : 'S'}${omitted}`;
  libraryShelves.replaceChildren();
  addLibraryShelf('FOLDERS · OPEN A SHELF', directories, true);
  addLibraryShelf('TAPES · SELECT ONE OR MORE', files);
  if (!directories.length && !files.length) {
    libraryEmpty(query ? 'NO MATCHING TAPES' : 'NO PLAYABLE TAPES ON THIS SHELF', query ? 'Try another title or clear the search.' : 'Import tapes here, or choose a subfolder to browse.');
  }
  updateLibrarySelection();
}
async function loadLibraryFolder(folderPath) {
  try {
    const view = await window.tube.browseLibraryFolder(folderPath);
    libraryView = view;
    renderLibrary();
    setStatus(`${view.files.length} LOCAL TAPES INDEXED`);
  } catch (error) {
    console.error('Tape shelf could not be opened', error);
    libraryEmpty('THIS SHELF WOULD NOT OPEN', error.message || 'Choose a different folder and try again.');
    setStatus('LOCAL SHELF COULD NOT OPEN');
  }
}
async function chooseLibraryFolder() {
  try {
    const root = await window.tube.chooseLibraryFolder();
    if (!root) return;
    localStorage.setItem(SHELF_KEY, root);
    librarySelection.clear();
    librarySearch.value = '';
    await loadLibraryFolder(root);
  } catch (error) {
    console.error('Tape shelf folder could not be chosen', error);
    libraryEmpty('FOLDER ACCESS FAILED', error.message || 'Try choosing the folder again.');
  }
}
async function restoreShelfRoot() {
  const savedRoot = localStorage.getItem(SHELF_KEY);
  try {
    const root = savedRoot
      ? await window.tube.restoreLibraryFolder(savedRoot)
      : await window.tube.getManagedTapeShelf();
    if (!root) throw new Error('The saved shelf is unavailable. Reconnect its drive or choose another folder.');
    if (!savedRoot) localStorage.setItem(SHELF_KEY, root);
    await loadLibraryFolder(root);
  } catch (error) {
    console.warn('Saved local shelf is not currently available', error);
    try {
      const root = await window.tube.getManagedTapeShelf();
      await loadLibraryFolder(root);
      setStatus('SAVED SHELF OFFLINE · LOCAL COPIES READY');
    } catch (fallbackError) {
      libraryView = null;
      renderLibrary();
      setStatus('LOCAL TAPE STORAGE UNAVAILABLE');
      console.error('Managed local tape shelf could not be restored', fallbackError);
    }
  }
}
async function focusManagedTapeShelf(root) {
  if (!root) return;
  try {
    const managedRoot = await window.tube.restoreLibraryFolder(root);
    localStorage.setItem(SHELF_KEY, managedRoot);
    await loadLibraryFolder(managedRoot);
  } catch (error) {
    console.warn('Managed local tape shelf could not be opened', error);
  }
}
async function openLibrary() {
  if (!libraryDialog.open) {
    libraryDialog.showModal();
    pauseFrameLoop();
  }
  if (shelfRestorePromise) await shelfRestorePromise;
  renderLibrary();
  librarySearch.focus();
}
function clearLibraryImportDismissTimer() {
  if (libraryImportDismissTimer !== null) {
    window.clearTimeout(libraryImportDismissTimer);
    libraryImportDismissTimer = null;
  }
}
function startLibraryImportProgress() {
  clearLibraryImportDismissTimer();
  libraryImportPanel.dataset.outcome = 'active';
  libraryImportRows.clear();
  libraryImportItems.replaceChildren();
  libraryImportTotal = 0;
  libraryImportCompleted = 0;
  libraryImportPanel.hidden = false;
  libraryImportPanel.setAttribute('aria-busy', 'true');
  libraryImportTitle.textContent = 'PREPARING TAPE IMPORT…';
  libraryImportSummary.textContent = 'Choose tapes to copy. Original files stay untouched.';
  libraryImportMeter.removeAttribute('value');
  libraryImportClear.disabled = true;
  libraryImportInProgress = true;
  libraryAddFileButton.disabled = true;
  updateLibraryActivity();
}
function makeLibraryImportRow(name, index) {
  const row = document.createElement('li');
  row.className = 'library-import-item';
  row.dataset.state = 'waiting';
  row.dataset.index = String(index);
  const filename = document.createElement('span');
  filename.className = 'library-import-name';
  filename.textContent = name;
  filename.title = name;
  const state = document.createElement('span');
  state.className = 'library-import-state';
  state.textContent = 'WAITING';
  const meter = document.createElement('progress');
  meter.max = 100;
  meter.value = 0;
  meter.setAttribute('aria-label', `${name} copy progress`);
  const detail = document.createElement('small');
  detail.className = 'library-import-error';
  row.append(filename, state, meter, detail);
  libraryImportItems.append(row);
  libraryImportRows.set(index, { row, filename, state, meter, detail });
}
function updateLibraryImportMeter(currentRatio = 0) {
  const total = Math.max(1, libraryImportTotal);
  libraryImportMeter.max = 100;
  libraryImportMeter.value = Math.min(100, Math.round((libraryImportCompleted + currentRatio) / total * 100));
}
function completeLibraryImportRow(event, state, label, detail = '') {
  const row = libraryImportRows.get(event.index);
  if (!row) return;
  if (!['copied', 'already', 'failed'].includes(row.row.dataset.state)) libraryImportCompleted += 1;
  row.row.dataset.state = state;
  row.state.textContent = label;
  row.state.title = detail || label;
  row.meter.value = state === 'failed' ? 0 : 100;
  row.detail.textContent = detail;
  updateLibraryImportMeter();
}
function updateLibraryImportProgress(progress) {
  if (!progress || typeof progress.phase !== 'string') return;
  libraryImportPanel.hidden = false;
  switch (progress.phase) {
    case 'choosing':
      libraryImportTitle.textContent = 'CHOOSE TAPES TO IMPORT';
      libraryImportSummary.textContent = 'Selected files will be copied; originals stay untouched.';
      libraryImportMeter.removeAttribute('value');
      break;
    case 'queued':
      libraryImportRows.clear();
      libraryImportItems.replaceChildren();
      libraryImportTotal = Math.max(0, Number(progress.total) || 0);
      libraryImportCompleted = 0;
      (progress.names || []).forEach((name, index) => makeLibraryImportRow(name, index));
      libraryImportTitle.textContent = `${libraryImportTotal} TAPE${libraryImportTotal === 1 ? '' : 'S'} READY TO COPY`;
      libraryImportSummary.textContent = 'Copying into your shelf; original files are unchanged.';
      libraryImportMeter.value = 0;
      libraryImportMeter.setAttribute('aria-valuetext', `0 of ${libraryImportTotal} tapes complete`);
      break;
    case 'copying': {
      const row = libraryImportRows.get(progress.index);
      if (row) {
        row.row.dataset.state = 'copying';
        row.state.textContent = 'COPYING…';
        row.detail.textContent = progress.bytesTotal ? `0 of ${formatBytes(progress.bytesTotal)}` : 'Starting safe copy…';
      }
      libraryImportTitle.textContent = `COPYING TAPE ${Number(progress.index) + 1} OF ${progress.total}`;
      libraryImportSummary.textContent = `${progress.name} · Original remains in place.`;
      updateLibraryImportMeter(0.04);
      break;
    }
    case 'copy-progress': {
      const row = libraryImportRows.get(progress.index);
      const bytesTotal = Number(progress.totalBytes) || 0;
      const copiedBytes = Math.max(0, Number(progress.copiedBytes) || 0);
      const ratio = bytesTotal ? Math.min(1, copiedBytes / bytesTotal) : 1;
      const percent = Math.round(ratio * 100);
      if (row) {
        row.row.dataset.state = 'copying';
        row.state.textContent = `${percent}%`;
        row.detail.textContent = `${formatBytes(copiedBytes)} of ${formatBytes(bytesTotal)}`;
        row.meter.value = percent;
      }
      libraryImportTitle.textContent = `COPYING TAPE ${Number(progress.index) + 1} OF ${progress.total}`;
      libraryImportSummary.textContent = `${progress.name} · ${percent}% copied`;
      updateLibraryImportMeter(ratio);
      break;
    }
    case 'copied':
      completeLibraryImportRow(progress, 'copied', 'COPIED');
      break;
    case 'already-on-shelf':
      completeLibraryImportRow(progress, 'already', 'ALREADY ON SHELF');
      break;
    case 'file-failed':
      completeLibraryImportRow(progress, 'failed', 'FAILED', progress.message || 'Could not copy this tape.');
      break;
    case 'finished':
      libraryImportTitle.textContent = progress.failed
        ? 'IMPORT FINISHED · SOME TAPES NEED ATTENTION'
        : 'IMPORT COMPLETE';
      libraryImportSummary.textContent = `${progress.copied || 0} copied · ${progress.alreadyOnShelf || 0} already on shelf · ${progress.failed || 0} failed`;
      libraryImportMeter.value = 100;
      libraryImportMeter.setAttribute('aria-valuetext', `All ${progress.total || 0} tapes processed`);
      libraryImportPanel.setAttribute('aria-busy', 'false');
      libraryImportClear.disabled = false;
      libraryImportInProgress = false;
      libraryAddFileButton.disabled = false;
      clearLibraryImportDismissTimer();
      libraryImportPanel.dataset.outcome = Number(progress.failed) > 0 ? 'attention' : 'success';
      updateLibraryActivity();
      if (Number(progress.failed) <= 0) {
        libraryImportDismissTimer = window.setTimeout(() => {
          libraryImportDismissTimer = null;
          if (libraryImportInProgress || libraryImportPanel.dataset.outcome !== 'success') return;
          libraryImportPanel.hidden = true;
          libraryImportItems.replaceChildren();
          libraryImportRows.clear();
        }, LIBRARY_IMPORT_SUCCESS_DISMISS_MS);
      }
      break;
    case 'cancelled':
      libraryImportTitle.textContent = 'IMPORT CANCELED';
      libraryImportSummary.textContent = 'No tapes were copied.';
      libraryImportMeter.value = 0;
      libraryImportPanel.setAttribute('aria-busy', 'false');
      libraryImportClear.disabled = false;
      libraryImportInProgress = false;
      libraryAddFileButton.disabled = false;
      updateLibraryActivity();
      break;
    case 'error':
      libraryImportTitle.textContent = 'IMPORT FAILED';
      libraryImportSummary.textContent = progress.message || 'Could not open the selected files. Try again.';
      libraryImportPanel.setAttribute('aria-busy', 'false');
      libraryImportClear.disabled = false;
      libraryImportInProgress = false;
      libraryAddFileButton.disabled = false;
      updateLibraryActivity();
      break;
    default:
      break;
  }
}
async function importTapesToShelf() {
  if (!libraryView?.root) {
    try {
      const root = await window.tube.getManagedTapeShelf();
      await loadLibraryFolder(root);
    } catch (error) {
      setStatus('LOCAL TAPE STORAGE UNAVAILABLE');
      libraryEmpty('LOCAL STORAGE UNAVAILABLE', error.message || 'Try again after checking Mac storage.');
      return;
    }
  }
  startLibraryImportProgress();
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const shelfRoot = libraryView.root;
    const result = await window.tube.importLibraryFiles();
    if (result?.files?.length) {
      librarySelection.clear();
      if (result.managedRoot) {
        localStorage.setItem(SHELF_KEY, result.managedRoot);
        await window.tube.restoreLibraryFolder(result.managedRoot);
      }
      await loadLibraryFolder(result.managedRoot || shelfRoot);
      const count = result.copied || 0;
      const reused = result.alreadyOnShelf || 0;
      const detail = result.failed?.length ? ` · ${result.failed.length} FAILED` : '';
      setStatus(`${count} NEW TAPE${count === 1 ? '' : 'S'} COPIED${reused ? ` · ${reused} ALREADY ON SHELF` : ''}${detail}`);
    } else if (result?.failed?.length) {
      setStatus(`${result.failed.length} TAPE${result.failed.length === 1 ? '' : 'S'} COULD NOT BE COPIED`);
    }
  } catch (error) {
    console.error('Selected videos could not be copied to the local shelf', error);
    const message = String(error?.message || 'Could not open the import dialog. Try again.').slice(0, 100);
    updateLibraryImportProgress({ phase: 'error', message });
    setStatus(message.slice(0, 70));
  } finally {
    if (libraryImportInProgress) {
      libraryImportInProgress = false;
      libraryAddFileButton.disabled = false;
      libraryImportPanel.setAttribute('aria-busy', 'false');
      libraryImportClear.disabled = false;
      updateLibraryActivity();
    }
  }
}
async function playLibraryTape(item) {
  try {
    const selected = await window.tube.openLibraryFiles([item.path]);
    if (!selected.length) {
      setStatus('TAPE MOVED OR NO LONGER AVAILABLE');
      return;
    }
    if (ejectingManagedPaths.has(selected[0].path)) {
      setStatus('TAPE IS BEING EJECTED');
      return;
    }
    await focusManagedTapeShelf(selected[0].managedRoot);
    let list = activePlaylist();
    if (!list) { createPlaylist(); list = activePlaylist(); }
    const index = list.tracks.length;
    list.tracks.push({ ...selected[0], unavailable: false });
    persistPlaylists();
    renderPlaylist();
    librarySelection.clear();
    libraryDialog.close();
    playTrack(index);
  } catch (error) {
    console.error('Selected tape could not be played', error);
    setStatus('COULD NOT LOAD THIS TAPE');
  }
}
async function addLibrarySelection() {
  try {
    const selected = await window.tube.openLibraryFiles(Array.from(librarySelection));
    if (!selected.length) {
      libraryEmpty('NO TAPES COULD BE ADDED', 'The files may have moved or the drive may have been disconnected.');
      return;
    }
    if (selected.some(track => ejectingManagedPaths.has(track.path))) {
      setStatus('TAPE IS BEING EJECTED');
      return;
    }
    await focusManagedTapeShelf(selected[0].managedRoot);
    let list = activePlaylist();
    if (!list) { createPlaylist(); list = activePlaylist(); }
    const firstIndex = list.tracks.length;
    list.tracks.push(...selected.map(track => ({ ...track, unavailable: false })));
    persistPlaylists();
    renderPlaylist();
    librarySelection.clear();
    libraryDialog.close();
    playTrack(firstIndex);
  } catch (error) {
    console.error('Selected tapes could not be added', error);
    setStatus('COULD NOT ADD SELECTED TAPES');
  }
}
function scheduleFrameLoop() {
  if (frameLoopRequest === null) frameLoopRequest = requestAnimationFrame(frameLoop);
}
function pauseFrameLoop() {
  if (frameLoopRequest === null) return;
  cancelAnimationFrame(frameLoopRequest);
  frameLoopRequest = null;
}
function drawIntroPicture(width, height) {
  const context = compositeContext;
  const centerX = width / 2;
  const centerY = height / 2;
  const glow = Math.max(2, height * 0.012);
  const titleSize = Math.max(14, Math.min(height * 0.052, width * 0.066));
  context.fillStyle = '#020503';
  context.fillRect(0, 0, width, height);
  const vignette = context.createRadialGradient(centerX, centerY * 0.9, height * 0.04, centerX, centerY, height * 0.78);
  vignette.addColorStop(0, '#102012');
  vignette.addColorStop(0.58, '#08110a');
  vignette.addColorStop(1, '#010201');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  const iconWidth = Math.min(width * 0.09, height * 0.145);
  const iconHeight = iconWidth * 0.72;
  const iconX = centerX - iconWidth / 2;
  const iconY = centerY - height * 0.155;
  context.save();
  context.shadowColor = '#a6ee8b';
  context.shadowBlur = glow * 2.2;
  context.strokeStyle = '#b5e999';
  context.lineWidth = Math.max(2, height * 0.005);
  context.beginPath();
  context.roundRect(iconX, iconY, iconWidth, iconHeight, Math.max(3, iconHeight * 0.22));
  context.stroke();
  context.fillStyle = '#e3ffd5';
  context.beginPath();
  context.moveTo(centerX - iconWidth * 0.09, iconY + iconHeight * 0.25);
  context.lineTo(centerX + iconWidth * 0.16, iconY + iconHeight * 0.5);
  context.lineTo(centerX - iconWidth * 0.09, iconY + iconHeight * 0.75);
  context.closePath();
  context.fill();
  context.restore();

  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `700 ${titleSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.shadowColor = '#c9efb7';
  context.shadowBlur = glow;
  context.fillStyle = '#ecf7e1';
  context.fillText('A LITTLE SATURDAY MAGIC', centerX, centerY + height * 0.015, width * 0.84);
  context.shadowBlur = Math.max(1, glow * 0.35);
  context.font = `500 ${Math.max(9, titleSize * 0.42)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillStyle = '#c0d0b7';
  if (selectedInput !== 'tv' && tvSet.dataset.input !== 'tv') {
    context.fillText('Open the tape shelf from the VHS loader at right', centerX, centerY + height * 0.09, width * 0.88);
  }
  context.restore();
}
function drawCornerOverlayText(text, side, width, height) {
  const fontSize = Math.max(18, Math.round(height * 0.055));
  const inset = Math.round(width * 0.10);
  const textTop = Math.round(height * 0.15);
  compositeContext.save();
  compositeContext.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  compositeContext.textBaseline = 'alphabetic';
  const measured = compositeContext.measureText(text);
  const baselineY = textTop + measured.actualBoundingBoxAscent;
  const textX = side === 'right' ? width - inset - measured.width : inset;
  compositeContext.shadowColor = '#e9f4d8cc';
  compositeContext.shadowBlur = Math.max(2, height * 0.008);
  compositeContext.fillStyle = '#f3f5e8';
  compositeContext.fillText(text, textX, baselineY);
  compositeContext.restore();
  return { fontSize, textX, baselineY, measured };
}
function drawPauseOverlay(width, height) {
  const { fontSize, textX, baselineY, measured } = drawCornerOverlayText('PAUSE', 'left', width, height);
  const gap = Math.max(3, Math.round(fontSize * 0.18));
  const barWidth = Math.max(3, Math.round(fontSize * 0.16));
  const barsX = textX + measured.width + gap;
  const barsY = baselineY - measured.actualBoundingBoxAscent;
  const barsHeight = Math.max(1, Math.ceil(measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent));
  compositeContext.save();
  compositeContext.shadowColor = '#e9f4d8cc';
  compositeContext.shadowBlur = Math.max(2, height * 0.008);
  compositeContext.fillStyle = '#f3f5e8';
  compositeContext.fillRect(barsX, barsY, barWidth, barsHeight);
  compositeContext.fillRect(barsX + barWidth + Math.max(2, Math.round(barWidth * 0.7)), barsY, barWidth, barsHeight);
  compositeContext.restore();
}
function drawFileExtensionOverlay(extension, width, height) {
  drawCornerOverlayText(extension, 'right', width, height);
}
function frameLoop(now) {
  frameLoopRequest = null;
  if (libraryDialog.open) return;
  scheduleFrameLoop();
  if (!compositeContext) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outputCanvas = pictureFallback || glContextLost || !gl || !glProgram ? compositeCanvas : canvas;
  const width = Math.max(1, Math.floor(outputCanvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(outputCanvas.clientHeight * dpr));
  const source = selectedInput === 'static' || transitionStatic
    ? (staticPicture.readyState >= 2 ? staticPicture : null)
    : (hasVideo && video.readyState >= 2 ? video : null);
  const sourceKey = source || `intro-${tvSet.dataset.input || selectedInput}`;
  const sourceTime = source ? source.currentTime : 0;
  const sourceWidth = source?.videoWidth || 0;
  const sourceHeight = source?.videoHeight || 0;
  const paused = selectedInput === 'video' && hasVideo && video.paused && !video.ended && !shuttingOff && !transitionStatic;
  const extension = visibleFileExtension;
  const dimensionsChanged = compositeCanvas.width !== width || compositeCanvas.height !== height;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  if (dimensionsChanged) { compositeCanvas.width = width; compositeCanvas.height = height; }
  const holdLastTVFrame = selectedInput === 'tv' && !source && lastCompositeHasFrame && !dimensionsChanged;
  const frameChanged = !holdLastTVFrame && (sourceKey !== lastRenderedSource || sourceTime !== lastUploadedTime
    || paused !== lastCompositePaused || extension !== lastRenderedExtension || dimensionsChanged);
  if (frameChanged) {
    compositeContext.fillStyle = '#070908';
    compositeContext.fillRect(0, 0, width, height);
    let hasPicture = false;
    if (source && sourceWidth > 0 && sourceHeight > 0) {
      const mediaAspect = sourceWidth / sourceHeight;
      const viewAspect = width / height;
      let x = 0, y = 0, viewWidth = width, viewHeight = height;
      if (mediaAspect > viewAspect) { viewHeight = Math.round(width / mediaAspect); y = Math.floor((height - viewHeight) / 2); }
      else { viewWidth = Math.round(height * mediaAspect); x = Math.floor((width - viewWidth) / 2); }
      compositeContext.drawImage(source, x, y, viewWidth, viewHeight);
      hasPicture = true;
    } else if (selectedInput !== 'tv' || startupIntroActive) {
      drawIntroPicture(width, height);
    }
    if (extension && hasPicture) drawFileExtensionOverlay(extension, width, height);
    if (paused) drawPauseOverlay(width, height);
    lastRenderedSource = sourceKey;
    lastRenderedExtension = extension;
    lastUploadedTime = sourceTime;
    lastCompositePaused = paused;
    lastCompositeHasFrame = hasPicture;
  }
  if (pictureFallback || glContextLost || !gl || !glProgram) return;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.025, 0.03, 0.025, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(glProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  try {
    if (textureWidth !== width || textureHeight !== height) {
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (width > maxTextureSize || height > maxTextureSize) {
        setStatus('VIDEO IS LARGER THAN THIS SET CAN DISPLAY');
        return;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, compositeCanvas);
      textureWidth = width;
      textureHeight = height;
    } else if (frameChanged) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, compositeCanvas);
    }
  } catch (error) {
    setPictureFallback(true);
    setStatus('PICTURE FALLBACK');
    console.error('CRT frame upload failed; using the 2D picture fallback', error);
    return;
  }
  gl.uniform1i(gl.getUniformLocation(glProgram, 'frame'), 0);
  gl.uniform2f(gl.getUniformLocation(glProgram, 'resolution'), width, height);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'time'), now / 1000);
  const isCRT = pictureFiltersEnabled && displayMode === 'crt';
  const tvScale = pictureFiltersEnabled ? 1 : 0;
  const videoScale = pictureFiltersEnabled ? 1 : 0;
  gl.uniform1f(gl.getUniformLocation(glProgram, 'strength'), isCRT ? dialValue(curveDial) / 100 * 0.075 : 0.0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'scan'), isCRT ? dialValue(scanlineDial) / 100 : 0.0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'edgeBlur'), tvScale * dialValue(edgeBlurDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'hueShift'), videoScale * dialValue(hueDial) / 100 + (1 - videoScale) * 0.5);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'vhsScan'), videoScale * dialValue(vhsScanDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'glitch'), videoScale * dialValue(glitchDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'broken'), videoScale * dialValue(brokenTapeDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'glow'), tvScale * dialValue(glowDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'glare'), tvScale * dialValue(glareDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'pictureMode'), videoScale ? ({ color: 0, lowstim: 1, bw: 2 }[selectedPictureMode] || 0) : 0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'rearProjection'), pictureFiltersEnabled && displayMode === 'rear' ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function activeChannel() { return channels.find(item => item.id === activeChannelId) || null; }
function recordChannelTuneMetric(stage, diagnostic = {}) {
  const metric = activeChannelTuneMetric;
  if (!metric || selectedInput !== 'tv' || activeChannelId !== metric.channelId || channelTuneToken !== metric.tuneToken) return;
  if (metric.reported.has(stage)) return;
  metric.reported.add(stage);
  const source = activePlaybackChannelId === metric.channelId && activePlaybackTuneToken === metric.tuneToken
    ? String(activePlaybackPath || '').split(/[\\/]/).pop().slice(0, 80)
    : '';
  window.tube.reportChannelTuneMetric?.({
    channel: metric.channelName,
    stage,
    elapsedMs: Math.max(0, Math.round(performance.now() - metric.startedAt)),
    ...(source ? { source } : {}),
    ...(stage === 'play-stalled' ? {
      readyState: Number(diagnostic.readyState) || 0,
      networkState: Number(diagnostic.networkState) || 0,
      errorCode: Number(diagnostic.errorCode) || 0,
      currentTime: Number.isFinite(Number(diagnostic.currentTime)) ? Number(diagnostic.currentTime) : 0,
      duration: Number.isFinite(Number(diagnostic.duration)) ? Number(diagnostic.duration) : 0
    } : {})
  });
}
function scheduleChannelPlaybackDiagnostic() {
  if (!isCurrentChannelPlayback()) return;
  const generation = playbackGeneration;
  const tuneToken = channelTuneToken;
  window.setTimeout(() => {
    if (generation !== playbackGeneration || tuneToken !== channelTuneToken || !isCurrentChannelPlayback()) return;
    if (!video.paused && video.readyState >= 2 && !video.error) return;
    recordChannelTuneMetric('play-stalled', {
      readyState: video.readyState,
      networkState: video.networkState,
      errorCode: video.error?.code || 0,
      currentTime: video.currentTime,
      duration: video.duration
    });
  }, 5000);
}
function channelOwnsPlaybackTrack(channel, track) {
  if (!channel || track?.channelMedia !== true || typeof track.path !== 'string') return false;
  if (track.channelAd === true || track.segmentType === 'commercial') {
    return channel.movieOnly !== true && (channel.commercials || []).some(item => item.path === track.path);
  }
  return (channel.shows || []).some(show => show.enabled !== false
    && !channel.disabledShowPaths?.includes(show.path)
    && (show.episodes || []).some(item => item.path === track.path));
}
function isCurrentPlaybackEvent() {
  return activePlaybackGeneration === playbackGeneration && Boolean(activePlaybackUrl)
    && video.getAttribute('src') === activePlaybackUrl;
}
function isCurrentChannelPlayback() {
  if (selectedInput !== 'tv' || !isCurrentPlaybackEvent()) return false;
  const channel = activeChannel();
  const track = channel?.queue?.[currentIndex];
  return channel?.id === activePlaybackChannelId && activePlaybackTuneToken === channelTuneToken
    && track?.path === activePlaybackPath && channelOwnsPlaybackTrack(channel, track);
}
function setTVSearching(active, delayMs = 0) {
  if (tvSearchingTimer) window.clearTimeout(tvSearchingTimer);
  tvSearchingTimer = null;
  if (active && delayMs > 0 && selectedInput === 'tv' && !tvSearching) {
    tvSearchingTimer = window.setTimeout(() => {
      tvSearchingTimer = null;
      tvSearching = selectedInput === 'tv';
      const showSearching = tvSearching && !startupIntroActive;
      const indicator = document.querySelector('#searchingIndicator');
      if (indicator) indicator.hidden = !showSearching;
      stage.classList.toggle('tv-loading', showSearching);
    }, delayMs);
    return;
  }
  tvSearching = Boolean(active && selectedInput === 'tv');
  const showSearching = tvSearching && !startupIntroActive;
  const indicator = document.querySelector('#searchingIndicator');
  if (indicator) indicator.hidden = !showSearching;
  stage.classList.toggle('tv-loading', showSearching);
}
function setScreenDialogBounds(dialog) {
  if (!dialog || !dialog.open) return;
  const stageRect = stage.getBoundingClientRect();
  const compactSettings = dialog === tvSettingsDialog;
  const anchor = compactSettings
    ? stageRect
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const width = compactSettings
    ? Math.max(240, Math.min(stageRect.width * 0.52, 500, window.innerWidth - 18))
    : Math.max(320, Math.min(window.innerWidth * 0.88, 1120, window.innerWidth - 24));
  const height = compactSettings
    ? Math.max(180, Math.min(stageRect.height * 0.72, 450, window.innerHeight - 18))
    : Math.max(240, Math.min(window.innerHeight * 0.86, 760, window.innerHeight - 24));
  dialog.style.left = `${Math.max(9, Math.min(window.innerWidth - width - 9, anchor.left + (anchor.width - width) / 2))}px`;
  dialog.style.top = `${Math.max(9, Math.min(window.innerHeight - height - 9, anchor.top + (anchor.height - height) / 2))}px`;
  dialog.style.width = `${width}px`;
  dialog.style.height = `${height}px`;
}
function showScreenDialog(dialog) {
  if (dialog.open) return;
  setScreenDialogBounds(dialog);
  dialog.showModal();
  setScreenDialogBounds(dialog);
}
function setupSettingsOverlays() {
  const videoPane = document.querySelector('#tvSettingsVideo');
  const audioPane = document.querySelector('#tvSettingsAudio');
  for (const id of ['scanlines', 'curve']) {
    const control = document.querySelector(`#${id}`)?.closest('.dial-control');
    if (control) videoPane.append(control);
  }
  const volumeControl = document.querySelector('#volume')?.closest('.dial-control');
  if (volumeControl) audioPane.append(volumeControl);
  videoPane.append(
    document.querySelector('.picture-control-group'),
    document.querySelector('.finish-panel'),
    document.querySelector('.signal-settings'),
    document.querySelector('.view-section')
  );
  audioPane.append(document.querySelector('.audio-control-group'));
  const inputControl = document.querySelector('.input-source-control');
  document.querySelector('.simple-tv-controls').after(inputControl);
  const audioOutputLabel = audioOutputSelect.closest('label');
  if (audioOutputLabel) audioPane.append(audioOutputLabel);
  for (const pane of [videoPane, audioPane]) pane.hidden = true;
  videoPane.hidden = false;
  for (const dial of tvSettingsDialog.querySelectorAll('.dial')) dial.classList.add('dial-bar');
}
function selectSettingsTab(name) {
  const selected = ['audio', 'video'].includes(name) ? name : 'video';
  for (const pane of document.querySelectorAll('.settings-pane')) pane.hidden = pane.id !== `tvSettings${selected[0].toUpperCase()}${selected.slice(1)}`;
  for (const button of document.querySelectorAll('[data-settings-tab]')) {
    if (button.dataset.settingsTab === selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
function activeChannelCommercials() { return selectedInput === 'tv' ? (activeChannel()?.movieOnly ? [] : (activeChannel()?.commercials || [])) : null; }
function activePlaylist() {
  if (selectedInput === 'tv') {
    const channel = activeChannel();
    return channel ? { id: `channel:${channel.id}`, name: channel.name, tracks: channel.queue || [] } : { id: 'channel:none', name: 'TV Channel', tracks: [] };
  }
  return playlists.find(item => item.id === activePlaylistId) || null;
}
function channelPlaybackSnapshot(channel, now = Date.now()) {
  if (!channel?.broadcast) return channel?.savedPlaybackState || null;
  const elapsedSeconds = broadcastElapsed(channel, now);
  const position = locateChannelSegment(channel, elapsedSeconds);
  const queue = (channel.queue || []).slice(0, MAX_SAVED_CHANNEL_QUEUE_ENTRIES).map(item => ({
    path: item.path,
    segmentType: item.segmentType === 'commercial' ? 'commercial' : 'program',
    durationSeconds: Number(item.durationSeconds) || 0,
    sourceStartSeconds: Number(item.sourceStartSeconds) || 0,
    sequence: Number.isFinite(Number(item.sequence)) ? Number(item.sequence) : 0,
    programSequence: Number.isFinite(Number(item.programSequence)) ? Number(item.programSequence) : 0,
    breakSequence: Number.isFinite(Number(item.breakSequence)) ? Number(item.breakSequence) : 0,
    adBreakPosition: Number.isFinite(Number(item.adBreakPosition)) ? Number(item.adBreakPosition) : 0,
    title: item.title || '',
    showName: item.showName || '',
    size: Number.isFinite(Number(item.size)) ? Number(item.size) : null,
    modified: Number.isFinite(Number(item.modified)) ? Number(item.modified) : null
  })).filter(item => typeof item.path === 'string' && item.durationSeconds > 0);
  const history = Object.entries(channel.playHistory || {})
    .sort((left, right) => (Number(left[1]?.lastPlayedAt) || 0) - (Number(right[1]?.lastPlayedAt) || 0))
    .slice(-MAX_SAVED_CHANNEL_HISTORY_ENTRIES);
  return {
    version: 2,
    rotation: channel.rotation || {},
    queue,
    elapsedSeconds,
    currentPosition: position ? {
      path: position.segment.path,
      segmentType: position.segment.segmentType,
      sequence: position.segment.sequence,
      programSequence: position.segment.programSequence || 0,
      breakSequence: position.segment.breakSequence || 0,
      adBreakPosition: position.segment.adBreakPosition || 0,
      sourceStartSeconds: Number(position.segment.sourceStartSeconds) || 0,
      offsetSeconds: position.offsetSeconds
    } : null,
    playHistory: Object.fromEntries(history),
    lastPlayedSequence: Number.isFinite(Number(channel.lastPlayedSequence)) ? channel.lastPlayedSequence : null,
    nextSequence: Math.max(0, Number(channel.nextSequence) || 0),
    nextProgrammeSequence: Math.max(0, Number(channel.nextProgrammeSequence) || 0)
  };
}
function persistChannels() {
  try {
    const now = Date.now();
    const stored = channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      abbreviation: channel.abbreviation || makeChannelAbbreviation(channel.name, channel.root),
      root: channel.root,
      movieOnly: channel.movieOnly === true,
      rotation: channel.rotation || {},
      playbackState: channelPlaybackSnapshot(channel, now),
      enabled: channel.enabled !== false,
      disabledShowPaths: Array.isArray(channel.disabledShowPaths) ? channel.disabledShowPaths : []
    }));
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(stored));
    localStorage.setItem('saturdayTube.activeChannel.v1', activeChannelId);
  } catch (error) { console.error('TV channels could not be saved', error); setStatus('TV CHANNEL SETTINGS COULD NOT BE SAVED'); }
}
function renderChannels() {
  const channel = activeChannel();
  rescanChannelButton.disabled = !channel || Boolean(channel.scanning) || !channelsStartupReady;
  if (channelSurfName) {
    channelSurfName.textContent = channel?.name || 'NO CHANNEL';
    channelSurfName.title = channel?.name || 'Add a TV channel folder to enable channel surfing.';
  }
  const hasSurfableChannel = channelsStartupReady && channels.some(item => item.enabled !== false && item.scanComplete && !item.error);
  if (channelDownButton) channelDownButton.disabled = !hasSurfableChannel;
  if (channelUpButton) channelUpButton.disabled = !hasSurfableChannel;
  channelStatus.textContent = !channelsStartupReady ? 'PREPARING TV CHANNELS…' : channel?.scanning ? 'SCANNING…' : channel?.error ? 'FOLDER OFFLINE' : channel && !channel.scanComplete ? 'READY TO SCAN' : channel
    ? channel.movieOnly
      ? `${channel.episodeCount || 0} MOVIES · BACK-TO-BACK · NO ADS`
      : `${channel.showCount || 0} SHOW${channel.showCount === 1 ? '' : 'S'} · ${channel.episodeCount || 0} EPS · ${channel.commercialCount || 0} ADS`
    : 'NO CHANNELS SET UP';
  channelRootPath.textContent = channel?.root || 'Choose a folder with one subfolder per show and an optional Commercials subfolder.';
  channelRootPath.title = channel?.root || '';
  channelSummary.textContent = channel?.error
    ? channel.error
    : channel?.movieOnly
      ? 'MOVIES ONLY · NO COMMERCIALS OR TRAILERS · FEATURES PLAY BACK-TO-BACK.'
      : channel?.showCount
        ? channel.enabled === false
          ? 'CHANNEL DISABLED · ENABLE IT IN THE TV GUIDE.'
          : (channel.commercialCount || 0) === 0
            ? 'NO APPROVED CHANNEL ADS · REQUIRED BREAKS CANNOT PLAY UNTIL ADS ARE ADDED.'
            : 'Episodes play in season and episode order, starting with the earliest available. A full commercial break follows every episode.'
        : channel
          ? 'No show episodes yet.'
          : 'Folders stay where they are; Saturday Tube reads episodes and channel-only commercials in place.';
  if (channelSetupNotice) {
    channelStatus.textContent = channelSetupNotice;
    channelSummary.textContent = 'Check folder access and try again.';
  }
}
function renderTVGuide() {
  tvGuidePageContent.replaceChildren();
  const spread = document.createElement('div');
  spread.className = 'guide-open-spread';
  const leftPage = document.createElement('section');
  leftPage.className = 'guide-book-page guide-page-left';
  leftPage.setAttribute('aria-label', 'Channel and show management');
  const rightPage = document.createElement('section');
  rightPage.className = 'guide-book-page guide-page-right';
  rightPage.setAttribute('aria-label', 'Live episode listings');
  if (!channels.length) {
    tvGuidePage.textContent = 'PAGE 0 / 0';
    const leftHeading = document.createElement('div');
    leftHeading.className = 'guide-running-head';
    leftHeading.textContent = 'CHANNEL DIRECTORY';
    const leftEmpty = document.createElement('p');
    leftEmpty.className = 'guide-empty';
    leftEmpty.textContent = 'NO CHANNELS IN THE LINEUP';
    const rightHeading = document.createElement('div');
    rightHeading.className = 'guide-running-head';
    rightHeading.textContent = 'LOCAL TV LISTINGS';
    const rightEmpty = document.createElement('p');
    rightEmpty.className = 'guide-empty';
    rightEmpty.textContent = 'ADD A CHANNEL TO PRINT ITS LIVE SCHEDULE.';
    leftPage.append(leftHeading, leftEmpty);
    rightPage.append(rightHeading, rightEmpty);
    spread.append(leftPage, rightPage);
    tvGuidePageContent.append(spread);
    document.querySelector('#tvGuidePrevious').disabled = true;
    document.querySelector('#tvGuideNext').disabled = true;
    return;
  }
  tvGuidePageIndex = (tvGuidePageIndex + channels.length) % channels.length;
  const channel = channels[tvGuidePageIndex];
  tvGuidePage.textContent = `PAGE ${tvGuidePageIndex + 1} / ${channels.length}`;
  document.querySelector('#tvGuidePrevious').disabled = channels.length < 2;
  document.querySelector('#tvGuideNext').disabled = channels.length < 2;

  const nowMs = Date.now();
  const windowStart = new Date(nowMs);
  const windowEnd = new Date(nowMs + GUIDE_WINDOW_SECONDS * 1000);
  const leftRunningHead = document.createElement('div');
  leftRunningHead.className = 'guide-running-head';
  leftRunningHead.textContent = `CHANNEL DIRECTORY · ${tvGuidePageIndex + 1} OF ${channels.length}`;
  const channelRow = document.createElement('label');
  channelRow.className = 'guide-channel-row';
  const channelCheck = document.createElement('input');
  channelCheck.type = 'checkbox';
  channelCheck.checked = channel.enabled !== false;
  channelCheck.setAttribute('aria-label', `Enable ${channel.name}`);
  channelCheck.addEventListener('change', () => { void setGuideChannelEnabled(channel.id, channelCheck.checked); });
  const channelName = document.createElement('strong');
  channelName.textContent = channel.name;
  const channelMeta = document.createElement('small');
  channelMeta.textContent = `${channel.showCount || 0} SHOWS · ${channel.episodeCount || 0} EPISODES`;
  channelRow.append(channelCheck, channelName, channelMeta);

  const includedShows = (channel.shows || []).filter(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path)).length;
  const showHeading = document.createElement('div');
  showHeading.className = 'guide-section-heading';
  const showHeadingTitle = document.createElement('strong');
  showHeadingTitle.textContent = 'SHOWS IN ROTATION';
  const showHeadingCount = document.createElement('small');
  showHeadingCount.textContent = `${includedShows} OF ${(channel.shows || []).length} ACTIVE`;
  showHeading.append(showHeadingTitle, showHeadingCount);
  const showList = document.createElement('div');
  showList.className = 'guide-show-list';
  if (!(channel.shows || []).length) {
    const note = document.createElement('p');
    note.className = 'guide-empty';
    note.textContent = channel.scanning ? 'SCANNING SHOWS…' : channel.error ? 'CHANNEL FOLDER OFFLINE' : 'NO SHOWS FOUND';
    showList.append(note);
  } else {
    for (const show of channel.shows) {
      const row = document.createElement('label');
      row.className = 'guide-show-row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !channel.disabledShowPaths?.includes(show.path);
      check.disabled = channel.enabled === false;
      check.setAttribute('aria-label', `Include ${show.name} in the schedule`);
      check.addEventListener('change', () => { void setGuideShowEnabled(channel.id, show.path, check.checked); });
      const name = document.createElement('span');
      name.textContent = show.name;
      const count = document.createElement('small');
      count.textContent = `${show.episodes?.length || 0} EPS`;
      row.append(check, name, count);
      showList.append(row);
    }
  }
  const managementNote = document.createElement('p');
  managementNote.className = 'guide-management-note';
  managementNote.textContent = 'CHECK SHOWS TO INCLUDE THEM IN THIS CHANNEL’S ROTATION.';
  leftPage.append(leftRunningHead, channelRow, showHeading, showList, managementNote);

  const rightRunningHead = document.createElement('div');
  rightRunningHead.className = 'guide-running-head';
  rightRunningHead.textContent = 'SATURDAY TUBE · LOCAL BROADCAST';
  const dateWindow = document.createElement('div');
  dateWindow.className = 'guide-date-window';
  const dateLabel = document.createElement('strong');
  dateLabel.textContent = windowStart.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  const timeLabel = document.createElement('small');
  timeLabel.textContent = `${windowStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${windowEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · LOCAL TIME`;
  dateWindow.append(dateLabel, timeLabel);

  const schedule = document.createElement('section');
  schedule.className = 'guide-schedule';
  const scheduleHeading = document.createElement('header');
  scheduleHeading.className = 'guide-schedule-heading';
  const scheduleTitle = document.createElement('strong');
  scheduleTitle.textContent = 'PROGRAM LISTINGS';
  const scheduleType = document.createElement('small');
  scheduleType.textContent = 'LIVE · EPISODES ONLY';
  scheduleHeading.append(scheduleTitle, scheduleType);
  const scheduleList = document.createElement('ol');
  scheduleList.className = 'guide-broadcast-list';
  scheduleList.setAttribute('aria-label', 'TV episodes grouped by broadcast hour');
  const elapsed = broadcastElapsed(channel);
  const position = channel.enabled !== false && !channel.error ? locateChannelSegment(channel, elapsed) : null;
  if (channel.enabled === false) {
    const note = document.createElement('li');
    note.className = 'guide-schedule-empty';
    note.textContent = 'CHANNEL OFF AIR · ENABLE IT TO SEE THE LINEUP';
    scheduleList.append(note);
  } else if (position) {
    let startSeconds = position.startSeconds;
    let shown = 0;
    const listedPrograms = new Set();
    for (let index = position.index; index < channel.queue.length && shown < GUIDE_VISIBLE_PROGRAMS; index += 1) {
      const segment = channel.queue[index];
      const segmentStartSeconds = startSeconds;
      startSeconds += Number(segment.durationSeconds) || 0;
      if (segment.segmentType !== 'program') continue;
      const programKey = `${segment.programSequence || segment.path}:${segment.path}`;
      if (listedPrograms.has(programKey)) continue;
      listedPrograms.add(programKey);
      const waitSeconds = Math.max(0, segmentStartSeconds - elapsed);
      const scheduledAt = new Date(nowMs + waitSeconds * 1000);
      const isCurrentProgram = index === position.index && segment.segmentType === 'program';
      const row = document.createElement('li');
      row.className = `guide-schedule-row${isCurrentProgram ? ' is-current' : ''}`;
      const when = document.createElement('time');
      when.dateTime = scheduledAt.toISOString();
      when.textContent = isCurrentProgram ? 'NOW' : scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const kind = document.createElement('small');
      kind.textContent = segment.showName || 'PROGRAM';
      const title = document.createElement('span');
      title.textContent = segment.title || 'Episode';
      row.append(when, kind, title);
      scheduleList.append(row);
      shown += 1;
    }
  } else {
    const note = document.createElement('li');
    note.className = 'guide-schedule-empty';
    note.textContent = channel.scanning ? 'SCANNING CHANNEL…' : channel.error ? 'CHANNEL FOLDER OFFLINE' : 'BUILDING EPISODE LINEUP…';
    scheduleList.append(note);
  }
  const scheduleNote = document.createElement('p');
  scheduleNote.className = 'guide-commercial-note';
  scheduleNote.textContent = 'COMMERCIALS ARE OMITTED; THEIR AIRTIME STILL COUNTS TOWARD EVERY START TIME.';
  schedule.append(scheduleHeading, scheduleList, scheduleNote);
  rightPage.append(rightRunningHead, dateWindow, schedule);
  spread.append(leftPage, rightPage);
  tvGuidePageContent.append(spread);
  if (tvGuideDialog.open && channel.enabled !== false && !channel.scanning && !channel.error) {
    if (!channel.scanComplete) void scanChannel(channel);
    else void ensureGuideSchedule(channel);
  }
}
async function ensureGuideSchedule(channel) {
  if (!channel || channel.scanning || channel.error || channel.enabled === false || !channel.shows?.some(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path) && show.episodes?.some(item => Number(item.durationSeconds) > 0))) return;
  if (channel.guideSchedulePromise) return channel.guideSchedulePromise;
  const pending = (async () => {
    if (!channel.broadcast) await initializeChannelBroadcast(channel);
    const elapsed = broadcastElapsed(channel);
    await appendBroadcastCoverage(channel, elapsed + GUIDE_WINDOW_SECONDS);
    if (tvGuideDialog.open && channels[tvGuidePageIndex]?.id === channel.id) renderTVGuide();
  })();
  channel.guideSchedulePromise = pending;
  try { await pending; }
  finally { if (channel.guideSchedulePromise === pending) channel.guideSchedulePromise = null; }
}
function openTVGuide() {
  tvGuidePageIndex = Math.max(0, channels.findIndex(channel => channel.id === activeChannelId));
  renderTVGuide();
  showScreenDialog(tvGuideDialog);
  if (guideRefreshTimer) window.clearInterval(guideRefreshTimer);
  const channel = channels[tvGuidePageIndex];
  if (channel) void ensureGuideSchedule(channel);
  guideRefreshTimer = window.setInterval(() => {
    if (!tvGuideDialog.open) return;
    const channel = channels[tvGuidePageIndex];
    renderTVGuide();
    if (channel) void ensureGuideSchedule(channel);
  }, 5000);
}
function stopTVGuideRefresh() {
  if (guideRefreshTimer) window.clearInterval(guideRefreshTimer);
  guideRefreshTimer = null;
}
async function setGuideChannelEnabled(id, enabled) {
  const channel = channels.find(item => item.id === id);
  if (!channel) return;
  const previousActiveChannelId = activeChannelId;
  channel.enabled = Boolean(enabled);
  if (!channel.enabled && activeChannelId === id) {
    const next = channels.find(item => item.enabled !== false && item.id !== id);
    if (next) activeChannelId = next.id;
    else {
      channelTuneToken += 1;
      persistChannels();
      renderChannels();
      clearChannelVideoForInputChange();
      setTVSearching(false);
      setStatus('NO ENABLED TV CHANNELS · CHECK THE TV GUIDE');
      renderTVGuide();
      return;
    }
  } else if (channel.enabled && selectedInput === 'tv') activeChannelId = id;
  if (selectedInput === 'tv' && previousActiveChannelId !== activeChannelId) {
    channelTuneToken += 1;
    clearChannelVideoForInputChange();
  }
  persistChannels();
  renderChannels();
  renderTVGuide();
  if (selectedInput === 'tv') {
    setTVSearching(true);
    await startActiveChannel();
  }
}
async function setGuideShowEnabled(channelId, showPath, enabled) {
  const channel = channels.find(item => item.id === channelId);
  if (!channel) return;
  const snapshot = channelPlaybackSnapshot(channel);
  const disabled = new Set(channel.disabledShowPaths || []);
  if (enabled) disabled.delete(showPath); else disabled.add(showPath);
  channel.disabledShowPaths = [...disabled];
  channel.shows = (channel.shows || []).map(show => show.path === showPath ? { ...show, enabled } : show);
  const eligibleShows = channel.shows.filter(show => show.enabled !== false && !channel.disabledShowPaths.includes(show.path));
  const restored = await window.tube.reconcileChannelPlayback(eligibleShows, channel.commercials || [], {
    ...(snapshot || {}),
    rotation: snapshot?.rotation || channel.rotation || {}
  });
  channel.queue = restored.queue || [];
  channel.cursor = 0;
  channel.rotation = restored.rotation || channel.rotation || {};
  channel.playHistory = restored.playHistory || channel.playHistory || {};
  channel.lastPlayedSequence = restored.lastPlayedSequence;
  channel.nextSequence = restored.nextSequence || 0;
  channel.nextProgrammeSequence = Math.max(0, Number(snapshot?.nextProgrammeSequence) || 0,
    ...channel.queue.map(item => Number(item.programSequence) || 0));
  channel.broadcast = {
    startedAtMs: Date.now(),
    initialOffsetSeconds: restored.elapsedSeconds || 0,
    totalDurationSeconds: restored.totalDurationSeconds || 0,
    queuePromise: null,
    syncing: false
  };
  if (eligibleShows.some(show => show.episodes?.some(item => Number(item.durationSeconds) > 0))) {
    await appendBroadcastCoverage(channel, restored.elapsedSeconds || 0);
  }
  persistChannels();
  renderChannels();
  renderTVGuide();
  if (selectedInput === 'tv' && channel.id === activeChannelId) {
    setTVSearching(true);
    syncActiveBroadcast(false, channelTuneToken);
  }
}
function saveChannelPlaybackState() {
  persistChannels();
}
function recordChannelPlayback(channel, track, now = Date.now()) {
  if (!channel || !track || !Number.isFinite(Number(track.sequence))) return;
  const sequence = Number(track.sequence);
  if (channel.lastPlayedSequence === sequence) return;
  const history = channel.playHistory && typeof channel.playHistory === 'object' ? channel.playHistory : {};
  const previous = history[track.path] || {};
  history[track.path] = {
    count: Math.max(0, Number(previous.count) || 0) + 1,
    lastPlayedAt: now,
    segmentType: track.segmentType === 'commercial' ? 'commercial' : 'program'
  };
  const oldest = Object.entries(history).sort((left, right) => (Number(left[1]?.lastPlayedAt) || 0) - (Number(right[1]?.lastPlayedAt) || 0));
  while (oldest.length > MAX_SAVED_CHANNEL_HISTORY_ENTRIES) delete history[oldest.shift()[0]];
  channel.playHistory = history;
  channel.lastPlayedSequence = sequence;
  saveChannelPlaybackState();
}
function broadcastElapsed(channel, now = Date.now()) {
  const broadcast = channel?.broadcast;
  if (!broadcast || !Number.isFinite(broadcast.startedAtMs)) return 0;
  return Math.max(0, Number(broadcast.initialOffsetSeconds) || 0) + Math.max(0, now - broadcast.startedAtMs) / 1000;
}
function locateChannelSegment(channel, elapsedSeconds) {
  let startSeconds = 0;
  for (let index = 0; index < (channel?.queue?.length || 0); index += 1) {
    const segment = channel.queue[index];
    const durationSeconds = Number(segment?.durationSeconds);
    if (!(durationSeconds > 0)) continue;
    const endSeconds = startSeconds + durationSeconds;
    if (elapsedSeconds < endSeconds) return { index, segment, startSeconds, offsetSeconds: elapsedSeconds - startSeconds };
    startSeconds = endSeconds;
  }
  return null;
}
function pruneCompletedChannelQueue(channel, position, now = Date.now()) {
  if (!channel?.queue || !channel.broadcast || !position || position.index < 96) return position;
  channel.queue.splice(0, position.index);
  channel.broadcast.startedAtMs = now;
  channel.broadcast.initialOffsetSeconds = position.offsetSeconds;
  channel.broadcast.totalDurationSeconds = channel.queue.reduce((sum, item) => sum + (Number(item.durationSeconds) || 0), 0);
  channel.cursor = 0;
  if (selectedInput === 'tv' && activeChannelId === channel.id) currentIndex = 0;
  renderPlaylist();
  return { ...position, index: 0, startSeconds: 0 };
}
function appendBroadcastQueue(channel, generated) {
  const previousLength = channel.queue.length;
  const byPath = new Map([
    ...(channel.shows || []).flatMap(show => show.episodes.map(item => [item.path, { ...item, showName: show.name, showPath: show.path }])),
    ...(channel.commercials || []).map(item => [item.path, { ...item, showName: 'COMMERCIALS' }])
  ]);
  let sequence = Math.max(0, Number(channel.nextSequence) || 0);
  let programmeSequence = Math.max(0, Number(channel.nextProgrammeSequence) || 0);
  let activeProgramGroupIndex = null;
  let activeBreakSequence = null;
  let adBreakPosition = 0;
  for (const segment of generated.queue || []) {
    const source = byPath.get(segment.path);
    if (!source?.url || !Number.isFinite(Number(segment.durationSeconds)) || Number(segment.durationSeconds) <= 0) continue;
    const isCommercial = segment.segmentType === 'commercial';
    if (!isCommercial) {
      if (segment.programGroupIndex !== activeProgramGroupIndex) {
        programmeSequence += 1;
        activeProgramGroupIndex = segment.programGroupIndex;
      }
      activeBreakSequence = null;
      adBreakPosition = 0;
    } else {
      if (activeBreakSequence === null) activeBreakSequence = sequence;
      adBreakPosition += 1;
    }
    channel.queue.push({
      ...source,
      ...segment,
      id: source.id,
      url: source.url,
      title: segment.title || source.title,
      showName: segment.showName || source.showName,
      channelMedia: true,
      channelAd: isCommercial,
      managedLocalCopy: false,
      unavailable: false,
      sequence: sequence++,
      programSequence: programmeSequence,
      breakSequence: isCommercial ? activeBreakSequence : 0,
      adBreakPosition: isCommercial ? adBreakPosition : 0
    });
  }
  channel.nextSequence = sequence;
  channel.nextProgrammeSequence = programmeSequence;
  channel.playHistory = channel.playHistory || {};
  channel.rotation = {
    round: generated.round,
    episodeOrderVersion: generated.episodeOrderVersion || 'season-episode-v1',
    episodeBags: generated.episodeBags || {},
    lastEpisodeByShow: generated.lastEpisodeByShow || {},
    lastCommercialPath: generated.lastCommercialPath || '',
    commercialBagPaths: generated.commercialBagPaths || [],
    recentCommercialPaths: generated.recentCommercialPaths || []
  };
  channel.broadcast.totalDurationSeconds = Number(channel.broadcast.totalDurationSeconds) || 0;
  for (const item of channel.queue.slice(previousLength)) channel.broadcast.totalDurationSeconds += Number(item.durationSeconds) || 0;
  persistChannels();
}
async function appendBroadcastCoverage(channel, targetSeconds) {
  if (!channel || channel.error || !channel.shows?.some(show => show.episodes?.some(item => Number(item.durationSeconds) > 0))) return;
  if (channel.broadcast?.queuePromise) return channel.broadcast.queuePromise;
  if (!channel.broadcast) channel.broadcast = { startedAtMs: Date.now(), initialOffsetSeconds: 0, totalDurationSeconds: 0 };
  const remainingSeconds = Math.max(0, Number(targetSeconds) + 120 - Number(channel.broadcast.totalDurationSeconds || 0));
  if (remainingSeconds <= 0) return;
  channel.broadcast.queuePromise = (async () => {
    const generated = await window.tube.buildChannelRound(
      channel.root,
      channel.shows.filter(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path))
        .map(show => ({ path: show.path, name: show.name, episodes: show.episodes.map(item => ({ path: item.path, durationSeconds: item.durationSeconds })) })),
      (channel.commercials || []).map(item => ({
        path: item.path,
        durationSeconds: item.durationSeconds,
        channelClipId: item.channelClipId,
        sourceId: item.sourceId
      })),
      channel.rotation || {},
      remainingSeconds
    );
    if (!channels.includes(channel)) return;
    appendBroadcastQueue(channel, generated);
    if (generated.totalDurationSeconds < remainingSeconds && generated.roundsAdded >= 1000) {
      channel.error = 'The broadcast schedule is too large to catch up in one pass.';
      renderChannels();
    }
  })().catch(error => {
    channel.error = error.message || 'The channel broadcast schedule could not be extended.';
    renderChannels();
  }).finally(() => { channel.broadcast.queuePromise = null; });
  return channel.broadcast.queuePromise;
}
async function initializeChannelBroadcast(channel, { force = false } = {}) {
  if (channel.broadcastInitPromise) return channel.broadcastInitPromise;
  if (channel.broadcast && !force) return channel.broadcast.queuePromise || undefined;
  const pending = (async () => {
    channel.queue = [];
    channel.cursor = 0;
    channel.rotation = channel.rotation && typeof channel.rotation === 'object' ? channel.rotation : {};
    channel.broadcast = { startedAtMs: Date.now(), initialOffsetSeconds: 0, totalDurationSeconds: 0, queuePromise: null, syncing: false };
    await appendBroadcastCoverage(channel, 0);
    if (channel.broadcast.totalDurationSeconds > 0) {
      channel.broadcast.startedAtMs = Date.now();
      channel.broadcast.initialOffsetSeconds = 0;
    }
  })();
  channel.broadcastInitPromise = pending;
  try { await pending; }
  finally { if (channel.broadcastInitPromise === pending) channel.broadcastInitPromise = null; }
}
function syncActiveBroadcast(forceTune = false, expectedTuneToken = channelTuneToken) {
  const channel = activeChannel();
  if (!channel || selectedInput !== 'tv' || channel.error || !channel.broadcast || expectedTuneToken !== channelTuneToken) return;
  let elapsed = broadcastElapsed(channel);
  let position = locateChannelSegment(channel, elapsed);
  if (!position) {
    setTVSearching(true);
    if (hasVideo && !video.paused) {
      switchingTracks = true;
      video.pause();
      switchingTracks = false;
    }
    setStatus('CHANNEL SCHEDULE IS CATCHING UP');
    const pending = appendBroadcastCoverage(channel, elapsed);
    if (channel.broadcast.coverageTunePromise !== pending || channel.broadcast.coverageTuneToken !== expectedTuneToken) {
      channel.broadcast.coverageTunePromise = pending;
      channel.broadcast.coverageTuneToken = expectedTuneToken;
      Promise.resolve(pending).then(() => {
        if (channel.broadcast?.coverageTuneToken === expectedTuneToken && expectedTuneToken === channelTuneToken
          && selectedInput === 'tv' && activeChannelId === channel.id && !channel.error) {
          syncActiveBroadcast(true, expectedTuneToken);
        }
      }).catch(error => {
        console.warn('Channel schedule catch-up failed', error);
        if (expectedTuneToken === channelTuneToken && selectedInput === 'tv' && activeChannelId === channel.id) {
          setTVSearching(false);
          setStatus('CHANNEL SCHEDULE CATCH-UP FAILED');
        }
      });
    }
    return;
  }
  if (expectedTuneToken !== channelTuneToken || selectedInput !== 'tv' || activeChannelId !== channel.id) return;
  position = pruneCompletedChannelQueue(channel, position);
  elapsed = broadcastElapsed(channel);
  const current = channel.queue[currentIndex];
  const sameSegment = hasVideo && activePlaybackChannelId === channel.id && activePlaybackTuneToken === expectedTuneToken
    && activePlaybackPath === position.segment.path && current?.path === position.segment.path
    && current?.segmentType === position.segment.segmentType && current?.sequence === position.segment.sequence;
  if (forceTune || !sameSegment) {
    channel.cursor = position.index;
    const sourceTimeSeconds = (Number(position.segment.sourceStartSeconds) || 0) + position.offsetSeconds;
    playTrack(position.index, {
      trackPath: position.segment.path,
      currentTime: sourceTimeSeconds,
      wasPlaying: true,
      input: 'tv'
    });
  } else {
    channel.cursor = position.index;
    const sourceTimeSeconds = (Number(position.segment.sourceStartSeconds) || 0) + position.offsetSeconds;
    const drift = Math.abs((Number(video.currentTime) || 0) - sourceTimeSeconds);
    if (!video.paused && drift > 3) video.currentTime = sourceTimeSeconds;
  }
  if (channel.broadcast.totalDurationSeconds - elapsed < 180) void appendBroadcastCoverage(channel, elapsed + 60);
}
function needsChannelTranscode(track) {
  return /\.(?:avi|mkv|wmv|asf|flv|rm|rmvb|mxf|ts|mts|m2ts|vob|dv|nut)$/i.test(String(track?.path || ''));
}
function channelPlaybackSource(track) {
  const compatible = channelAudioCompatibleMedia.get(track?.path);
  return compatible?.url ? { ...track, id: compatible.id, url: compatible.url } : track;
}
function prepareChannelAudioCompatibility(track) {
  if (!track?.channelMedia || selectedInput !== 'tv' || !/\.mkv$/i.test(String(track.path || ''))
    || !track.id || typeof window.tube.getMediaAudioCodec !== 'function'
    || channelAudioCompatibleMedia.has(track.path) || channelAudioCompatibilityJobs.has(track.path)) return;
  const sourcePath = track.path;
  const generation = playbackGeneration;
  const tuneToken = channelTuneToken;
  const job = window.tube.getMediaAudioCodec(track.id).then(codec => {
    if (!['ac3', 'eac3', 'dts', 'truehd', 'mlp'].includes(String(codec || '').toLowerCase())) return null;
    return window.tube.transcodeMedia(track.id);
  }).then(converted => {
    if (!converted?.url) return;
    channelAudioCompatibleMedia.set(sourcePath, converted);
    if (generation !== playbackGeneration || tuneToken !== channelTuneToken || selectedInput !== 'tv'
      || activePlaybackPath !== sourcePath || activePlaybackChannelId !== activeChannelId
      || activePlaybackUrl === converted.url) return;
    pendingPlaybackRestore = {
      trackPath: sourcePath,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      wasPlaying: !video.paused && !video.ended,
      input: 'tv'
    };
    switchingTracks = true;
    activePlaybackUrl = converted.url;
    video.src = converted.url;
    video.load();
    switchingTracks = false;
  }).catch(error => console.warn('Channel audio compatibility copy was unavailable', error))
    .finally(() => { if (channelAudioCompatibilityJobs.get(sourcePath) === job) channelAudioCompatibilityJobs.delete(sourcePath); });
  channelAudioCompatibilityJobs.set(sourcePath, job);
}
async function prewarmChannelPlayback(channel, requestToken) {
  if (requestToken !== channelPrewarmToken || !channel.broadcast || !channel.queue?.length) return;
  const position = locateChannelSegment(channel, broadcastElapsed(channel));
  if (!position) return;
  const program = position.segment.segmentType === 'program'
    ? position.segment
    : channel.queue.slice(position.index + 1).find(item => item.segmentType === 'program');
  if (!program?.id || !needsChannelTranscode(program)) return;
  try {
    await window.tube.transcodeMedia(program.id);
  } catch (error) {
    console.warn(`Channel media prewarm failed for ${channel.name}`, error);
  }
}
function prewarmAdjacentChannels() {
  const available = channels.filter(channel => channel.enabled !== false && channel.scanComplete && !channel.error);
  if (!channelsStartupReady || available.length < 2) return;
  const currentIndex = available.findIndex(channel => channel.id === activeChannelId);
  if (currentIndex < 0) return;
  const neighbors = [];
  for (let distance = 1; distance < available.length && neighbors.length < MAX_ADJACENT_CHANNELS_TO_PREWARM; distance += 1) {
    for (const index of [(currentIndex + distance) % available.length, (currentIndex - distance + available.length) % available.length]) {
      const channel = available[index];
      if (channel.id !== activeChannelId && !neighbors.includes(channel)) neighbors.push(channel);
      if (neighbors.length >= MAX_ADJACENT_CHANNELS_TO_PREWARM) break;
    }
  }
  const prewarmToken = ++channelPrewarmToken;
  queuedChannelPrewarm = { token: prewarmToken, channels: neighbors };
  if (channelPrewarmPromise) return;
  channelPrewarmPromise = (async () => {
    while (queuedChannelPrewarm) {
      const request = queuedChannelPrewarm;
      queuedChannelPrewarm = null;
      for (const channel of request.channels) {
        if (request.token !== channelPrewarmToken) break;
        if (channel.error) continue;
        try {
          if (!channel.scanComplete) await scanChannel(channel);
          if (request.token !== channelPrewarmToken || channel.error) break;
          if (!channel.broadcast) await initializeChannelBroadcast(channel);
          if (request.token !== channelPrewarmToken || !channel.broadcast) break;
          const elapsed = broadcastElapsed(channel);
          if (channel.broadcast.totalDurationSeconds - elapsed < 180) {
            await appendBroadcastCoverage(channel, elapsed + 60);
          }
          if (request.token !== channelPrewarmToken) break;
          await prewarmChannelPlayback(channel, request.token);
        } catch (error) {
          console.warn(`Adjacent channel prewarm failed for ${channel.name}`, error);
        }
      }
    }
  })().catch(error => console.warn('Adjacent channel prewarm queue failed', error)).finally(() => {
    channelPrewarmPromise = null;
    if (queuedChannelPrewarm) prewarmAdjacentChannels();
  });
}
function startActiveChannel() {
  const channel = activeChannel();
  const tuneToken = channelTuneToken;
  if (selectedInput === 'tv' && (!hasVideo || video.paused)) setTVSearching(true);
  if (!channelsStartupReady) {
    setTVSearching(true);
    setStatus('PREPARING TV CHANNELS');
    return;
  }
  if (!channel) {
    clearChannelVideoForInputChange();
    setTVSearching(false);
    setStatus('ADD A CHANNEL FOLDER TO WATCH TV');
    renderChannels();
    return;
  }
  if (channel.enabled === false) {
    clearChannelVideoForInputChange();
    setTVSearching(false);
    setStatus('CHANNEL DISABLED · OPEN THE TV GUIDE TO ENABLE IT');
    return;
  }
  if (channel.error) {
    clearChannelVideoForInputChange();
    setTVSearching(false);
    setStatus('TV CHANNEL FOLDER UNAVAILABLE · RESCAN IT');
    return;
  }
  if (channel.scanning || !channel.scanComplete) {
    setTVSearching(true);
    setStatus(channel.scanning ? `SCANNING ${channel.name.toUpperCase()}…` : `TUNING ${channel.name.toUpperCase()}…`);
    if (!channel.scanning) void scanChannel(channel);
    return;
  }
  if (!channel.broadcast) {
    void initializeChannelBroadcast(channel).then(() => {
      if (tuneToken === channelTuneToken && selectedInput === 'tv' && activeChannelId === channel.id) startActiveChannel();
    }).catch(error => {
      console.error('Channel broadcast could not be initialized', error);
      if (tuneToken === channelTuneToken && selectedInput === 'tv' && activeChannelId === channel.id) {
        setTVSearching(false);
        setStatus('CHANNEL SCHEDULE COULD NOT START');
      }
    });
    return;
  }
  if (!channel.queue?.some(item => item.segmentType === 'program')) {
    clearChannelVideoForInputChange();
    setTVSearching(false);
    setStatus(channel.showCount ? 'NO EPISODES WITH READABLE DURATIONS' : 'ADD ONE SHOW FOLDER PER CHANNEL');
    renderPlaylist();
    return;
  }
  syncActiveBroadcast(true, tuneToken);
  prewarmAdjacentChannels();
}
async function scanChannel(channel) {
  if (channel.scanPromise) return channel.scanPromise;
  const pending = (async () => {
    channel.scanning = true;
    channel.error = '';
    renderChannels();
    let savedPlaybackState = channelPlaybackSnapshot(channel) || channel.savedPlaybackState || null;
    try {
      const restoredRoot = await window.tube.restoreChannelFolder(channel.root);
      const scanned = await window.tube.rescanChannelFolder(restoredRoot);
      savedPlaybackState = channelPlaybackSnapshot(channel) || channel.savedPlaybackState || savedPlaybackState;
      const nextShows = (scanned.shows || []).map(show => ({ ...show, enabled: !channel.disabledShowPaths?.includes(show.path) }));
      const nextCommercials = scanned.commercials || [];
      channel.root = scanned.root;
      channel.name = scanned.name || channel.name;
      channel.abbreviation = makeChannelAbbreviation(channel.name, scanned.root);
      channel.movieOnly = scanned.movieOnly === true;
      channel.commercialsRoot = scanned.commercialsRoot || '';
      channel.shows = nextShows;
      channel.commercials = nextCommercials;
      channel.showCount = scanned.showCount || 0;
      channel.episodeCount = scanned.episodeCount || 0;
      channel.commercialCount = scanned.commercialCount || 0;
      if (savedPlaybackState) {
        const restored = await window.tube.reconcileChannelPlayback(
          channel.shows.filter(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path)),
          channel.commercials,
          { ...savedPlaybackState, rotation: savedPlaybackState.rotation || channel.rotation || {} }
        );
        channel.queue = restored.queue || [];
        channel.cursor = 0;
        channel.rotation = restored.rotation || channel.rotation || {};
        channel.playHistory = restored.playHistory || {};
        channel.lastPlayedSequence = restored.lastPlayedSequence;
        channel.nextSequence = restored.nextSequence || 0;
        channel.nextProgrammeSequence = Math.max(
          0,
          Number(savedPlaybackState.nextProgrammeSequence) || 0,
          ...channel.queue.map(item => Number(item.programSequence) || 0)
        );
        channel.broadcast = {
          startedAtMs: Date.now(),
          initialOffsetSeconds: restored.elapsedSeconds || 0,
          totalDurationSeconds: restored.totalDurationSeconds || 0,
          queuePromise: null,
          syncing: false
        };
        channel.savedPlaybackState = null;
        if (channel.shows.some(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path)
          && show.episodes?.some(item => Number(item.durationSeconds) > 0))) {
          await appendBroadcastCoverage(channel, restored.elapsedSeconds || 0);
        }
      } else {
        channel.rotation = channel.rotation && typeof channel.rotation === 'object' ? channel.rotation : {};
        channel.queue = [];
        channel.cursor = 0;
        channel.broadcast = null;
        channel.playHistory = {};
        channel.lastPlayedSequence = null;
        channel.nextSequence = 0;
        channel.nextProgrammeSequence = 0;
        await initializeChannelBroadcast(channel);
      }
      persistChannels();
    } catch (error) {
      console.warn('TV channel folder scan failed', error);
      channel.error = userFacingChannelError(error);
      channel.savedPlaybackState = savedPlaybackState;
      channel.shows = [];
      channel.commercials = [];
      channel.showCount = 0;
      channel.episodeCount = 0;
      channel.commercialCount = 0;
      channel.queue = [];
      channel.broadcast = null;
      persistChannels();
    } finally {
      channel.scanning = false;
      channel.scanComplete = true;
      renderChannels();
      if (tvGuideDialog.open) {
        renderTVGuide();
        if (channels[tvGuidePageIndex]?.id === channel.id) void ensureGuideSchedule(channel);
      }
      if (channelsStartupReady && selectedInput === 'tv' && activeChannelId === channel.id) {
        if (channel.broadcast) syncActiveBroadcast(false, channelTuneToken);
        else void startActiveChannel();
      }
    }
  })();
  channel.scanPromise = pending;
  try { await pending; }
  finally { if (channel.scanPromise === pending) channel.scanPromise = null; }
}

function clearChannelVideoForInputChange() {
  playbackGeneration += 1;
  activePlaybackGeneration = -1;
  activePlaybackUrl = '';
  activePlaybackChannelId = '';
  activePlaybackTuneToken = -1;
  activePlaybackPath = '';
  fallbackAttempted = false;
  lastRenderedSource = null;
  lastCompositeHasFrame = false;
  lastCompositePaused = null;
  switchingTracks = true;
  video.pause();
  video.removeAttribute('src');
  video.load();
  switchingTracks = false;
  currentSubtitleTrack = null;
  externalTrackCount = 0;
  caption.textContent = '';
  hasVideo = false;
  currentIndex = -1;
  const showLanding = startupIntroActive && selectedInput !== 'tv';
  stage.classList.toggle('empty', showLanding);
  document.querySelector('#emptyState').hidden = !showLanding;
  titleEl.textContent = '';
  seek.value = '0';
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playButton.textContent = '▶ PLAY';
  renderPlaylist();
}
async function restoreManualVideoSession() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return; }
  if (!saved || saved.input === 'tv' || saved.playlistId !== activePlaylistId) return;
  const list = playlists.find(item => item.id === saved.playlistId);
  const index = list?.tracks.findIndex(track => track.path === saved.trackPath && !track.unavailable && track.url) ?? -1;
  if (index < 0) return;
  await new Promise(resolve => window.setTimeout(resolve, 360));
  if (selectedInput !== 'video') return;
  playTrack(index, { trackPath: saved.trackPath, currentTime: Math.max(0, Number(saved.currentTime) || 0), wasPlaying: saved.wasPlaying === true, input: 'video' });
}
async function loadChannels() {
  channelsStartupReady = false;
  if (selectedInput === 'tv') setTVSearching(true);
  let raw = [];
  try { raw = JSON.parse(localStorage.getItem(CHANNELS_KEY) || '[]'); } catch { /* Start with an empty channel list. */ }
  if (!Array.isArray(raw)) raw = [];
  channels = raw.filter(item => item && typeof item.id === 'string' && typeof item.root === 'string').map(item => ({
    id: item.id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'TV Channel',
    abbreviation: typeof item.abbreviation === 'string' && item.abbreviation.trim()
      ? item.abbreviation.trim().slice(0, 6).toLocaleUpperCase('en-US')
      : makeChannelAbbreviation(typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'TV Channel', item.root),
    root: item.root,
    movieOnly: item.movieOnly === true,
    rotation: item.playbackState?.rotation && typeof item.playbackState.rotation === 'object'
      ? item.playbackState.rotation : item.rotation && typeof item.rotation === 'object' ? item.rotation : {},
    savedPlaybackState: item.playbackState && typeof item.playbackState === 'object' ? item.playbackState : null,
    playHistory: item.playbackState?.playHistory && typeof item.playbackState.playHistory === 'object' ? item.playbackState.playHistory : {},
    lastPlayedSequence: Number.isFinite(Number(item.playbackState?.lastPlayedSequence)) ? Number(item.playbackState.lastPlayedSequence) : null,
    nextSequence: Math.max(0, Number(item.playbackState?.nextSequence) || 0),
    nextProgrammeSequence: Math.max(0, Number(item.playbackState?.nextProgrammeSequence) || 0),
    enabled: item.enabled !== false,
    disabledShowPaths: Array.isArray(item.disabledShowPaths) ? item.disabledShowPaths.filter(value => typeof value === 'string') : [],
    queue: [], cursor: 0, broadcast: null, shows: [], commercials: [], showCount: 0, episodeCount: 0, commercialCount: 0, error: '', scanning: false, scanComplete: false, scanPromise: null
  }));
  const savedActive = localStorage.getItem('saturdayTube.activeChannel.v1');
  activeChannelId = channels.some(item => item.id === savedActive) ? savedActive : channels[0]?.id || '';
  renderChannels();
  try {
    const discovered = await window.tube.discoverSiblingChannels(channels.map(channel => channel.root));
    for (const folder of discovered || []) {
      if (!folder?.root || channels.some(channel => channel.root === folder.root)) continue;
      channels.push({
        id: `channel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: folder.name || 'TV Channel',
        abbreviation: makeChannelAbbreviation(folder.name || 'TV Channel', folder.root),
        root: folder.root,
        rotation: {}, savedPlaybackState: null, playHistory: {}, lastPlayedSequence: null,
        nextSequence: 0, nextProgrammeSequence: 0, enabled: true, disabledShowPaths: [],
        queue: [], cursor: 0, broadcast: null, shows: [], commercials: [],
        showCount: 0, episodeCount: 0, commercialCount: 0, error: '', scanning: false, scanComplete: false, scanPromise: null
      });
    }
    if (discovered?.length) {
      channels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      persistChannels();
      renderChannels();
    }
  } catch (error) {
    console.warn('TV channel siblings could not be discovered', error);
  }
  const firstEnabled = channels.find(item => item.enabled !== false);
  if (!activeChannel() || activeChannel().enabled === false) activeChannelId = firstEnabled?.id || '';
  const startupOrder = [activeChannel(), ...channels.filter(item => item.id !== activeChannelId)].filter(Boolean);
  for (const channel of startupOrder) await scanChannel(channel);
  channelsStartupReady = channels.every(channel => channel.scanComplete);
  const playable = channels.filter(channel => channel.enabled !== false && !channel.error
    && channel.queue?.some(item => item.segmentType === 'program'));
  if (!playable.some(channel => channel.id === activeChannelId)) activeChannelId = playable[0]?.id || '';
  persistChannels();
  renderChannels();
  if (selectedInput === 'tv') {
    if (activeChannel() && playable.some(channel => channel.id === activeChannelId)) void startActiveChannel();
    else {
      setTVSearching(false);
      setStatus(activeChannel()?.error ? 'TV CHANNEL SCAN FAILED · CHECK DRIVE' : 'NO PLAYABLE TV CHANNEL FOUND');
    }
  }
}
async function addChannelFolder() {
  channelSetupNotice = '';
  if (selectedInput === 'tv') {
    saveChannelPlaybackState();
    window.dispatchEvent(new Event('saturdayTube-channel-change'));
  }
  addChannelButton.disabled = true;
  channelStatus.textContent = 'CHOOSE FOLDER…';
  try {
    const scanned = await window.tube.chooseChannelFolder();
    if (!scanned) { renderChannels(); return; }
    const existing = channels.find(item => item.root === scanned.root);
    if (existing) {
      activeChannelId = existing.id;
      await scanChannel(existing);
    } else {
      const channel = {
        id: `channel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: scanned.name || 'TV Channel',
        abbreviation: makeChannelAbbreviation(scanned.name || 'TV Channel', scanned.root),
        root: scanned.root, movieOnly: scanned.movieOnly === true, commercialsRoot: scanned.commercialsRoot || '',
        rotation: {}, savedPlaybackState: null, playHistory: {}, lastPlayedSequence: null, nextSequence: 0, nextProgrammeSequence: 0,
        queue: [], cursor: 0, broadcast: null, shows: scanned.shows || [], commercials: scanned.commercials || [],
        showCount: scanned.showCount || 0, episodeCount: scanned.episodeCount || 0, commercialCount: scanned.commercialCount || 0,
        error: scanned.scanError ? 'This folder could not be opened. Rescan it or choose another.' : '', scanning: false,
        scanComplete: scanned.scanError !== true, scanPromise: null
      };
      channels.push(channel);
      activeChannelId = channel.id;
      if (!scanned.scanError) {
        try { await initializeChannelBroadcast(channel); }
        catch (error) {
          console.warn('New TV channel could not be prepared yet', error);
          channel.error = userFacingChannelError(error);
        }
      }
    }
    persistChannels();
    renderChannels();
    if (selectedInput === 'tv') await startActiveChannel();
  } catch (error) {
    console.warn('TV channel folder could not be added', error);
    channelSetupNotice = userFacingChannelError(error, true);
  } finally { addChannelButton.disabled = false; renderChannels(); }
}
async function rescanActiveChannel() {
  const channel = activeChannel();
  if (!channel || !channelsStartupReady) return;
  rescanChannelButton.disabled = true;
  await scanChannel(channel);
}
function makeChannelAbbreviation(name, root = '') {
  const identity = `${name || ''} ${root || ''}`.toLocaleLowerCase('en-US');
  if (/comedy\s*central/.test(identity)) return 'CMDY';
  if (/(?:^|[\\/\s])hbo(?:$|[\\/\s])/.test(identity)) return 'HBO';
  if (/(?:^|[\\/\s])00s(?:$|[\\/\s])|2000s/.test(identity)) return '00s';
  if (/(?:^|[\\/\s])90s(?:$|[\\/\s])|1990s/.test(identity)) return '90s';
  if (/nickelodeon|(?:^|[\\/\s])nick(?:$|[\\/\s])/.test(identity)) return 'NICK';
  if (/(?:^|[\\/\s])666(?:$|[\\/\s])/.test(identity)) return '666';
  const words = String(name || '').match(/[a-z0-9]+/ig) || [];
  const meaningful = words.filter(word => !['the', 'a', 'an'].includes(word.toLocaleLowerCase('en-US')));
  if (meaningful.length > 1) return meaningful.map(word => word[0]).join('').slice(0, 5).toLocaleUpperCase('en-US');
  return (meaningful[0] || 'TV').slice(0, 4).toLocaleUpperCase('en-US');
}
function channelSurfAbbreviation(channel) {
  return channel?.abbreviation || makeChannelAbbreviation(channel?.name || 'CHANNEL', channel?.root || '');
}
function userFacingChannelError(error, adding = false) {
  if (adding) return 'Folder could not be added. Check access and try again.';
  const message = String(error?.message || error || '');
  return /ENOENT|ENODEV|EIO|no such file|not available|unavailable|offline/i.test(message)
    ? 'This folder is unavailable. Reconnect its drive, then rescan.'
    : 'This folder could not be opened. Rescan it or choose another.';
}
function showChannelSurfOverlay(channel) {
  if (!channelSurfOverlay || !channel) return;
  channelSurfOverlay.textContent = channelSurfAbbreviation(channel);
  channelSurfOverlay.hidden = false;
  channelSurfOverlay.classList.remove('surf-in');
  void channelSurfOverlay.offsetWidth;
  channelSurfOverlay.classList.add('surf-in');
  if (channelSurfOverlayTimer) window.clearTimeout(channelSurfOverlayTimer);
  channelSurfOverlayTimer = window.setTimeout(() => {
    channelSurfOverlay.hidden = true;
    channelSurfOverlay.classList.remove('surf-in');
    channelSurfOverlayTimer = null;
  }, 1900);
}
function selectActiveChannel(id) {
  if (!channelsStartupReady || !channels.some(channel => channel.id === id && channel.enabled !== false && channel.scanComplete && !channel.error)) return;
  const changed = activeChannelId !== id;
  if (selectedInput === 'tv') {
    saveChannelPlaybackState();
    window.dispatchEvent(new Event('saturdayTube-channel-change'));
  }
  if (changed) channelTuneToken += 1;
  activeChannelId = id;
  if (changed && selectedInput === 'tv') {
    activeChannelTuneMetric = {
      channelId: id,
      channelName: activeChannel()?.name || 'TV Channel',
      tuneToken: channelTuneToken,
      startedAt: performance.now(),
      reported: new Set()
    };
    recordChannelTuneMetric('click');
  }
  persistChannels();
  renderChannels();
  showChannelSurfOverlay(activeChannel());
  if (selectedInput === 'tv') {
    if (changed) clearChannelVideoForInputChange();
    setTVSearching(true);
    void startActiveChannel();
  }
}
function cycleActiveChannel(direction) {
  if (!channelsStartupReady) return;
  const available = channels.filter(channel => channel.enabled !== false && channel.scanComplete && !channel.error);
  if (!available.length) return;
  const current = available.findIndex(channel => channel.id === activeChannelId);
  const nextIndex = current < 0
    ? (direction > 0 ? 0 : available.length - 1)
    : (current + direction + available.length) % available.length;
  const nextChannelId = available[nextIndex].id;
  if (selectedInput !== 'tv') {
    selectActiveChannel(nextChannelId);
    setInputSource('tv');
    return;
  }
  selectActiveChannel(nextChannelId);
}
function persistPlaylists() {
  try {
    const stored = playlists.map(list => ({
      id: list.id,
      name: list.name,
      tracks: list.tracks.map(track => ({
        path: track.path,
        title: track.title,
        ...(track.managedLocalCopy ? { managedLocalCopy: true } : {}),
        ...(typeof track.sourcePath === 'string' && track.sourcePath ? { sourcePath: track.sourcePath } : {})
      }))
    }));
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(stored));
    localStorage.setItem('saturdayTube.activePlaylist.v1', activePlaylistId);
  } catch (error) { console.error('Could not save playlists', error); setStatus('PLAYLIST COULD NOT BE SAVED'); }
}
function renderPlaylistSelect() {
  const selected = activePlaylistId;
  playlistSelect.replaceChildren();
  for (const item of playlists) playlistSelect.add(new Option(item.name || 'Untitled Playlist', item.id, false, item.id === selected));
  playlistSelect.value = selected;
}
function renderPlaylist() {
  const list = activePlaylist();
  const channel = selectedInput === 'tv' ? activeChannel() : null;
  const channelMode = Boolean(channel);
  const heading = document.querySelector('.playlist-heading span');
  heading.textContent = channelMode ? 'CHANNEL QUEUE' : 'PLAYLIST';
  playlistSelect.parentElement.hidden = channelMode;
  playlistName.hidden = channelMode;
  renderPlaylistSelect();
  if (!channelMode) playlistName.value = list?.name || '';
  const tracks = list?.tracks || [];
  document.querySelector('#playlistCount').textContent = channelMode
    ? `${channel.showCount || 0} SHOW${channel.showCount === 1 ? '' : 'S'}`
    : `${tracks.length} TAPE${tracks.length === 1 ? '' : 'S'}`;
  playlistItemsEl.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('li');
    empty.className = 'playlist-empty';
    empty.textContent = channelMode ? 'NO EPISODES · CHOOSE A CHANNEL FOLDER' : 'EMPTY · CLICK THE SLOT TO ADD TAPES';
    playlistItemsEl.append(empty);
  } else {
    const start = channelMode ? Math.max(0, (currentIndex >= 0 ? currentIndex : channel.cursor || 0) - 1) : 0;
    const end = channelMode ? Math.min(tracks.length, start + 8) : tracks.length;
    for (let index = start; index < end; index += 1) {
      const track = tracks[index];
      const row = document.createElement('li');
      row.className = `playlist-row${index === currentIndex ? ' current' : ''}${track.unavailable ? ' unavailable' : ''}`;
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'track-entry';
      play.setAttribute('aria-current', String(index === currentIndex));
      play.disabled = Boolean(track.unavailable);
      play.title = track.unavailable ? 'File is unavailable; reconnect its drive and rescan' : `Play ${track.title}`;
      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'track-title';
      name.textContent = channelMode ? `${track.showName || 'SHOW'} · ${track.title || 'Untitled episode'}` : track.title || 'Untitled video';
      play.append(number, name);
      play.addEventListener('click', () => playTrack(index, channelMode ? null : explicitPlaybackRestore(index)));
      if (!channelMode) {
        const eject = document.createElement('button');
        eject.type = 'button';
        eject.className = 'eject-track';
        eject.setAttribute('aria-label', `Eject ${track.title || 'video'} from playlist`);
        eject.title = track.managedLocalCopy
          ? 'Eject tape and remove its Saturday Tube local copy; keep the original source'
          : 'Eject from playlist; keep the original file';
        eject.textContent = '⏏';
        eject.addEventListener('click', () => { void ejectTrack(index); });
        row.append(play, eject);
      } else row.append(play);
      playlistItemsEl.append(row);
    }
  }
}
function fileExtensionForTrack(track) {
  for (const source of [track?.path, track?.title]) {
    if (typeof source !== 'string' || !source) continue;
    const fileName = source.split(/[?#]/, 1)[0].split(/[\\/]/).pop() || '';
    const match = /\.([a-z0-9]{1,8})$/i.exec(fileName);
    if (match) return match[1].toUpperCase();
  }
  return '';
}
function hideFileExtension() {
  if (extensionTimer) clearTimeout(extensionTimer);
  extensionTimer = null;
  visibleFileExtension = '';
}
function showPlaybackCursor() {
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = null;
  document.body.classList.remove('cursor-idle');
  if (!hasVideo || video.paused || libraryDialog.open) return;
  cursorTimer = setTimeout(() => {
    if (hasVideo && !video.paused && !libraryDialog.open) document.body.classList.add('cursor-idle');
  }, 1200);
}
function clearPlaybackCursor() {
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = null;
  document.body.classList.remove('cursor-idle');
}
function showFileExtension() {
  const extension = fileExtensionForTrack(activePlaylist()?.tracks[currentIndex]);
  if (!extension) { hideFileExtension(); return; }
  if (extensionTimer) clearTimeout(extensionTimer);
  visibleFileExtension = extension;
  extensionTimer = setTimeout(hideFileExtension, 2000);
}
function findNextPlayableTrack(startIndex) {
  const list = activePlaylist();
  if (!list) return -1;
  for (let index = startIndex; index < list.tracks.length; index += 1) {
    const track = list.tracks[index];
    if (track && !track.unavailable && track.url) return index;
  }
  return -1;
}
function findPreviousPlayableTrack(startIndex) {
  const list = activePlaylist();
  if (!list) return -1;
  for (let index = startIndex; index >= 0; index -= 1) {
    const track = list.tracks[index];
    if (track && !track.unavailable && track.url) return index;
  }
  return -1;
}
function savePlaybackSession() {
  if (moviePrerollState) return;
  if (selectedInput === 'tv' || (selectedInput === 'static' && staticReturnInput === 'tv')) { persistChannels(); return; }
  if (!hasVideo || switchingTracks || currentIndex < 0) return;
  const track = activePlaylist()?.tracks[currentIndex];
  if (!track?.path) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      playlistId: activePlaylistId,
      trackPath: track.path,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      wasPlaying: selectedInput === 'static' ? resumeVideoAfterStatic : !video.paused && !video.ended,
      input: selectedInput
    }));
  } catch (error) { console.warn('Playback position could not be saved', error); }
}
function explicitPlaybackRestore(index) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
  const track = activePlaylist()?.tracks[index];
  if (!saved || saved.playlistId !== activePlaylistId || saved.trackPath !== track?.path) return null;
  return {
    trackPath: track.path,
    currentTime: Math.max(0, Number(saved.currentTime) || 0),
    wasPlaying: true,
    input: 'video'
  };
}
function shutOffPicture() {
  if (shuttingOff) return;
  if (stage.classList.contains('booting')) {
    pendingStartupShutoff = true;
    return;
  }
  playSoundEffect('crtCutoff');
  shuttingOff = true;
  syncLoopingSoundEffects();
  clearPlaybackCursor();
  hideFileExtension();
  lastCompositePaused = null;
  stage.classList.add('shutting-off');
  setStatus('FINISHED');
  document.querySelector('#deckState').textContent = 'END OF TAPE';
}
function clearPlayback() {
  startupIntroActive = false;
  stage.classList.remove('startup-intro');
  playbackRequestId++;
  switchingTracks = true;
  pendingPlaybackRestore = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable in a restricted session. */ }
  video.pause();
  clearPlaybackCursor();
  shuttingOff = false;
  hideFileExtension();
  stage.classList.remove('shutting-off');
  lastCompositePaused = null;
  lastUploadedTime = -1;
  lastRenderedSource = null;
  video.removeAttribute('src');
  video.load();
  for (const track of Array.from(video.querySelectorAll('track'))) track.remove();
  currentSubtitleTrack = null;
  externalTrackCount = 0;
  caption.textContent = '';
  hasVideo = false;
  syncLoopingSoundEffects();
  currentIndex = -1;
  const showLanding = startupIntroActive && selectedInput !== 'tv';
  stage.classList.toggle('empty', showLanding);
  document.querySelector('#emptyState').hidden = !showLanding;
  titleEl.textContent = showLanding ? 'Saturday morning starts here' : '';
  seek.value = '0';
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playButton.textContent = '▶ PLAY';
  fallbackAttempted = false;
  playbackGeneration += 1;
  activePlaybackGeneration = -1;
  activePlaybackUrl = '';
  activePlaybackChannelId = '';
  activePlaybackTuneToken = -1;
  activePlaybackPath = '';
  document.querySelector('#deckState').textContent = 'TAPE READY';
  refreshSubtitleTracks();
  renderPlaylist();
}
async function startMovieTrailerSequence(index, durationSeconds) {
  const movie = activePlaylist()?.tracks[index];
  if (!movie || selectedInput !== 'video' || movie.channelMedia || !window.SaturdayMoviePreroll?.isFeatureMovie(durationSeconds)) return false;
  const trailers = await window.tube.getMovieTrailers();
  const selected = window.SaturdayMoviePreroll.selectMovieTrailers(trailers, Math.random, movie.path);
  if (!selected.length) return false;
  moviePrerollState = { movieIndex: index, movie, trailers: selected, trailerIndex: 0 };
  window.saturdayTubeMoviePrerollActive = true;
  const first = selected[0];
  beginTrackPlayback(index, null, { ...first, title: `PREVIEW 1/${selected.length} · ${first.title}` });
  return true;
}
function ensureLocalTapeOnce(sourcePath) {
  if (localTapeCopyJobs.has(sourcePath)) return localTapeCopyJobs.get(sourcePath);
  const job = Promise.resolve().then(() => window.tube.ensureLocalTape(sourcePath));
  localTapeCopyJobs.set(sourcePath, job);
  const clearJob = () => {
    if (localTapeCopyJobs.get(sourcePath) === job) localTapeCopyJobs.delete(sourcePath);
  };
  job.then(clearJob, clearJob);
  return job;
}
function beginTrackPlayback(index, restoreSession = null, trackOverride = null) {
  const list = activePlaylist();
  const track = trackOverride || list?.tracks[index];
  if (!track || track.unavailable || !track.url) return;
  if (selectedInput === 'static') { resumeVideoAfterStatic = false; setInputSource('video', false); }
  pendingPlaybackRestore = restoreSession;
  switchingTracks = true;
  if (!track.channelMedia && !trackOverride && !moviePrerollMoviePath) playSoundEffect('vhsInsert');
  for (const item of Array.from(video.querySelectorAll('track'))) item.remove();
  currentSubtitleTrack = null;
  externalTrackCount = 0;
  caption.textContent = '';
  video.pause();
  shuttingOff = false;
  hideFileExtension();
  stage.classList.remove('shutting-off');
  lastCompositePaused = null;
  lastUploadedTime = -1;
  lastRenderedSource = null;
  hasVideo = true;
  currentIndex = index;
  fallbackAttempted = false;
  playbackGeneration += 1;
  activePlaybackGeneration = playbackGeneration;
  activePlaybackUrl = track.url;
  activePlaybackChannelId = track.channelMedia === true && selectedInput === 'tv' ? activeChannelId : '';
  activePlaybackTuneToken = activePlaybackChannelId ? channelTuneToken : -1;
  activePlaybackPath = track.path || '';
  video.src = track.url;
  video.load();
  titleEl.textContent = track.title;
  stage.classList.remove('empty');
  document.querySelector('#emptyState').hidden = true;
  seek.value = '0';
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playButton.textContent = '▶ PLAY';
  document.querySelector('#deckState').textContent = 'LOADING TAPE';
  setStatus('LOADING CARTOON');
  renderPlaylist();
}
function playTrack(index, restoreSession = null) {
  if (!moviePrerollState) window.saturdayTubeMoviePrerollActive = false;
  if (moviePrerollMoviePath && activePlaylist()?.tracks[index]?.path !== moviePrerollMoviePath) moviePrerollMoviePath = '';
  const list = activePlaylist();
  let track = list?.tracks[index];
  if (!track || track.unavailable || !track.url) return;
  unlockPlaybackAudio();
  if (track.channelMedia) {
    const channel = activeChannel();
    if (!channel || selectedInput !== 'tv' || channel.queue[index]?.path !== track.path) return;
    if (!channelOwnsPlaybackTrack(channel, track)) {
      setTVSearching(false);
      setStatus('CHANNEL SOURCE OUTSIDE ACTIVE LINEUP');
      document.querySelector('#deckState').textContent = 'SOURCE ERROR';
      return;
    }
    if (!restoreSession) {
      void syncActiveBroadcast(true);
      return;
    }
    channel.cursor = index;
    setStatus(track.channelAd ? 'ON AIR · COMMERCIAL' : 'ON AIR · CHANNEL PROGRAM');
    beginTrackPlayback(index, restoreSession, channelPlaybackSource(track));
    persistChannels();
    return;
  }
  if (ejectingManagedPaths.has(track.path)) {
    setStatus('TAPE IS BEING EJECTED');
    return;
  }
  const requestId = ++playbackRequestId;
  if (track.managedLocalCopy) {
    beginTrackPlayback(index, restoreSession);
    return;
  }
  const playlistId = list.id;
  const sourcePath = track.path;
  setStatus('COPYING TAPE TO THIS MAC');
  void ensureLocalTapeOnce(sourcePath).then(local => {
    const targetList = playlists.find(item => item.id === playlistId);
    const targetTrack = targetList?.tracks[index];
    if (!targetTrack || (targetTrack.path !== sourcePath && targetTrack.path !== local.path)) return;
    if (!targetTrack.managedLocalCopy || targetTrack.path !== local.path) {
      targetList.tracks[index] = {
        ...targetTrack,
        ...local,
        title: targetTrack.title || local.title,
        sourcePath: targetTrack.sourcePath || local.sourcePath || sourcePath,
        managedLocalCopy: true,
        unavailable: false
      };
    }
    persistPlaylists();
    renderPlaylist();
    if (activePlaylistId !== playlistId || requestId !== playbackRequestId) return;
    if (restoreSession) restoreSession = { ...restoreSession, trackPath: local.path };
    beginTrackPlayback(index, restoreSession);
  }).catch(error => {
    if (requestId !== playbackRequestId) return;
    console.error('Tape could not be copied to this Mac', error);
    setStatus('LOCAL COPY FAILED · ORIGINAL KEPT');
    document.querySelector('#deckState').textContent = 'COPY ERROR';
  });
}
function otherPlaylistReferences(filePath, playlistId, trackIndex) {
  return playlists.reduce((count, list) => count + list.tracks.reduce((matches, track, index) => (
    matches + (track.path === filePath && !(list.id === playlistId && index === trackIndex) ? 1 : 0)
  ), 0), 0);
}
async function ejectTrack(index) {
  const list = activePlaylist();
  const track = list?.tracks[index];
  if (!list || !track) return;
  const filePath = track.path;
  const sharedReferences = track.managedLocalCopy ? otherPlaylistReferences(filePath, list.id, index) : 0;
  const removeLocalCopy = track.managedLocalCopy === true && sharedReferences === 0;
  const detail = removeLocalCopy
    ? '\\n\\nThis deletes only Saturday Tube’s local copy from this Mac. The original source file is never deleted.'
    : sharedReferences
      ? '\\n\\nAnother playlist still uses this local copy, so the copy will stay on this Mac.'
      : '\\n\\nThis is not an app-managed copy, so ejecting removes only the playlist entry. The source file stays untouched.';
  if (!window.confirm(`Eject “${track.title || 'this tape'}” from the playlist?${detail}`)) return;

  const playlistId = list.id;
  const wasCurrent = activePlaylistId === playlistId && currentIndex === index;
  playbackRequestId++;
  if (removeLocalCopy) ejectingManagedPaths.add(filePath);
  if (wasCurrent) clearPlayback();
  try {
    if (removeLocalCopy) await window.tube.ejectManagedTape(filePath);
    const liveList = playlists.find(item => item.id === playlistId);
    if (!liveList || liveList.tracks[index]?.path !== filePath) return;
    liveList.tracks.splice(index, 1);
    if (activePlaylistId === playlistId && !wasCurrent && index < currentIndex) currentIndex--;
    persistPlaylists();
    renderPlaylist();
    playSoundEffect('vhsEject');
    setStatus(removeLocalCopy ? 'TAPE EJECTED · LOCAL COPY REMOVED' : sharedReferences ? 'TAPE EJECTED · SHARED COPY KEPT' : 'TAPE EJECTED · ORIGINAL FILE KEPT');
  } catch (error) {
    console.error('Managed tape could not be safely ejected', error);
    setStatus('EJECT FAILED · LOCAL COPY KEPT');
  } finally {
    if (removeLocalCopy) ejectingManagedPaths.delete(filePath);
  }
}
function createPlaylist() {
  const list = { id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `Playlist ${playlists.length + 1}`, tracks: [] };
  playlists.push(list);
  activePlaylistId = list.id;
  clearPlayback();
  persistPlaylists();
  playlistName.focus();
  playlistName.select();
  setStatus('NEW PLAYLIST');
}
function deleteActivePlaylist() {
  const list = activePlaylist();
  if (!list) return;
  const confirmed = window.confirm(`Delete the playlist “${list.name}”? Its video files will stay on disk.`);
  if (!confirmed) return;
  const index = playlists.findIndex(item => item.id === list.id);
  playlists.splice(index, 1);
  if (!playlists.length) playlists.push({ id: `playlist-${Date.now()}`, name: 'Saturday Morning', tracks: [] });
  activePlaylistId = playlists[Math.min(Math.max(index, 0), playlists.length - 1)].id;
  clearPlayback();
  persistPlaylists();
  renderPlaylist();
  setStatus('PLAYLIST REMOVED · MEDIA FILES KEPT');
}
async function loadPlaylists() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || 'null');
    if (Array.isArray(raw)) {
      playlists = raw.filter(item => item && typeof item.id === 'string').map(item => ({
        id: item.id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Untitled Playlist',
        tracks: Array.isArray(item.tracks) ? item.tracks.filter(track => track && typeof track.path === 'string').map(track => ({
          path: track.path,
          title: track.title || track.path.split(/[\\/]/).pop(),
          managedLocalCopy: track.managedLocalCopy === true,
          sourcePath: typeof track.sourcePath === 'string' ? track.sourcePath : null,
          unavailable: true
        })) : []
      }));
    }
  } catch (error) { console.warn('Saved playlists could not be read', error); }
  if (!playlists.length) playlists = [{ id: 'playlist-saturday-morning', name: 'Saturday Morning', tracks: [] }];
  const savedActivePlaylist = localStorage.getItem('saturdayTube.activePlaylist.v1');
  activePlaylistId = playlists.some(list => list.id === savedActivePlaylist) ? savedActivePlaylist : playlists[0].id;
  const paths = [...new Set(playlists.flatMap(list => list.tracks.map(track => track.path)))];
  if (paths.length) {
    try {
      const restored = await window.tube.restoreVideos(paths);
      const byPath = new Map(restored.map(track => [track.path, track]));
      for (const list of playlists) list.tracks = list.tracks.map(saved => ({ ...saved, ...(byPath.get(saved.path) || {}), unavailable: !byPath.has(saved.path) }));
    } catch (error) { console.error('Saved video sources could not be restored', error); }
  }
  persistPlaylists();
  renderPlaylist();
}
function stepTrack(direction) {
  const list = activePlaylist();
  if (!list?.tracks.length) return;
  if (currentIndex < 0) {
    const first = direction > 0 ? findNextPlayableTrack(0) : findPreviousPlayableTrack(list.tracks.length - 1);
    if (first >= 0) playTrack(first);
    return;
  }
  const next = direction > 0 ? findNextPlayableTrack(currentIndex + 1) : findPreviousPlayableTrack(currentIndex - 1);
  if (next >= 0) playTrack(next);
}
async function chooseSubtitle() {
  try {
    const selected = await window.tube.openSubtitle();
    if (!selected) { refreshSubtitleTracks(); return; }
    const element = document.createElement('track');
    element.kind = 'subtitles';
    element.label = selected.title;
    element.src = selected.url;
    element.default = false;
    element.addEventListener('load', () => {
      refreshSubtitleTracks();
      const index = Array.from(video.textTracks).findIndex(track => track.label === selected.title);
      if (index >= 0) { subtitleSelect.value = String(index); useSubtitleTrack(String(index)); }
      setStatus('SUBTITLES READY');
    }, { once: true });
    video.append(element);
    externalTrackCount++;
    setStatus('LOADING SUBTITLES');
  } catch (error) { setStatus('COULD NOT LOAD SUBTITLES'); console.error(error); }
}
function refreshSubtitleTracks() {
  const tracks = video.textTracks;
  const activeIndex = currentSubtitleTrack ? Array.from(tracks).indexOf(currentSubtitleTrack) : -1;
  subtitleSelect.replaceChildren(new Option('Off', 'off'));
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    subtitleSelect.add(new Option(track.label || track.language || (track.kind === 'subtitles' ? `Subtitle ${i + 1}` : `Captions ${i + 1}`), String(i)));
  }
  subtitleSelect.add(new Option('Load captions…', 'load'));
  subtitleSelect.value = activeIndex >= 0 ? String(activeIndex) : 'off';
  subtitleSelect.disabled = false;
}
function useSubtitleTrack(index) {
  const tracks = video.textTracks;
  for (let i = 0; i < tracks.length; i++) tracks[i].mode = 'disabled';
  caption.textContent = '';
  if (index === 'off') { currentSubtitleTrack = null; refreshSubtitleTracks(); return; }
  const track = tracks[Number(index)];
  if (!track) return;
  currentSubtitleTrack = track;
  track.mode = 'hidden';
  const update = () => {
    const cues = track.activeCues;
    caption.textContent = cues && cues.length ? Array.from(cues).map(cue => cue.text).join('\n') : '';
  };
  track.removeEventListener('cuechange', track._tubeCueChange || (() => {}));
  track._tubeCueChange = update;
  track.addEventListener('cuechange', update);
  update();
  refreshSubtitleTracks();
}
function dialValue(dial) {
  return Number(dial.getAttribute('aria-valuenow'));
}
function dialValueText(dial, value) {
  if (dial.id === 'hue') return `${Math.round((value - 50) * 3.6)} degrees`;
  return `${Math.round(value)} percent`;
}
function dialReadoutText(dial, value) {
  if (dial.id === 'hue') return `${Math.round((value - 50) * 3.6)}°`;
  return `${Math.round(value)}%`;
}
function setDialValue(dial, value) {
  const min = Number(dial.getAttribute('aria-valuemin'));
  const max = Number(dial.getAttribute('aria-valuemax'));
  const clamped = Math.round(Math.max(min, Math.min(max, value)));
  dial.setAttribute('aria-valuenow', String(clamped));
  dial.setAttribute('aria-valuetext', dialValueText(dial, clamped));
  dial.style.setProperty('--knob-angle', `${-135 + ((clamped - min) / (max - min)) * 270}deg`);
  dial.style.setProperty('--dial-percent', `${((clamped - min) / (max - min)) * 100}`);
  document.querySelector(`#${dial.id}Readout`).textContent = dialReadoutText(dial, clamped);
  if (dial === videoDial) {
    document.querySelector('#volumeArrowReadout').textContent = dialReadoutText(dial, clamped);
    document.querySelector('#volumeDownButton').disabled = clamped <= 0;
    document.querySelector('#volumeUpButton').disabled = clamped >= 100;
  }
}
function adjustMasterVolume(direction) {
  const before = dialValue(videoDial);
  setDialValue(videoDial, before + Math.sign(direction) * 5);
  if (dialValue(videoDial) === before) return;
  setMasterVolume();
  saveControlPreferences();
}
function bindRotaryDial(dial, onChange = () => {}) {
  let drag = null;
  const min = Number(dial.getAttribute('aria-valuemin'));
  const max = Number(dial.getAttribute('aria-valuemax'));
  const span = max - min;

  dial.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    playSoundEffect('knob');
    event.preventDefault();
    dial.focus({ preventScroll: true });
    const before = dialValue(dial);
    if (dial.classList.contains('dial-bar')) {
      const bounds = dial.getBoundingClientRect();
      const fraction = bounds.width ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0;
      setDialValue(dial, min + fraction * span);
      if (dialValue(dial) !== before) onChange();
    }
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, value: dialValue(dial), axis: null };
    dial.classList.add('is-dragging');
    dial.setPointerCapture(event.pointerId);
  });
  dial.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = drag.y - event.clientY;
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 2) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (!drag.axis) return;
    const movement = drag.axis === 'x' ? dx : dy;
    const next = drag.value + movement * span / (event.shiftKey ? 280 : 140);
    const before = dialValue(dial);
    setDialValue(dial, next);
    if (dialValue(dial) !== before) onChange();
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    dial.classList.remove('is-dragging');
    stopSoundEffect('knob');
  };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);
  dial.addEventListener('lostpointercapture', () => {
    drag = null;
    dial.classList.remove('is-dragging');
    stopSoundEffect('knob');
  });
  dial.addEventListener('keydown', event => {
    let next = dialValue(dial);
    const fine = event.shiftKey ? 1 : 5;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next += fine;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next -= fine;
    else if (event.key === 'PageUp') next += 10;
    else if (event.key === 'PageDown') next -= 10;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else return;
    event.preventDefault();
    const before = dialValue(dial);
    setDialValue(dial, next);
    if (dialValue(dial) !== before) { playSoundEffect('knob'); onChange(); }
  });
}
function updateDial(dial) {
  const min = Number(dial.getAttribute('aria-valuemin'));
  const max = Number(dial.getAttribute('aria-valuemax'));
  const value = Math.max(min, Math.min(max, dialValue(dial)));
  dial.style.setProperty('--knob-angle', `${-135 + ((value - min) / (max - min)) * 270}deg`);
  dial.style.setProperty('--dial-percent', `${((value - min) / (max - min)) * 100}`);
  dial.setAttribute('aria-valuenow', String(Math.round(value)));
  dial.setAttribute('aria-valuetext', dialValueText(dial, value));
  document.querySelector(`#${dial.id}Readout`).textContent = dialReadoutText(dial, value);
  if (dial === videoDial) {
    document.querySelector('#volumeArrowReadout').textContent = dialReadoutText(dial, value);
    document.querySelector('#volumeDownButton').disabled = value <= 0;
    document.querySelector('#volumeUpButton').disabled = value >= 100;
  }
}
async function toggleFullscreen(target) {
  try {
    if (document.fullscreenElement === target) await document.exitFullscreen();
    else await target.requestFullscreen();
  } catch (error) { setStatus('FULLSCREEN NOT AVAILABLE'); console.error(error); }
}
let nativeWindowFullscreen = false;
async function toggleNativeWindowFullscreen() {
  try {
    nativeWindowFullscreen = await window.tube.toggleWindowFullscreen();
    syncFullscreenButtonState();
  } catch (error) { setStatus('FULLSCREEN NOT AVAILABLE'); console.error(error); }
}
function syncFullscreenButtonState() {
  document.querySelector('#screenOnlyButton').setAttribute('aria-pressed', String(document.fullscreenElement === stage));
  document.querySelector('#tvFullscreenButton').setAttribute('aria-pressed', String(nativeWindowFullscreen || document.fullscreenElement === tvSet));
}

playlistSelect.addEventListener('change', () => {
  activePlaylistId = playlistSelect.value;
  clearPlayback();
  persistPlaylists();
  setStatus('PLAYLIST READY');
});
document.querySelector('#newPlaylistButton').addEventListener('click', createPlaylist);
document.querySelector('#deletePlaylistButton').addEventListener('click', deleteActivePlaylist);
playlistName.addEventListener('input', () => {
  const list = activePlaylist();
  if (!list) return;
  list.name = playlistName.value;
  renderPlaylistSelect();
  persistPlaylists();
});
playlistName.addEventListener('blur', () => {
  const list = activePlaylist();
  if (!list) return;
  if (!list.name.trim()) list.name = 'Untitled Playlist';
  playlistName.value = list.name;
  renderPlaylistSelect();
  persistPlaylists();
});
document.querySelector('#openButton').addEventListener('click', openLibrary);
libraryAddFileButton.addEventListener('click', importTapesToShelf);
libraryImportClear.addEventListener('click', () => {
  clearLibraryImportDismissTimer();
  libraryImportPanel.dataset.outcome = '';
  libraryImportPanel.hidden = true;
  libraryImportItems.replaceChildren();
  libraryImportRows.clear();
});
window.tube.onLibraryImportProgress(updateLibraryImportProgress);
document.querySelector('#libraryCloseButton').addEventListener('click', () => libraryDialog.close());
document.querySelector('#libraryCancelButton').addEventListener('click', () => libraryDialog.close());
document.querySelector('#libraryFolderButton').addEventListener('click', chooseLibraryFolder);
document.querySelector('#libraryUpButton').addEventListener('click', () => {
  if (!libraryView || libraryView.current === libraryView.root) return;
  const parent = libraryView.current.replace(/\/$/, '').slice(0, libraryView.current.replace(/\/$/, '').lastIndexOf('/')) || '/';
  loadLibraryFolder(parent);
});
librarySearch.addEventListener('input', renderLibrary);
libraryAddButton.addEventListener('click', addLibrarySelection);
libraryDialog.addEventListener('click', event => { if (event.target === libraryDialog) libraryDialog.close(); });
document.querySelector('#subtitleButton').addEventListener('click', chooseSubtitle);
playButton.addEventListener('click', () => {
  if (selectedInput === 'tv') return;
  if (selectedInput === 'static') {
    const resume = resumeVideoAfterStatic;
    setInputSource('video');
    if (!resume && hasVideo && video.paused) startVideoPlayback().catch(() => {});
    return;
  }
  video.paused ? startVideoPlayback().catch(() => {}) : video.pause();
});
document.querySelector('#previousButton').addEventListener('click', () => {
  if (selectedInput === 'tv') return;
  if (video.currentTime > 3) video.currentTime = 0;
  else stepTrack(-1);
});
document.querySelector('#nextButton').addEventListener('click', () => {
  if (selectedInput !== 'tv') stepTrack(1);
});
video.addEventListener('play', () => {
  if (!isCurrentPlaybackEvent()) return;
  if (startupIntroActive) {
    startupIntroActive = false;
    stage.classList.remove('startup-intro');
  }
  if (shuttingOff) { shuttingOff = false; stage.classList.remove('shutting-off'); }
  pendingStartupShutoff = false;
  video.defaultMuted = false;
  video.muted = false;
  setMasterVolume();
  savePlaybackSession();
  showFileExtension();
  showPlaybackCursor();
  lastCompositePaused = null;
  if (audioContext && audioContext.state !== 'running') audioContext.resume().catch(error => console.warn('Playback audio context resume was deferred', error));
  playButton.textContent = 'Ⅱ PAUSE';
  setStatus('PLAYING');
  document.querySelector('#deckState').textContent = 'PLAYING';
  applyAudioEffect(false);
});
video.addEventListener('playing', () => {
  if (selectedInput !== 'tv') {
    setTVSearching(false);
    return;
  }
  if (isCurrentChannelPlayback()) {
    setTVSearching(false);
    recordChannelPlayback(activeChannel(), activeChannel()?.queue?.[currentIndex]);
    recordChannelTuneMetric('playing');
    const metric = activeChannelTuneMetric;
    const captureFirstFrame = () => {
      if (metric !== activeChannelTuneMetric || !isCurrentChannelPlayback()) return;
      recordChannelTuneMetric('first-frame');
    };
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(captureFirstFrame);
    else captureFirstFrame();
  }
});
video.addEventListener('waiting', () => {
  if (isCurrentChannelPlayback()) setTVSearching(true, TV_SEARCHING_GRACE_MS);
});
video.addEventListener('pause', () => {
  if (!isCurrentPlaybackEvent()) return;
  if (!switchingTracks) savePlaybackSession();
  clearPlaybackCursor();
  lastCompositePaused = null;
  playButton.textContent = '▶ PLAY';
  applyAudioEffect(false);
  if (hasVideo && !video.ended && !shuttingOff) { setStatus('PAUSED'); document.querySelector('#deckState').textContent = 'PAUSED'; }
});
window.setInterval(() => {
  if (selectedInput === 'tv') void syncActiveBroadcast(false);
}, 500);
window.setInterval(() => {
  if (channels.length) saveChannelPlaybackState();
}, CHANNEL_PLAYBACK_SAVE_INTERVAL_MS);
video.addEventListener('ended', () => {
  if (!isCurrentPlaybackEvent()) return;
  if (moviePrerollState && selectedInput === 'video') {
    const state = moviePrerollState;
    state.trailerIndex += 1;
    if (state.trailerIndex < state.trailers.length) {
      const trailer = state.trailers[state.trailerIndex];
      beginTrackPlayback(state.movieIndex, null, { ...trailer, title: `PREVIEW ${state.trailerIndex + 1}/${state.trailers.length} · ${trailer.title}` });
    } else {
      moviePrerollState = null;
      window.saturdayTubeMoviePrerollActive = false;
      moviePrerollMoviePath = state.movie.path;
      beginTrackPlayback(state.movieIndex);
    }
    return;
  }
  if (selectedInput === 'tv' && activeChannel()) {
    const channel = activeChannel();
    const position = locateChannelSegment(channel, broadcastElapsed(channel));
    if (position && position.index === currentIndex && channel.broadcast) {
      channel.broadcast.startedAtMs -= Math.max(0, position.segment.durationSeconds - position.offsetSeconds) * 1000;
    }
    void syncActiveBroadcast(true);
    return;
  }
  const nextIndex = findNextPlayableTrack(currentIndex + 1);
  if (nextIndex >= 0) playTrack(nextIndex);
  else shutOffPicture();
});
video.addEventListener('error', () => {
  if (!isCurrentPlaybackEvent()) return;
  switchingTracks = false;
  if (!hasVideo) return;
  const stopSearchingAfterFailure = () => { if (selectedInput === 'tv') setTVSearching(false); };
  if (fallbackAttempted) {
    if (selectedInput === 'tv') recordChannelTuneMetric('transcode-error');
    const nativeError = video.error;
    setStatus(nativeError?.code === 4 ? 'UNSUPPORTED OR DAMAGED VIDEO' : 'VIDEO COULD NOT PLAY');
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    stopSearchingAfterFailure();
    return;
  }
  const list = activePlaylist();
  const track = list?.tracks[currentIndex];
  if (!track?.id || !window.tube.transcodeMedia) {
    setStatus('VIDEO COULD NOT PLAY');
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    stopSearchingAfterFailure();
    return;
  }
  fallbackAttempted = true;
  const generation = playbackGeneration;
  if (selectedInput === 'tv') recordChannelTuneMetric('source-error');
  setStatus('DECODING TAPE');
  if (selectedInput === 'tv') recordChannelTuneMetric('transcode-start');
  document.querySelector('#deckState').textContent = 'CONVERTING TAPE';
  window.tube.transcodeMedia(track.id).then(converted => {
    if (generation !== playbackGeneration || !converted?.url) return;
    if (selectedInput === 'tv') recordChannelTuneMetric('transcode-ready');
    activePlaybackUrl = converted.url;
    video.src = converted.url;
    video.load();
    setStatus('TAPE RESTORED');
  }).catch(error => {
    if (generation !== playbackGeneration) return;
    console.error('Video compatibility conversion failed', error);
    if (selectedInput === 'tv') recordChannelTuneMetric('transcode-error');
    setStatus(String(error?.message || 'VIDEO COULD NOT PLAY').slice(0, 70));
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    stopSearchingAfterFailure();
  });
});
video.addEventListener('loadedmetadata', () => {
  if (!isCurrentPlaybackEvent()) return;
  if (isCurrentChannelPlayback()) recordChannelTuneMetric('metadata');
  switchingTracks = false;
  durationEl.textContent = fmt(video.duration);
  refreshSubtitleTracks();
  if (audioContext?.state === 'suspended') audioContext.resume().catch(error => console.warn('Audio context resume was deferred', error));
  setMasterVolume();
  applyAudioEffect(false);
  const restore = pendingPlaybackRestore;
  pendingPlaybackRestore = null;
  if (!restore && !moviePrerollMoviePath && !moviePrerollState && selectedInput === 'video' && activePlaylist()?.tracks[currentIndex]?.channelMedia !== true
    && window.SaturdayMoviePreroll?.isFeatureMovie(video.duration)) {
    const generation = playbackGeneration;
    void startMovieTrailerSequence(currentIndex, video.duration).then(started => {
      if (generation !== playbackGeneration || started) return;
      setStatus('READY TO WATCH');
      startVideoPlayback().catch(error => console.error('Movie playback could not start', error));
    }).catch(error => {
      console.warn('Movie trailer folder is unavailable; starting the selected movie', error);
      if (generation === playbackGeneration) startVideoPlayback().catch(() => {});
    });
    return;
  }
  if (moviePrerollMoviePath === activePlaylist()?.tracks[currentIndex]?.path) moviePrerollMoviePath = '';
  if (restore && restore.trackPath === activePlaylist()?.tracks[currentIndex]?.path) {
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : restore.currentTime;
    video.currentTime = Math.min(restore.currentTime, end);
    if (restore.input === 'static') {
      setInputSource('static', false);
      resumeVideoAfterStatic = restore.wasPlaying;
    } else if (restore.wasPlaying) {
      setStatus('READY TO WATCH');
      scheduleChannelPlaybackDiagnostic();
      startVideoPlayback().catch(error => {
        console.error('Playback could not start automatically', error);
        if (selectedInput === 'tv') {
          setTVSearching(false);
          setStatus('TV AUTOPLAY FAILED · CHECK AUDIO');
        }
      });
    } else {
      setStatus('PAUSED');
      playButton.textContent = '▶ PLAY';
      document.querySelector('#deckState').textContent = 'PAUSED';
    }
  } else {
    setStatus('READY TO WATCH');
    scheduleChannelPlaybackDiagnostic();
    startVideoPlayback().catch(error => {
      console.error('Playback could not start automatically', error);
      if (selectedInput === 'tv') setStatus('TV AUTOPLAY FAILED · CHECK AUDIO');
    });
  }
  savePlaybackSession();
  prepareChannelAudioCompatibility(activePlaylist()?.tracks[currentIndex]);
});
video.addEventListener('timeupdate', () => {
  if (!isCurrentPlaybackEvent()) return;
  currentTimeEl.textContent = fmt(video.currentTime);
  if (Number.isFinite(video.duration) && video.duration > 0 && !seek.matches(':active')) seek.value = String(Math.round(video.currentTime / video.duration * 1000));
  savePlaybackSession();
});
video.addEventListener('addtrack', refreshSubtitleTracks);
video.textTracks.addEventListener?.('addtrack', refreshSubtitleTracks);
seek.addEventListener('input', () => {
  if (selectedInput !== 'tv' && Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 1000 * video.duration;
});
subtitleSelect.addEventListener('change', () => {
  if (subtitleSelect.value === 'load') { chooseSubtitle(); return; }
  useSubtitleTrack(subtitleSelect.value);
});
audioOutputSelect.addEventListener('change', () => {
  if (audioOutputSelect.value === 'choose') {
    void chooseAudioOutput();
    return;
  }
  void setAudioOutputDevice(audioOutputSelect.value);
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { void refreshAudioOutputDevices(); });
bindRotaryDial(videoDial, () => {
  setMasterVolume();
  saveControlPreferences();
});
for (const dial of pictureDials) bindRotaryDial(dial, saveControlPreferences);
bindRotaryDial(fxAmountDial, () => applyAudioEffect());
setupSettingsOverlays();
primeSoundEffects();
restoreControlPreferences();
refreshAudioOutputOptions(preferredAudioOutputId !== 'default');
void refreshAudioOutputDevices();
window.tube.getStaticInput().then(media => {
  if (!media?.url) throw new Error('The bundled TV static clip is unavailable.');
  staticInputUrl = media.url;
  staticPicture.src = staticInputUrl;
  staticPicture.load();
  scheduleFrameLoop();
  if (selectedInput === 'static') startStaticPicture();
}).catch(error => {
  setStatus('TV STATIC INPUT UNAVAILABLE');
  console.error('Bundled TV static clip could not be loaded', error);
});
resumeVideoAfterStatic = false;
resumeTVAfterStatic = false;
if (selectedInput === 'tv') {
  syncBypassControls();
  renderPlaylist();
} else {
  setInputSource(selectedInput, false);
}
startStartupSequence();
for (const dial of allDials) updateDial(dial);
setMasterVolume();
audioEffectSelect.addEventListener('change', () => setAudioEffect(audioEffectSelect.value));
finishButtons.forEach(button => button.addEventListener('click', () => setFinish(button.dataset.finish)));
inputButton.addEventListener('click', () => {
  const next = { video: 'static', static: 'tv', tv: 'video' }[selectedInput] || 'video';
  setInputSource(next);
});
channelDownButton.addEventListener('click', () => cycleActiveChannel(-1));
channelUpButton.addEventListener('click', () => cycleActiveChannel(1));
document.querySelector('#volumeDownButton').addEventListener('click', () => adjustMasterVolume(-1));
document.querySelector('#volumeUpButton').addEventListener('click', () => adjustMasterVolume(1));
addChannelButton.addEventListener('click', () => { void addChannelFolder(); });
document.querySelector('#tvGuideButton').addEventListener('click', openTVGuide);
document.querySelector('#tvGuideClose').addEventListener('click', () => tvGuideDialog.close());
tvGuideDialog.addEventListener('close', stopTVGuideRefresh);
document.querySelector('#tvGuidePrevious').addEventListener('click', () => { tvGuidePageIndex = (tvGuidePageIndex - 1 + channels.length) % channels.length; renderTVGuide(); });
document.querySelector('#tvGuideNext').addEventListener('click', () => { tvGuidePageIndex = (tvGuidePageIndex + 1) % channels.length; renderTVGuide(); });
document.querySelector('#tvGuideAdd').addEventListener('click', () => { stopTVGuideRefresh(); tvGuideDialog.close(); void addChannelFolder().then(openTVGuide); });
document.querySelector('#tvSettingsButton').addEventListener('click', () => { selectSettingsTab('video'); showScreenDialog(tvSettingsDialog); });
document.querySelector('#tvSettingsClose').addEventListener('click', () => tvSettingsDialog.close());
document.querySelector('#tvSettingsCloseFooter').addEventListener('click', () => tvSettingsDialog.close());
document.querySelector('#audioRcaButton').addEventListener('click', () => { selectSettingsTab('audio'); showScreenDialog(tvSettingsDialog); });
for (const button of document.querySelectorAll('[data-settings-tab]')) button.addEventListener('click', () => selectSettingsTab(button.dataset.settingsTab));
window.addEventListener('resize', () => { for (const dialog of [tvGuideDialog, tvSettingsDialog]) setScreenDialogBounds(dialog); });
rescanChannelButton.addEventListener('click', () => { void rescanActiveChannel(); });
soundEffectsToggle.addEventListener('click', () => {
  soundEffectsEnabled = !soundEffectsEnabled;
  syncSoundControls();
  saveControlPreferences();
});
soundEffectsVolumeControl.addEventListener('input', () => {
  soundEffectsVolume = Math.max(0, Math.min(400, Number(soundEffectsVolumeControl.value) || 0));
  syncSoundControls();
  saveControlPreferences();
});
document.addEventListener('click', event => {
  const button = event.target.closest?.('button');
  if (!button || button.classList.contains('dial')) return;
  playSoundEffect(button.id === 'openButton' ? 'vhsEject' : 'button');
}, true);
document.querySelector('#screenOnlyButton').addEventListener('click', () => toggleFullscreen(stage));
document.querySelector('#tvFullscreenButton').addEventListener('click', () => toggleNativeWindowFullscreen());
document.addEventListener('fullscreenchange', () => {
  syncFullscreenButtonState();
  canvas.width = 0;
  canvas.height = 0;
});
window.tube.onWindowFullscreenChange(isFullscreen => {
  nativeWindowFullscreen = isFullscreen;
  syncFullscreenButtonState();
  canvas.width = 0;
  canvas.height = 0;
});
window.tube.getWindowFullscreen().then(isFullscreen => {
  nativeWindowFullscreen = Boolean(isFullscreen);
  syncFullscreenButtonState();
}).catch(error => console.warn('Could not read fullscreen state', error));
pictureBypassToggle.addEventListener('click', () => {
  pictureFiltersEnabled = !pictureFiltersEnabled;
  syncBypassControls();
  saveControlPreferences();
});
audioBypassToggle.addEventListener('click', () => {
  audioFiltersEnabled = !audioFiltersEnabled;
  syncBypassControls();
  applyAudioEffect();
});
pictureModeSelect.addEventListener('change', () => {
  selectedPictureMode = ['color', 'lowstim', 'bw'].includes(pictureModeSelect.value) ? pictureModeSelect.value : 'color';
  syncBypassControls();
  saveControlPreferences();
});
displayModeSelect.addEventListener('change', () => {
  displayMode = ['crt', 'rear'].includes(displayModeSelect.value) ? displayModeSelect.value : 'crt';
  syncBypassControls();
  saveControlPreferences();
});
cabinetTintInput.addEventListener('input', () => setCabinetTint(cabinetTintInput.value));

document.addEventListener('keydown', event => {
  showPlaybackCursor();
  if (event.target.matches('input,select,button')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); openLibrary(); }
  else if (event.code === 'Space' && selectedInput === 'tv') event.preventDefault();
  else if (event.code === 'Space' && hasVideo) { event.preventDefault(); video.paused ? startVideoPlayback().catch(() => {}) : video.pause(); }
  else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selectedInput === 'tv') event.preventDefault();
  else if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  else if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
});
restoreMetadataCache();
restoreMetadataOverrides();
shelfRestorePromise = restoreShelfRoot();
loadPlaylists().catch(error => { console.error(error); renderPlaylist(); });
loadChannels().catch(error => { console.error('TV channel setup could not be restored', error); renderChannels(); });
window.addEventListener('beforeunload', () => {
  savePlaybackSession();
  saveChannelPlaybackState();
});
window.addEventListener('pagehide', saveChannelPlaybackState);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  glContextLost = true;
  setPictureFallback(true);
  setStatus('PICTURE FALLBACK');
});
canvas.addEventListener('webglcontextrestored', () => {
  try {
    if (!setupGL()) throw new Error('WebGL is unavailable after context restoration.');
    setPictureFallback(false);
    setStatus(hasVideo ? 'PICTURE RESTORED' : 'READY WHEN YOU ARE');
  } catch (error) {
    setPictureFallback(true);
    setStatus('PICTURE FALLBACK');
    console.error('CRT picture could not restore; keeping the 2D fallback', error);
  }
});
try {
  if (!setupGL()) setPictureFallback(true);
} catch (error) {
  setStatus('PICTURE FALLBACK');
  console.error('CRT shader setup failed; using the 2D picture fallback', error);
  setPictureFallback(true);
}
document.addEventListener('pointermove', showPlaybackCursor, { passive: true });
document.addEventListener('pointerdown', showPlaybackCursor, { passive: true });
libraryDialog.addEventListener('close', () => {
  scheduleFrameLoop();
  showPlaybackCursor();
});
scheduleFrameLoop();
