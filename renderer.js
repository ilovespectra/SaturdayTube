const video = document.querySelector('#video');
const canvas = document.querySelector('#picture');
const genesisCanvas = document.querySelector('#genesisPicture');
const breakFadeOverlay = document.querySelector('#breakFade');
let channelBreakFadeLevel = 1;
let channelBreakAdvanceSequence = null;
const stage = document.querySelector('#stage');
const youtubePlayerHost = document.querySelector('#youtubePlayerHost');
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
const brightnessDial = document.querySelector('#brightness');
const fxAmountDial = document.querySelector('#fxAmount');
const pictureModeSelect = document.querySelector('#pictureMode');
const displayModeSelect = document.querySelector('#displayMode');
const pictureBypassToggle = document.querySelector('#pictureBypassToggle');
const audioBypassToggle = document.querySelector('#audioBypassToggle');
const tvLevelerToggle = document.querySelector('#tvLevelerToggle');
const audioEffectSelect = document.querySelector('#audioEffectSelect');
const cabinetTintInput = document.querySelector('#cabinetTint');
const cabinetSkinSelect = document.querySelector('#cabinetSkin');
const inputButton = document.querySelector('#inputButton');
const auxLoadButton = document.querySelector('#auxLoadButton');
const auxRomFile = document.querySelector('#auxRomFile');
const soundEffectsToggle = document.querySelector('#soundEffectsToggle');
const soundEffectsVolumeControl = document.querySelector('#soundEffectsVolume');
const soundEffectsReadout = document.querySelector('#soundEffectsReadout');
const pictureDials = [scanlineDial, curveDial, edgeBlurDial, hueDial, vhsScanDial, glitchDial, brokenTapeDial, glowDial, brightnessDial];
const allDials = [videoDial, ...pictureDials, fxAmountDial];
const playlistSelect = document.querySelector('#playlistSelect');
const playlistName = document.querySelector('#playlistName');
const playlistItemsEl = document.querySelector('#playlistItems');
const channelStatus = document.querySelector('#channelStatus');
const channelRootPath = document.querySelector('#channelRootPath');
const channelSummary = document.querySelector('#channelSummary');
const addChannelButton = document.querySelector('#addChannelButton');
const chooseChannelSourceButton = document.querySelector('#chooseChannelSourceButton');
const channelSourcePath = document.querySelector('#channelSourcePath');
const rescanChannelButton = document.querySelector('#rescanChannelButton');
const channelSurfName = document.querySelector('#channelSurfName');
const channelSurfOverlay = document.querySelector('#channelSurfOverlay');
const volumeOverlay = document.querySelector('#volumeOverlay');
const muteOverlay = document.querySelector('#muteOverlay');
const channelDownButton = document.querySelector('#channelDownButton');
const channelUpButton = document.querySelector('#channelUpButton');
const tvGuideDialog = document.querySelector('#tvGuideDialog');
const tvGuidePage = document.querySelector('#tvGuidePage');
const tvGuidePageContent = document.querySelector('#tvGuidePageContent');
const tvSettingsDialog = document.querySelector('#tvSettingsDialog');
const youtubeStarterRows = document.querySelector('#youtubeStarterRows');
let guideRefreshTimer = null;
let channelSurfOverlayTimer = null;
let volumeOverlayTimer = null;
// The level to return to while muted; null when sound is on.
let mutedVolume = null;
let tvGuidePageIndex = 0;
let previousChannelId = null;
const GUIDE_WINDOW_SECONDS = 6 * 60 * 60;
const GUIDE_VISIBLE_PROGRAMS = 36;
const TV_SEARCHING_GRACE_MS = 900;
let tvSearching = false;
let tvSearchingTimer = null;
let channelStableSince = 0;
let channelLoadPhase = 'TUNING...';
let moviePrerollState = null;
let moviePrerollMoviePath = '';
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
const PLAYLISTS_KEY = 'saturdayTube.playlists.v1';
const CONTROLS_KEY = 'saturdayTube.controls.v1';
const HAD_SAVED_CONTROL_PREFERENCES = localStorage.getItem(CONTROLS_KEY) !== null;
const SESSION_KEY = 'saturdayTube.session.v1';
const METADATA_KEY = 'saturdayTube.metadata.v2';
const METADATA_OVERRIDE_KEY = 'saturdayTube.metadataOverrides.v1';
const SHELF_KEY = 'saturdayTube.shelf.root.v1';
const CHANNELS_KEY = 'saturdayTube.channels.v1';
const CHANNEL_SOURCE_KEY = 'saturdayTube.channelSource.v1';
const YOUTUBE_STARTERS_KEY = 'saturdayTube.youtubeStarters.v1';
const YOUTUBE_ACTIVE_KEY = 'saturdayTube.activeYoutubeStarter.v1';
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
const OSD_CANVAS_FONT = '"Saturday OSD", ui-monospace, SFMono-Regular, Menlo, monospace';
// Canvas text can't wait for a web font, so repaint the cached picture once the OSD lettering arrives.
document.fonts?.load?.(`48px ${OSD_CANVAS_FONT}`).then(() => { lastRenderedSource = null; }).catch(() => {});
let glContextLost = false;
let pictureFallback = false;
let pictureFiltersEnabled = true;
let audioFiltersEnabled = true;
let tvLevelerEnabled = true;
let levelerGain = null;
let levelerCompressor = null;
let levelerAnalyser = null;
let levelerSamples = null;
let levelerPower = null;
let levelerFastUntil = 0;
let levelerTimer = null;
let selectedPictureMode = 'color';
let displayMode = 'crt';
let selectedAudioEffect = 'clean';
let soundEffectsEnabled = true;
let soundEffectsVolume = 100;
let selectedInput = 'video';
let auxReturnInput = 'video';
let resumeVideoAfterAux = false;
let transitionInput = '';
let resumeVideoAfterStatic = false;
let resumeTVAfterStatic = false;
let staticReturnInput = 'video';
let transitionStatic = false;
let channelTuneToken = 0;
let activeChannelTuneMetric = null;
let channelPrewarmToken = 0;
let channelPrewarmedGeneration = -1;
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
let currentFinish = 'grey';
let cabinetTint = '#9b6334';
let cabinetSkin = 'molded';
let playlists = [];
let activePlaylistId = '';
let channels = [];
let activeChannelId = '';
let activeYoutubeStarterId = localStorage.getItem(YOUTUBE_ACTIVE_KEY) || '';
let youtubeStarterConfigurations = loadYoutubeStarterConfigurations();
let channelsStartupReady = false;
let channelWarmupPromise = null;
let channelRefreshPromise = null;
let channelShuffleStatus = '';
let channelPriorityScanPromise = null;
let channelSetupNotice = '';
const channelAudioCompatibleMedia = new Map();
const channelAudioCompatibilityJobs = new Map();
const CHANNEL_PLAYBACK_SAVE_INTERVAL_MS = 5000;
const MAX_SAVED_CHANNEL_QUEUE_ENTRIES = 6000;
const MAX_SAVED_CHANNEL_HISTORY_ENTRIES = 1000;
let currentIndex = -1;
let playingAuthenticTape = false;
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
// A live channel stream starts at `baseSeconds` into its file and can't seek; video.currentTime counts from that point.
let livePlayback = null;
let activePlaybackChannelId = '';
let activePlaybackTuneToken = -1;
let activePlaybackPath = '';
let cursorTimer = null;
let frameLoopRequest = null;
let pictureVisible = true;
let lastPictureFrame = -Infinity;
let shuttingOff = false;
let pendingStartupShutoff = false;
let startupIntroActive = true;

const vertexSource = `attribute vec2 p; varying vec2 uv; void main(){ uv=(p+1.0)*0.5; gl_Position=vec4(p,0.0,1.0); }`;
const fragmentSource = `precision mediump float;
varying vec2 uv; uniform sampler2D frame; uniform vec2 resolution; uniform float time; uniform float strength; uniform float scan; uniform float edgeBlur; uniform float hueShift; uniform float vhsScan; uniform float glitch; uniform float broken; uniform float glow; uniform float pictureMode; uniform float rearProjection; uniform float vignette; uniform float chroma; uniform sampler2D osd; uniform float osdOn;
float hash(float n){return fract(sin(n)*43758.5453);}
mat3 hueTurn(float a){float c=cos(a),s=sin(a);return mat3(0.213+0.787*c-0.213*s,0.213-0.213*c+0.143*s,0.213-0.213*c-0.787*s,0.715-0.715*c-0.715*s,0.715+0.285*c+0.140*s,0.715-0.715*c+0.715*s,0.072-0.072*c+0.928*s,0.072-0.072*c-0.283*s,0.072+0.928*c+0.072*s);}
vec4 osdSample(vec2 p,float radius){vec2 d=vec2(radius)/resolution;return texture2D(osd,p)*0.40+texture2D(osd,p+vec2(d.x,0.0))*0.15+texture2D(osd,p-vec2(d.x,0.0))*0.15+texture2D(osd,p+vec2(0.0,d.y))*0.15+texture2D(osd,p-vec2(0.0,d.y))*0.15;}
vec3 softSample(vec2 p,float radius){vec2 d=vec2(radius)/resolution;return (texture2D(frame,p).rgb*0.40+texture2D(frame,p+vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p-vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p+vec2(0.0,d.y)).rgb*0.15+texture2D(frame,p-vec2(0.0,d.y)).rgb*0.15);}
void main(){vec2 q=uv*2.0-1.0;float r2=dot(q,q);if(rearProjection<0.5)q*=1.0+strength*r2;vec2 t=q*0.5+0.5;t.y=1.0-t.y;if(t.x<0.0||t.x>1.0||t.y<0.0||t.y>1.0){gl_FragColor=vec4(0.025,0.03,0.025,1.0);return;}
vec2 screenT=t;float row=floor(t.y*resolution.y/7.0);float twitch=(hash(row+floor(time*19.0))-0.5)*0.006*glitch;float tear=step(0.992,hash(floor(time*14.0)+floor(t.y*23.0)))*glitch*0.012;float eventRate=0.12+vhsScan*0.65;float eventIndex=floor(time*eventRate);float eventPulse=step(0.80,hash(eventIndex+19.0));float bandY=fract(hash(eventIndex+41.0)+time*(0.02+vhsScan*0.20));float bandWidth=0.003+vhsScan*0.003;float triangularBand=max(0.0,1.0-abs(t.y-bandY)/bandWidth);float edgeJitter=(hash(row+eventIndex*3.0)-0.5);float tracking=eventPulse*triangularBand*edgeJitter*(0.008+vhsScan*0.025)*step(0.001,vhsScan);float microJitter=(hash(row+floor(time*(8.0+vhsScan*50.0)))-0.5)*vhsScan*0.0015;t.x=clamp(t.x+twitch+tear+tracking+microJitter,0.0,1.0);
float edge=smoothstep(0.15,1.15,r2);float blurRadius=edge*edgeBlur*1.2+rearProjection*0.65;float split=chroma*0.00015+vhsScan*0.0008+glitch*0.001;vec3 col=softSample(t,blurRadius);col.r=softSample(clamp(t+vec2(split,0.0),0.0,1.0),blurRadius).r;col.b=softSample(clamp(t-vec2(split,0.0),0.0,1.0),blurRadius).b;vec4 o=vec4(0.0);vec3 osdBloom=vec3(0.0);float osdAlpha=0.0;if(osdOn>0.5){float osdSplit=chroma*0.0005;o=osdSample(screenT,blurRadius);vec4 oR=osdSample(clamp(screenT+vec2(osdSplit,0.0),0.0,1.0),blurRadius);vec4 oB=osdSample(clamp(screenT-vec2(osdSplit,0.0),0.0,1.0),blurRadius);col=col*(1.0-o.a)+vec3(oR.r,o.g,oB.b);osdAlpha=o.a;vec4 ob=osdSample(screenT,2.0+glow*10.0);osdBloom=ob.rgb;}
col=hueTurn((hueShift-0.5)*6.28318)*col;float luma=dot(col,vec3(0.299,0.587,0.114));if(pictureMode>1.5)col=vec3(luma);else if(pictureMode>0.5){vec3 warm=vec3(luma*1.04,luma*1.01,luma*0.94);col=mix(col,warm,0.68);col=clamp((col-0.5)*0.82+0.5,0.0,1.0);}float lineCount=clamp(resolution.y/3.0,120.0,240.0);float lineWave=0.5-0.5*cos(t.y*lineCount*6.28318);col*=1.0-scan*0.2*lineWave;float dropout=step(0.995,hash(floor(t.y*resolution.y/3.0)+floor(time*8.0)))*broken*0.14;float snow=hash(floor(t.x*resolution.x/2.0)+floor(t.y*resolution.y/2.0)+floor(time*35.0))-0.5;col*=1.0-dropout*(1.0-osdAlpha);col+=snow*broken*0.012*(1.0-osdAlpha);vec3 bloom=max(max(softSample(t,2.0+glow*10.0),osdBloom)-vec3(0.62),vec3(0.0));col+=bloom*glow*0.42;float corner=1.0-0.12*r2*vignette;col*=corner;float grille=0.99+0.01*cos(t.x*resolution.x*3.14159);col*=mix(1.0,grille,scan*0.22);if(rearProjection>0.5){col=col*0.88+vec3(0.035,0.03,0.024);col=pow(max(col,vec3(0.0)),vec3(0.96));}gl_FragColor=vec4(col,1.0);}`;

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
  osdTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, osdTexture);
  for (const [name, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, name, value);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.activeTexture(gl.TEXTURE0);
  osdTextureWidth = 1;
  osdTextureHeight = 1;
  osdLayerVisible = false;
  lastUploadedTime = -1;
  glContextLost = false;
  return true;
}
function setStatus(text) { statusEl.textContent = text.toUpperCase(); }
try { window.SaturdayGenesisAux?.init(genesisCanvas); }
catch (error) { console.error('Genesis AUX could not initialize.', error); setStatus('GENESIS AUX UNAVAILABLE'); }
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
  if (window.SaturdayIntermission?.active) return null;
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
  const level = !window.SaturdayIntermission?.active && (selectedInput === 'static' || transitionStatic) && soundEffectsEnabled
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
  const playingHum = hasVideo && !video.paused && !shuttingOff && selectedAudioEffect === 'hum' && audioFiltersEnabled && !playingAuthenticTape;
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
// Channel commercials are genuine off-air VHS recordings: they already carry their own tape wear and hiss, so they play
// a little quieter, without the simulated audio tape effects or the VHS tracking lines (other picture effects still apply).
const AUTHENTIC_TAPE_VOLUME = 0.8;
function isAuthenticTapeTrack(track) {
  return track?.channelAd === true || track?.segmentType === 'commercial';
}
function setPlayingAuthenticTape(enabled) {
  enabled = enabled === true;
  if (playingAuthenticTape === enabled) return;
  playingAuthenticTape = enabled;
  setMasterVolume();
  applyAudioEffect(false);
}
// Like a real set, the top of the volume dial drives the speaker past clean: full volume is 120% gain and loud
// programmes can clip, so a comfortable listening level sits well below the end stop.
const TV_VOLUME_BOOST = 1.2;
function dialVolumeGain() {
  return dialValue(videoDial) / 100 * TV_VOLUME_BOOST;
}
function setMasterVolume(fadeOnly = false) {
  const volume = dialVolumeGain() * channelBreakFadeLevel * (playingAuthenticTape ? AUTHENTIC_TAPE_VOLUME : 1);
  video.defaultMuted = false;
  if (typeof window !== 'undefined' && window.SaturdayTubeYouTubePlayer?.getPlayer?.()) window.SaturdayTubeYouTubePlayer.setVolume(Math.min(100, Math.round(volume * 100)), mutedVolume !== null);
  if (masterGain) {
    video.volume = 1;
    video.muted = false;
    if (volume === 0 && audioContext) {
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setValueAtTime(0, audioContext.currentTime);
    } else if (fadeOnly && audioContext) masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.015);
    else smoothAudioParam(masterGain.gain, volume);
  } else {
    video.volume = Math.min(1, volume);
    video.muted = false;
  }
}
function needsAudioEffectGraph() {
  return (audioFiltersEnabled && selectedAudioEffect !== 'clean') || tvLevelerActive() || dialVolumeGain() > 1;
}
// TV leveler: a slow automatic gain measured ahead of the volume dial brings every programme, movie and ad to about the
// same loudness, adapting quickly when a new file starts; a gentle compressor catches peaks while the gain settles.
const TV_LEVELER_TARGET_DB = -22;
const TV_LEVELER_GATE_DB = -52;
const TV_LEVELER_MAX_GAIN_DB = 15;
function tvLevelerActive() {
  return tvLevelerEnabled && selectedInput === 'tv';
}
function updateTVLeveler() {
  if (!levelerGain || !audioContext) return;
  const active = tvLevelerActive();
  const now = audioContext.currentTime;
  levelerCompressor.threshold.setTargetAtTime(active ? -24 : 0, now, 0.05);
  levelerCompressor.ratio.setTargetAtTime(active ? 4 : 1, now, 0.05);
  if (!active) {
    levelerGain.gain.setTargetAtTime(1, now, 0.3);
    if (levelerTimer) { window.clearInterval(levelerTimer); levelerTimer = null; }
    return;
  }
  if (!levelerTimer) levelerTimer = window.setInterval(stepTVLeveler, 100);
}
function stepTVLeveler() {
  if (!levelerAnalyser || !tvLevelerActive() || !hasVideo || video.paused || video.seeking) return;
  levelerAnalyser.getFloatTimeDomainData(levelerSamples);
  let power = 0;
  for (const sample of levelerSamples) power += sample * sample;
  power /= levelerSamples.length;
  // Silence and near-silence are ignored so pauses are never pumped up into hiss.
  if (10 * Math.log10(Math.max(power, 1e-12)) < TV_LEVELER_GATE_DB) return;
  const fast = performance.now() < levelerFastUntil;
  levelerPower = levelerPower === null ? power : levelerPower + (fast ? 0.3 : 0.035) * (power - levelerPower);
  const loudnessDb = 10 * Math.log10(Math.max(levelerPower, 1e-12));
  const gainDb = Math.max(-TV_LEVELER_MAX_GAIN_DB, Math.min(TV_LEVELER_MAX_GAIN_DB, TV_LEVELER_TARGET_DB - loudnessDb));
  levelerGain.gain.setTargetAtTime(10 ** (gainDb / 20), audioContext.currentTime, fast ? 0.12 : 0.5);
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
    levelerGain = audioContext.createGain();
    levelerCompressor = audioContext.createDynamicsCompressor();
    levelerCompressor.knee.value = 10;
    levelerCompressor.attack.value = 0.006;
    levelerCompressor.release.value = 0.3;
    levelerCompressor.threshold.value = 0;
    levelerCompressor.ratio.value = 1;
    levelerAnalyser = audioContext.createAnalyser();
    levelerAnalyser.fftSize = 4096;
    levelerSamples = new Float32Array(levelerAnalyser.fftSize);
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

    mediaSource.connect(levelerAnalyser);
    mediaSource.connect(levelerGain);
    levelerGain.connect(levelerCompressor);
    levelerCompressor.connect(dryGain);
    dryGain.connect(masterGain);
    levelerCompressor.connect(effectHighpass);
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
    updateTVLeveler();
    return true;
  } catch (error) {
    audioGraphFailed = true;
    if (mediaSource && audioContext) {
      try {
        mediaSource.disconnect();
        levelerAnalyser = null;
        levelerGain = null;
        humGain?.disconnect();
        staticGain?.disconnect();
        const cleanOutput = audioContext.createGain();
        cleanOutput.gain.value = dialVolumeGain();
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
  if (window.SaturdayIntermission?.active) return;
  await unlockPlaybackAudio();
  if (window.SaturdayIntermission?.active) return;
  video.defaultMuted = false;
  video.muted = false;
  setMasterVolume();
  return video.play();
}
function applyAudioEffect(save = true) {
  const preset = AUDIO_EFFECTS[selectedAudioEffect] || AUDIO_EFFECTS.clean;
  const mix = !audioFiltersEnabled || selectedAudioEffect === 'clean' || playingAuthenticTape ? 0 : dialValue(fxAmountDial) / 100 * preset.mix;
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
function setCabinetSkin(name, save = true) {
  if (!['molded', 'smooth', 'woodgrain', 'field'].includes(name)) {
    console.warn('Unknown cabinet texture skin', name);
    return;
  }
  cabinetSkin = name;
  cabinetSkinSelect.value = name;
  tvSet.dataset.skin = name;
  if (save) saveControlPreferences();
}
function saveControlPreferences() {
  try {
    localStorage.setItem(CONTROLS_KEY, JSON.stringify({
      dials: Object.fromEntries(allDials.map(dial => [dial.id, dialValue(dial)])),
      effect: selectedAudioEffect,
      finish: currentFinish,
      cabinetTint,
      cabinetSkin,
      pictureFiltersEnabled,
      audioFiltersEnabled,
      tvLevelerEnabled,
      pictureMode: selectedPictureMode,
      displayMode,
      input: selectedInput === 'aux' ? 'video' : selectedInput,
      soundEffectsEnabled,
      soundEffectsVolume,
      activePlaylistId,
      audioOutputId: preferredAudioOutputId,
      volumeBeforeMute: mutedVolume
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
    mutedVolume = Number.isFinite(saved.volumeBeforeMute) && saved.volumeBeforeMute > 0 ? saved.volumeBeforeMute : null;
    const legacyTints = { yellow: '#c49a32', red: '#b54642', green: '#39804d', blue: '#3e6caa' };
    const legacyFinish = ['yellow', 'red', 'green', 'blue'].includes(saved.finish) ? saved.finish : '';
    setFinish(legacyFinish ? 'wood' : saved.finish, false);
    setCabinetTint(saved.cabinetTint || legacyTints[legacyFinish] || cabinetTint, false);
    if (typeof saved.cabinetSkin === 'string') setCabinetSkin(saved.cabinetSkin, false);
    if (typeof saved.effect === 'string') setAudioEffect(saved.effect, false);
    if (typeof saved.pictureFiltersEnabled === 'boolean') pictureFiltersEnabled = saved.pictureFiltersEnabled;
    else if (typeof saved.videoFiltersEnabled === 'boolean' || typeof saved.tvFiltersEnabled === 'boolean') {
      pictureFiltersEnabled = saved.videoFiltersEnabled !== false && saved.tvFiltersEnabled !== false;
    }
    if (typeof saved.audioFiltersEnabled === 'boolean') audioFiltersEnabled = saved.audioFiltersEnabled;
    if (typeof saved.tvLevelerEnabled === 'boolean') tvLevelerEnabled = saved.tvLevelerEnabled;
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
  tvLevelerToggle.classList.toggle('on', tvLevelerEnabled);
  tvLevelerToggle.setAttribute('aria-pressed', String(tvLevelerEnabled));
  if (tvLevelerActive() && !audioContext && hasVideo) ensureAudioGraph();
  updateTVLeveler();
  const modeLabel = pictureFiltersEnabled ? ({ color: 'COLOR', lowstim: 'LOWSTIM', bw: 'B&W' }[selectedPictureMode] || 'COLOR') : 'COLOR';
  const outputMode = selectedInput === 'static' ? 'SAT' : selectedInput === 'tv' ? 'TV' : selectedInput === 'aux' ? 'GENESIS AUX' : pictureFiltersEnabled && displayMode === 'rear' ? 'REAR PROJECTION' : 'CRT';
  const visibleInput = transitionStatic && transitionInput ? transitionInput : selectedInput;
  const previousVisibleInput = tvSet.dataset.input;
  tvSet.dataset.input = visibleInput;
  document.body.dataset.input = visibleInput;
  const youtubePlaying = selectedInput === 'tv' && Boolean(activeYoutubeStarter());
  for (const button of document.querySelectorAll('.under-screen .transport-key')) {
    button.disabled = selectedInput === 'aux' || (selectedInput === 'tv' && !youtubePlaying);
    button.title = selectedInput === 'aux' ? 'Tape controls are unavailable on AUX input' : selectedInput === 'tv' && !youtubePlaying ? 'Tape controls are available on VIDEO input' : '';
  }
  seek.disabled = selectedInput === 'tv' || selectedInput === 'aux';
  if (visibleInput !== 'tv' && tvGuideDialog.open) tvGuideDialog.close();
  const tapesTab = document.querySelector('[data-settings-tab="tapes"]');
  tapesTab.hidden = visibleInput === 'tv';
  if (tapesTab.hidden && tapesTab.hasAttribute('aria-current')) selectSettingsTab('video');
  if (previousVisibleInput && previousVisibleInput !== visibleInput) lastRenderedSource = null;
  document.querySelector('#displayBadge').textContent = `${modeLabel} ${outputMode}`;
  inputButton.textContent = selectedInput === 'static' ? 'SAT' : selectedInput === 'tv' ? 'TV' : selectedInput === 'aux' ? 'AUX' : 'VIDEO';
  inputButton.setAttribute('aria-pressed', String(selectedInput !== 'video'));
  inputButton.setAttribute('aria-label', `Input is ${selectedInput === 'static' ? 'SAT' : selectedInput === 'aux' ? 'AUX' : selectedInput.toUpperCase()}; cycle to the next input`);
  const pictureInput = tvSet.dataset.input || selectedInput;
  document.querySelector('#emptyState .empty-copy').hidden = pictureInput === 'tv';
  document.querySelector('#picture').setAttribute('aria-label', pictureInput === 'tv'
    ? 'CRT picture: A little Saturday magic.'
    : 'CRT picture: A little Saturday magic. Open the tape shelf from the VHS loader below.');
}
function startStaticPicture() {
  if (window.SaturdayIntermission?.active) return;
  if (!staticInputUrl) {
    setStatus('SAT INPUT IS LOADING');
    return;
  }
  ensureSoundEffectsAudioGraph();
  syncStaticPictureAudio();
  resumeSoundEffectsAudioContext();
  staticPicture.play().catch(error => {
    console.warn('TV static picture/audio did not start', error);
    setStatus('SAT INPUT COULD NOT PLAY');
  });
}
function pauseVideoForInputSwitch() {
  if (!hasVideo || video.paused) return;
  switchingTracks = true;
  video.pause();
  switchingTracks = false;
}
function setInputSource(source, save = true) {
  const next = ['static', 'tv', 'aux'].includes(source) ? source : 'video';
  const previous = selectedInput;
  if (next === 'aux' && previous !== 'aux') {
    auxReturnInput = previous === 'static' ? staticReturnInput : previous;
    resumeVideoAfterAux = auxReturnInput === 'video' && hasVideo && !video.paused;
  }
  window.tube.setPlaybackPriority?.(next !== 'static' && next !== 'aux');
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
    if (!activeYoutubeStarter()) saveChannelPlaybackState();
    window.SaturdayTubeYouTubePlayer?.stop();
    pauseVideoForInputSwitch();
  } else if (previous === 'video' && (next === 'tv' || next === 'aux')) {
    pauseVideoForInputSwitch();
  }

  const applyInput = () => {
    transitionStatic = false;
    transitionInput = '';
    selectedInput = next;
    setTVSearching(next === 'tv');
    window.SaturdayGenesisAux?.setActive(next === 'aux');
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
      } else if (previous === 'aux' || (previous === 'static' && staticReturnInput === 'aux')) {
        if (next === 'video') {
          clearChannelVideoForInputChange();
          if (auxReturnInput === 'tv') void restoreManualVideoSession();
          else if (resumeVideoAfterAux && hasVideo) startVideoPlayback().catch(() => {});
        }
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
  const mode = request?.mode === 'series' ? 'series' : 'title';
  return [
    mode,
    mode === 'title' ? 'v2' : '',
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
  view.captionTitle.textContent = view.collection?.name || title;
  view.captionTitle.title = title;
  view.captionDetail.textContent = view.collection ? `${view.collection.items.length} episodes · Look inside` : subtitle;
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
  document.querySelector('#librarySelectionCount').textContent = count ? `${count} TAPE${count === 1 ? '' : 'S'} SET ASIDE · READY TO WATCH` : 'PICK A TAPE TO WATCH · SHIFT-CLICK TO SET ASIDE';
  libraryAddButton.disabled = count === 0;
  libraryShelves.querySelectorAll('.library-tape[data-tape-path]').forEach(card => {
    const selected = librarySelection.has(card.dataset.tapePath);
    card.classList.toggle('selected', selected);
    card.querySelector('.library-tape-play')?.setAttribute('aria-pressed', String(selected));
  });
}
let libraryCollection = null;
function groupLibraryTapes(files) {
  const groups = new Map();
  const singles = [];
  for (const item of files) {
    const parsed = window.tube.parseMetadataFilename(item.name);
    if (!parsed.episodeCode || !parsed.query) {
      singles.push(item);
      continue;
    }
    const key = parsed.query.trim().toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { name: parsed.query, items: [] });
    groups.get(key).items.push(item);
  }
  const collections = [];
  for (const group of groups.values()) {
    if (group.items.length < 2) singles.push(...group.items);
    else {
      group.items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      collections.push(group);
    }
  }
  return { collections, singles };
}
function makeLibraryCard(item, folder = false, collection = null) {
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
    note.textContent = 'LOOK INSIDE';
    card.append(icon, name, note);
    card.addEventListener('click', () => loadLibraryFolder(item.path));
    return card;
  }
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'library-tape-play';
  play.setAttribute('aria-label', collection ? `Browse ${collection.name} episodes` : `Play ${item.name}`);
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
  summary.textContent = 'ABOUT THIS TAPE';
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
    item, card, play, note, cover, cassette, artworkStatus, collection, parsed: window.tube.parseMetadataFilename(item.name),
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
    if (collection) {
      libraryCollection = collection;
      librarySearch.value = '';
      renderLibrary();
      libraryShelves.querySelector('button')?.focus();
      return;
    }
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
    libraryDestination.textContent = 'YOUR OWN LITTLE TAPE COLLECTION';
    libraryDestination.title = 'Adding a tape makes an app-managed local copy; source files are kept.';
    document.querySelector('#libraryCount').textContent = 'SHELVES EMPTY';
    libraryEmpty('THE SHELVES ARE WAITING', 'Set a destination on this Mac. Imports are safely copied there and stay on your shelf after restart.');
    updateLibrarySelection();
    return;
  }
  const rootLabel = libraryView.root.split('/').filter(Boolean).at(-1) || 'LOCAL SHELF';
  libraryDestination.textContent = libraryCollection?.name || `YOUR TAPES · ${rootLabel}`;
  libraryDestination.title = `${libraryView.root} · Adding tapes copies them into Saturday Tube local storage.`;
  const query = librarySearch.value.trim().toLocaleLowerCase();
  const directories = libraryCollection ? [] : libraryView.directories.filter(item => item.name.toLocaleLowerCase().includes(query));
  const available = libraryCollection ? libraryCollection.items : libraryView.files;
  const files = available.filter(item => item.name.toLocaleLowerCase().includes(query));
  const omitted = libraryView.omitted ? ` · ${libraryView.omitted} MORE IN THIS FOLDER` : '';
  document.querySelector('#libraryCount').textContent = `${files.length} TAPE${files.length === 1 ? '' : 'S'}${omitted}`;
  libraryShelves.replaceChildren();
  if (libraryCollection) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'library-folder-button';
    back.textContent = 'BACK TO YOUR TAPES';
    back.addEventListener('click', () => {
      libraryCollection = null;
      librarySearch.value = '';
      renderLibrary();
      libraryShelves.querySelector('button')?.focus();
    });
    libraryShelves.append(back);
    addLibraryShelf('PICK AN EPISODE', files);
  } else {
    addLibraryShelf('MORE ON THE SHELF', directories, true);
    const { collections, singles } = groupLibraryTapes(files);
    if (collections.length) {
      const section = document.createElement('section');
      section.className = 'library-shelf';
      const heading = document.createElement('h3');
      heading.textContent = 'FAVOURITE SHOWS';
      const row = document.createElement('div');
      row.className = 'library-shelf-row';
      for (const collection of collections) {
        row.append(makeLibraryCard(collection.items[0], false, collection));
      }
      section.append(heading, row);
      libraryShelves.append(section);
    }
    addLibraryShelf('PICK SOMETHING TO WATCH', singles);
  }
  if (!directories.length && !files.length) {
    libraryEmpty(query ? 'NO MATCHING TAPES' : 'NO PLAYABLE TAPES ON THIS SHELF', query ? 'Try another title or clear the search.' : 'Import tapes here, or choose a subfolder to browse.');
  }
  updateLibrarySelection();
}
async function loadLibraryFolder(folderPath) {
  try {
    const view = await window.tube.browseLibraryFolder(folderPath);
    libraryView = view;
    libraryCollection = null;
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
  if (selectedInput === 'tv') setInputSource('video');
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
  if (pictureVisible && frameLoopRequest === null) frameLoopRequest = requestAnimationFrame(frameLoop);
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
  const titleSize = Math.max(20, Math.min(height * 0.085, width * 0.07));
  context.fillStyle = '#020503';
  context.fillRect(0, 0, width, height);
  const vignette = context.createRadialGradient(centerX, centerY * 0.9, height * 0.04, centerX, centerY, height * 0.78);
  vignette.addColorStop(0, '#0a1a24');
  vignette.addColorStop(0.58, '#050d14');
  vignette.addColorStop(1, '#010203');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  const iconWidth = Math.min(width * 0.09, height * 0.145);
  const iconHeight = iconWidth * 0.72;
  const iconX = centerX - iconWidth / 2;
  const iconY = centerY - height * 0.155;
  context.save();
  context.shadowColor = '#33d6ff';
  context.shadowBlur = glow * 2.2;
  context.strokeStyle = '#bdf3ff';
  context.lineWidth = Math.max(2, height * 0.005);
  context.beginPath();
  context.roundRect(iconX, iconY, iconWidth, iconHeight, Math.max(3, iconHeight * 0.22));
  context.stroke();
  context.fillStyle = '#e6fbff';
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
  context.font = `${titleSize}px ${OSD_CANVAS_FONT}`;
  context.shadowColor = '#33d6ff';
  context.shadowBlur = glow;
  context.fillStyle = '#e6fbff';
  context.fillText('A LITTLE SATURDAY MAGIC', centerX, centerY + height * 0.015, width * 0.84);
  context.shadowBlur = Math.max(1, glow * 0.35);
  context.font = `${Math.max(14, titleSize * 0.5)}px ${OSD_CANVAS_FONT}`;
  context.fillStyle = '#b8dceb';
  if (selectedInput !== 'tv' && tvSet.dataset.input !== 'tv') {
    context.fillText('Open the tape shelf from the VHS loader below', centerX, centerY + height * 0.09, width * 0.88);
  }
  context.restore();
}
// On-screen display: drawn into its own layer that the CRT shader blends in after the VHS tracking jitter, so the lettering
// curves, blurs, glows and picks up scanlines with the tube while staying steady on a bad tape. Everything is laid out inside
// the tube, independent of the video's letterboxing, well clear of the curved glass. The DOM overlays stay for screen readers.
const osdCanvas = document.createElement('canvas');
const osdContext = osdCanvas.getContext('2d');
let osdTexture = null;
let osdTextureWidth = 0;
let osdTextureHeight = 0;
let osdLayerVisible = false;
let channelSurfShownAt = 0;
let channelSurfHoldMs = 1900;
const OSD_INK = '#e6fbff';
const OSD_GLOW = '#33d6ff';
function osdSafeRect(width, height) {
  // Keep the readout anchored to the tube with a margin for the curved glass.
  return { x: width * 0.12, y: height * 0.12, width: width * 0.76, height: height * 0.76, unit: height };
}
function osdFont(size) { return `${Math.round(size)}px ${OSD_CANVAS_FONT}`; }
function fitOsdFont(context, text, size, maxWidth) {
  context.font = osdFont(size);
  const measured = context.measureText(text).width;
  if (measured > maxWidth) { size *= maxWidth / measured; context.font = osdFont(size); }
  return size;
}
function withOsdGlow(context, size, draw) {
  context.save();
  context.fillStyle = OSD_INK;
  context.shadowColor = OSD_GLOW;
  context.shadowBlur = Math.max(3, size * 0.16);
  draw();
  context.shadowColor = '#ffffff';
  context.shadowBlur = Math.max(1, size * 0.04);
  draw();
  context.restore();
}
function drawOsdText(context, text, x, y, size, align = 'left', baseline = 'alphabetic') {
  withOsdGlow(context, size, () => {
    context.font = osdFont(size);
    context.textAlign = align;
    context.textBaseline = baseline;
    context.letterSpacing = `${Math.round(size * 0.06)}px`;
    context.fillText(text, x, y);
  });
}
function drawOsdPause(context, safe) {
  let size = safe.unit * 0.085;
  size = fitOsdFont(context, 'PAUSE', size, safe.width * 0.4);
  const x = safe.x + safe.width * 0.06;
  const y = safe.y + safe.height * 0.08 + size * 0.8;
  drawOsdText(context, 'PAUSE', x, y, size);
  context.font = osdFont(size);
  context.letterSpacing = `${Math.round(size * 0.06)}px`;
  const textWidth = context.measureText('PAUSE').width;
  const barWidth = Math.max(3, size * 0.16);
  const barHeight = size * 0.72;
  const barsX = x + textWidth + size * 0.18;
  withOsdGlow(context, size, () => {
    context.fillRect(barsX, y - barHeight, barWidth, barHeight);
    context.fillRect(barsX + barWidth * 1.7, y - barHeight, barWidth, barHeight);
  });
}
function drawOsdChannel(context, safe, now) {
  const elapsed = now - channelSurfShownAt;
  const progress = channelSurfHoldMs > 0 ? elapsed / channelSurfHoldMs : 1;
  if (progress >= 1) return;
  const opacity = progress < 0.12 ? progress / 0.12 : progress > 0.78 ? (1 - progress) / 0.22 : 1;
  const text = channelSurfOverlay.textContent || '';
  let size = safe.unit * 0.12;
  context.save();
  context.letterSpacing = `${Math.round(size * 0.06)}px`;
  size = fitOsdFont(context, text, size, safe.width * 0.8);
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  drawOsdText(context, text, safe.x + safe.width * 0.97, safe.y + safe.height * 0.04 + size * 0.8, size, 'right');
  context.restore();
}
function drawOsdVolume(context, safe) {
  const level = Math.max(0, Math.min(100, Math.round(dialValue(videoDial))));
  const size = safe.unit * 0.085;
  const centerX = safe.x + safe.width / 2;
  const valueY = safe.y + safe.height * 0.97;
  const trackY = valueY - size * 0.95;
  const labelY = trackY - size * 0.95;
  drawOsdText(context, 'VOLUME', centerX, labelY, size, 'center');
  const barWidth = Math.min(safe.width * 0.62, size * 12);
  const barX = centerX - barWidth / 2;
  drawOsdText(context, '<', barX - size * 0.3, trackY, size * 1.1, 'right');
  drawOsdText(context, '>', barX + barWidth + size * 0.3, trackY, size * 1.1, 'left');
  const ticks = 40;
  const lit = Math.round(level * 0.4);
  const tickWidth = Math.max(2, size * 0.1);
  withOsdGlow(context, size * 0.6, () => {
    for (let index = 0; index < ticks; index += 1) {
      const x = barX + (barWidth - tickWidth) * index / (ticks - 1);
      const on = index < lit;
      const tickHeight = on ? size * 0.16 : size * 0.1;
      context.globalAlpha = on ? 1 : 0.5;
      context.fillRect(x, trackY - size * 0.12 - tickHeight, tickWidth, tickHeight);
    }
    context.globalAlpha = 1;
    context.fillRect(barX + barWidth * level / 100 - size * 0.045, trackY - size * 0.74, size * 0.09, size * 0.62);
  });
  drawOsdText(context, String(level), centerX, valueY, size * 0.62, 'center');
}
function drawOsdMute(context, safe) {
  const size = safe.unit * 0.085;
  drawOsdText(context, 'MUTE', safe.x + safe.width * 0.1, safe.y + safe.height * 0.9, size);
}
function drawOsdSearching(context, safe, now) {
  if (Math.floor(now / 500) % 2) return;
  let size = safe.unit * 0.07;
  const text = channelLoadingStatus();
  const indicator = document.querySelector('#searchingIndicator');
  if (indicator && indicator.textContent !== text) indicator.textContent = text;
  context.save();
  context.letterSpacing = `${Math.round(size * 0.06)}px`;
  size = fitOsdFont(context, text, size, safe.width * 0.7);
  context.font = osdFont(size);
  const textWidth = context.measureText(text).width;
  context.restore();
  const dot = size * 0.36;
  const gap = dot * 3.2;
  const total = gap + textWidth;
  const startX = safe.x + (safe.width - total) / 2;
  const centerY = safe.y + safe.height / 2;
  withOsdGlow(context, size, () => {
    context.beginPath();
    context.arc(startX + dot / 2, centerY, dot / 2, 0, Math.PI * 2);
    context.fill();
  });
  drawOsdText(context, text, startX + gap, centerY, size, 'left', 'middle');
}
function wrapOsdLines(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}
function drawOsdCaption(context, safe) {
  const text = caption.textContent.trim();
  if (!text) return;
  const size = safe.unit * 0.052;
  context.save();
  context.font = `700 ${Math.round(size)}px system-ui, sans-serif`;
  const lines = wrapOsdLines(context, text, safe.width * 0.9).slice(-3);
  const lineHeight = size * 1.3;
  const boxWidth = Math.min(safe.width, Math.max(...lines.map(line => context.measureText(line).width)) + size * 0.8);
  const boxHeight = lines.length * lineHeight + size * 0.2;
  const boxX = safe.x + (safe.width - boxWidth) / 2;
  const boxY = safe.y + safe.height - boxHeight;
  context.fillStyle = 'rgba(0,0,0,0.66)';
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, size * 0.15);
  context.fill();
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = '#000';
  context.shadowBlur = size * 0.15;
  lines.forEach((line, index) => context.fillText(line, boxX + boxWidth / 2, boxY + size * 0.1 + lineHeight * (index + 0.5)));
  context.restore();
}
function drawOsdLayer(width, height, now, paused) {
  if (osdCanvas.width !== width || osdCanvas.height !== height) { osdCanvas.width = width; osdCanvas.height = height; }
  const searching = !document.querySelector('#searchingIndicator')?.hidden;
  const surfing = channelSurfOverlay && !channelSurfOverlay.hidden;
  const volume = volumeOverlay && !volumeOverlay.hidden;
  const muted = muteOverlay && !muteOverlay.hidden;
  const captioned = Boolean(caption.textContent.trim());
  const preparation = channelPreparationStatus();
  const visible = paused || searching || surfing || volume || muted || captioned || Boolean(preparation);
  if (!visible && !osdLayerVisible) return false;
  osdContext.clearRect(0, 0, width, height);
  if (visible) {
    const safe = osdSafeRect(width, height);
    if (captioned) drawOsdCaption(osdContext, safe);
    if (paused) drawOsdPause(osdContext, safe);
    if (surfing) drawOsdChannel(osdContext, safe, now);
    if (searching) drawOsdSearching(osdContext, safe, now);
    if (preparation) drawOsdText(osdContext, preparation, safe.x + safe.width / 2, safe.y + safe.height * 0.035, safe.unit * 0.032, 'center');
    if (volume) drawOsdVolume(osdContext, safe);
    else if (muted) drawOsdMute(osdContext, safe);
  }
  osdLayerVisible = visible;
  return true;
}
function frameLoop(now) {
  frameLoopRequest = null;
  if (!pictureVisible || libraryDialog.open) return;
  scheduleFrameLoop();
  if (now - lastPictureFrame < 1000 / 60 - 0.5) return;
  lastPictureFrame = now;
  updateChannelBreakFade();
  syncSettingsScreenStyle();
  if (!compositeContext) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outputCanvas = pictureFallback || glContextLost || !gl || !glProgram ? compositeCanvas : canvas;
  const { width, height } = pictureRenderSize(outputCanvas.clientWidth * dpr, outputCanvas.clientHeight * dpr);
  const tuning = selectedInput === 'tv' && tvSearching && !startupIntroActive;
  const source = tuning ? null : selectedInput === 'aux'
    ? window.SaturdayGenesisAux?.canvas
    : selectedInput === 'static' || transitionStatic
      ? (staticPicture.readyState >= 2 ? staticPicture : null)
      : (hasVideo && video.readyState >= 2 ? video : null);
  const sourceKey = source || (tuning ? 'channel-loading' : `intro-${tvSet.dataset.input || selectedInput}`);
  const sourceTime = selectedInput === 'aux' ? (window.SaturdayGenesisAux?.frameNumber || 0) : source ? source.currentTime : tuning ? Math.floor(now / 100) : 0;
  const sourceWidth = source?.videoWidth || source?.width || 0;
  const sourceHeight = source?.videoHeight || source?.height || 0;
  const paused = selectedInput === 'video' && hasVideo && video.paused && !video.ended && !shuttingOff && !transitionStatic;
  const dimensionsChanged = compositeCanvas.width !== width || compositeCanvas.height !== height;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  if (dimensionsChanged) { compositeCanvas.width = width; compositeCanvas.height = height; }
  const holdLastTVFrame = selectedInput === 'tv' && !tuning && !source && lastCompositeHasFrame && !dimensionsChanged;
  const useFallback = pictureFallback || glContextLost || !gl || !glProgram;
  const osdChanged = drawOsdLayer(width, height, now, paused);
  // Without WebGL the on-screen display is painted straight onto the 2D picture, so it needs a fresh frame underneath.
  const frameChanged = !holdLastTVFrame && (sourceKey !== lastRenderedSource || sourceTime !== lastUploadedTime
    || paused !== lastCompositePaused || dimensionsChanged) || (useFallback && osdChanged);
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
    } else if (tuning) {
      drawChannelLoadingPicture(width, height, now);
    } else if (selectedInput !== 'tv' || startupIntroActive) {
      drawIntroPicture(width, height);
    }
    if (useFallback && osdLayerVisible) compositeContext.drawImage(osdCanvas, 0, 0);
    lastRenderedSource = sourceKey;
    lastUploadedTime = sourceTime;
    lastCompositePaused = paused;
    lastCompositeHasFrame = hasPicture;
  }
  if (useFallback) {
    if (window.SaturdayScenes.active) window.SaturdayScenes.updateGlow(compositeCanvas, now, roomLightSample);
    return;
  }
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
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, osdTexture);
  if (osdChanged) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (osdTextureWidth !== width || osdTextureHeight !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, osdCanvas);
      osdTextureWidth = width;
      osdTextureHeight = height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, osdCanvas);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(gl.getUniformLocation(glProgram, 'frame'), 0);
  gl.uniform1i(gl.getUniformLocation(glProgram, 'osd'), 1);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'osdOn'), osdLayerVisible && osdTextureWidth === width && osdTextureHeight === height ? 1 : 0);
  gl.uniform2f(gl.getUniformLocation(glProgram, 'resolution'), width, height);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'time'), now / 1000);
  const isCRT = pictureFiltersEnabled && displayMode === 'crt';
  const tvScale = pictureFiltersEnabled ? 1 : 0;
  const videoScale = pictureFiltersEnabled ? 1 : 0;
  gl.uniform1f(gl.getUniformLocation(glProgram, 'strength'), isCRT ? dialValue(curveDial) / 100 * 0.075 : 0.0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'scan'), isCRT ? dialValue(scanlineDial) / 100 : 0.0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'edgeBlur'), tvScale * dialValue(edgeBlurDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'hueShift'), videoScale * dialValue(hueDial) / 100 + (1 - videoScale) * 0.5);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'vhsScan'), playingAuthenticTape ? 0 : videoScale * dialValue(vhsScanDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'glitch'), videoScale * dialValue(glitchDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'broken'), videoScale * dialValue(brokenTapeDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'glow'), tvScale * dialValue(glowDial) / 100);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'pictureMode'), videoScale ? ({ color: 0, lowstim: 1, bw: 2 }[selectedPictureMode] || 0) : 0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'rearProjection'), pictureFiltersEnabled && displayMode === 'rear' ? 1 : 0);
  // Edge shading follows the curve dial and the slight colour fringe exists only with filters on; bypass is the raw frame.
  gl.uniform1f(gl.getUniformLocation(glProgram, 'vignette'), isCRT ? dialValue(curveDial) / 100 : 0.0);
  gl.uniform1f(gl.getUniformLocation(glProgram, 'chroma'), tvScale);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (window.SaturdayScenes.active) window.SaturdayScenes.updateGlow(compositeCanvas, now, roomLightSample);
}

// The settings menu is HTML over the tube, so the shader's look is mirrored onto it with CSS, and onto the room light sample.
// BRIGHTNESS is the set's backlight: 50% is neutral; it scales the picture and, past 50%, lifts the blacks like a real tube.
function tvBacklight(value) {
  const level = Math.max(0, Math.min(100, value)) / 100;
  return { gain: 0.55 + level * 0.9, contrast: 1 - Math.max(0, level - 0.5) * 0.16 };
}
function applyTvBacklight(value) {
  const backlight = tvBacklight(value);
  document.documentElement.style.setProperty('--tv-backlight', backlight.gain.toFixed(3));
  document.documentElement.style.setProperty('--tv-black-lift', backlight.contrast.toFixed(3));
}
function pictureLook() {
  const backlight = tvBacklight(dialValue(brightnessDial));
  if (!pictureFiltersEnabled) return { mode: 'color', hue: 0.5, rear: false, curve: 0, scan: 0, glow: 0, backlight };
  const crt = displayMode === 'crt';
  return {
    backlight,
    mode: ['lowstim', 'bw'].includes(selectedPictureMode) ? selectedPictureMode : 'color',
    hue: dialValue(hueDial) / 100,
    rear: displayMode === 'rear',
    curve: crt ? dialValue(curveDial) / 100 : 0,
    scan: crt ? dialValue(scanlineDial) / 100 : 0,
    glow: dialValue(glowDial) / 100
  };
}
function settingsScreenStyle(look) {
  const filters = [];
  if (look.curve > 0.001) filters.push('url(#settingsScreenCurve)');
  const degrees = Math.round((look.hue - 0.5) * 360);
  if (degrees) filters.push(`hue-rotate(${degrees}deg)`);
  if (look.mode === 'bw') filters.push('grayscale(1)');
  else if (look.mode === 'lowstim') filters.push('saturate(0.32)', 'sepia(0.16)', 'contrast(0.82)');
  if (look.rear) filters.push('brightness(0.9)', 'contrast(0.96)', 'blur(0.35px)');
  if (look.glow > 0.02) filters.push(`brightness(${(1 + Math.min(2, look.glow) * 0.06).toFixed(3)})`,
    `drop-shadow(0 0 ${(Math.min(2, look.glow) * 9).toFixed(1)}px rgb(150 190 255 / ${Math.min(0.75, look.glow * 0.45).toFixed(3)}))`);
  return {
    filter: filters.join(' ') || 'brightness(1)',
    curve: (look.curve * 0.075 * 2).toFixed(4),
    scan: look.scan.toFixed(3),
    vignette: look.curve.toFixed(3)
  };
}
function applyPictureLook(data, look) {
  const angle = (look.hue - 0.5) * Math.PI * 2;
  const c = Math.cos(angle), s = Math.sin(angle);
  // The shader's hueTurn matrix (column-major there, written out row by row here).
  const m = [0.213 + 0.787 * c - 0.213 * s, 0.715 - 0.715 * c - 0.715 * s, 0.072 - 0.072 * c + 0.928 * s,
    0.213 - 0.213 * c + 0.143 * s, 0.715 + 0.285 * c + 0.140 * s, 0.072 - 0.072 * c - 0.283 * s,
    0.213 - 0.213 * c - 0.787 * s, 0.715 - 0.715 * c + 0.715 * s, 0.072 + 0.928 * c + 0.072 * s];
  for (let index = 0; index < data.length; index += 4) {
    const r0 = data[index] / 255, g0 = data[index + 1] / 255, b0 = data[index + 2] / 255;
    let r = m[0] * r0 + m[1] * g0 + m[2] * b0;
    let g = m[3] * r0 + m[4] * g0 + m[5] * b0;
    let b = m[6] * r0 + m[7] * g0 + m[8] * b0;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (look.mode === 'bw') r = g = b = luma;
    else if (look.mode === 'lowstim') {
      r = ((r + (luma * 1.04 - r) * 0.68) - 0.5) * 0.82 + 0.5;
      g = ((g + (luma * 1.01 - g) * 0.68) - 0.5) * 0.82 + 0.5;
      b = ((b + (luma * 0.94 - b) * 0.68) - 0.5) * 0.82 + 0.5;
    }
    if (look.rear) { r = r * 0.88 + 0.035; g = g * 0.88 + 0.03; b = b * 0.88 + 0.024; }
    // Same order as the CSS backlight filter: brightness(gain) then contrast(lift).
    const { gain, contrast } = look.backlight || { gain: 1, contrast: 1 };
    r = (r * gain - 0.5) * contrast + 0.5; g = (g * gain - 0.5) * contrast + 0.5; b = (b * gain - 0.5) * contrast + 0.5;
    data[index] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[index + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[index + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }
  return data;
}
const SETTINGS_MENU_LIGHT = '22 58 196';
function roomLightSample() {
  const look = pictureLook();
  const sample = { adjust: data => applyPictureLook(data, look) };
  if (!tvSettingsDialog.open) return sample;
  const screen = canvas.getBoundingClientRect();
  const menu = tvSettingsDialog.getBoundingClientRect();
  if (!screen.width || !screen.height) return sample;
  sample.color = SETTINGS_MENU_LIGHT;
  sample.rect = {
    x: (menu.left - screen.left) / screen.width, y: (menu.top - screen.top) / screen.height,
    width: menu.width / screen.width, height: menu.height / screen.height
  };
  return sample;
}
let settingsScreenStyleKey = '';
function syncSettingsScreenStyle() {
  if (!tvSettingsDialog.open) { settingsScreenStyleKey = ''; return; }
  const style = settingsScreenStyle(pictureLook());
  const key = JSON.stringify(style);
  if (key === settingsScreenStyleKey) return;
  settingsScreenStyleKey = key;
  tvSettingsDialog.style.setProperty('--settings-screen-filter', style.filter);
  tvSettingsDialog.style.setProperty('--settings-scan', style.scan);
  tvSettingsDialog.style.setProperty('--settings-vignette', style.vignette);
  settingsScreenCurve?.setAttribute('scale', style.curve);
}
// Barrel map for the menu, matching the shader's q *= 1 + strength * r2 (R/G encode the x/y source offset).
const settingsScreenCurve = (() => {
  const size = 128;
  const map = document.createElement('canvas');
  map.width = map.height = size;
  const context = map.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const qx = (x + 0.5) / size * 2 - 1, qy = (y + 0.5) / size * 2 - 1;
    const r2 = qx * qx + qy * qy;
    const index = (y * size + x) * 4;
    pixels.data[index] = Math.round((0.5 + qx * r2 / 4) * 255);
    pixels.data[index + 1] = Math.round((0.5 + qy * r2 / 4) * 255);
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  const filter = document.createElementNS(ns, 'filter');
  for (const [name, value] of Object.entries({ id: 'settingsScreenCurve', x: '0', y: '0', width: '1', height: '1',
    filterUnits: 'objectBoundingBox', primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' })) filter.setAttribute(name, value);
  const image = document.createElementNS(ns, 'feImage');
  for (const [name, value] of Object.entries({ href: map.toDataURL('image/png'), x: '0', y: '0', width: '1', height: '1', preserveAspectRatio: 'none', result: 'barrel' })) image.setAttribute(name, value);
  const displace = document.createElementNS(ns, 'feDisplacementMap');
  for (const [name, value] of Object.entries({ in: 'SourceGraphic', in2: 'barrel', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' })) displace.setAttribute(name, value);
  filter.append(image, displace);
  svg.append(filter);
  document.body.append(svg);
  return displace;
})();

function pictureRenderSize(width, height) {
  const scale = Math.min(1, 1920 / Math.max(width, height), Math.sqrt(1920 * 1080 / Math.max(1, width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

const CHANNEL_BREAK_FADE_SECONDS = 0.45;
const CHANNEL_BREAK_REFINE_HORIZON_SECONDS = 3 * 60 * 60;
const CHANNEL_BREAK_MIN_SEGMENT_SECONDS = 120;
const CHANNEL_BREAK_KINDS = new Set(['black', 'silence', 'lull', 'nominal']);
const CHANNEL_BREAK_CUT_VERSION = 2;
const CHANNEL_MIN_MIDROLL_PROGRAM_SECONDS = 8 * 60;
// The broadcast clock waits for the picture: a segment that loaded or buffered a little late still plays to its end.
const CHANNEL_CLOCK_HOLD_MAX_SECONDS = 10;
function playbackSourceTime() {
  return (livePlayback ? livePlayback.baseSeconds : 0) + (Number(video.currentTime) || 0);
}
function playbackSourceDuration() {
  return livePlayback ? NaN : video.duration;
}
function shiftBroadcastClock(channel, seconds) {
  const broadcast = channel?.broadcast;
  if (!broadcast || channel.restorePending || !Number.isFinite(seconds) || !seconds) return;
  const offset = Number(broadcast.initialOffsetSeconds) || 0;
  if (offset + seconds >= 0) broadcast.initialOffsetSeconds = offset + seconds;
  else broadcast.startedAtMs -= seconds * 1000;
}
function channelPlaybackOnAir(channel) {
  return hasVideo && !video.paused && !video.seeking && video.readyState >= 2 && selectedInput === 'tv'
    && activePlaybackChannelId === channel?.id && channel.queue?.[currentIndex]?.path === activePlaybackPath;
}
// When the clock has moved past the segment still on screen, it is wound back to the picture. Returns true while that
// segment (an ad always to its last frame) is still playing, so the next one starts at its first frame, never part-way in.
function holdBroadcastForPlayingSegment(channel, position) {
  if (!position || currentIndex >= position.index || !channelPlaybackOnAir(channel)) return false;
  const current = channel.queue[currentIndex];
  const sourceStart = Number(current.sourceStartSeconds) || 0;
  const scheduledEnd = sourceStart + (Number(current.durationSeconds) || 0);
  let end = scheduledEnd;
  if (current.segmentType === 'commercial' && Number.isFinite(playbackSourceDuration())) {
    end = Math.max(end, Math.min(playbackSourceDuration(), scheduledEnd + CHANNEL_CLOCK_HOLD_MAX_SECONDS));
  }
  const remaining = end - playbackSourceTime();
  let currentStartClock = 0;
  for (let index = 0; index < currentIndex; index += 1) currentStartClock += Number(channel.queue[index]?.durationSeconds) || 0;
  const currentEndClock = currentStartClock + (Number(current.durationSeconds) || 0);
  const holding = remaining > 0.05;
  const pictureClock = Math.min(currentStartClock + Math.max(0, playbackSourceTime() - sourceStart), currentEndClock - (holding ? 0.001 : 0));
  const lag = position.startSeconds + position.offsetSeconds - pictureClock;
  if (!(lag > 0) || lag > CHANNEL_CLOCK_HOLD_MAX_SECONDS) return false;
  shiftBroadcastClock(channel, -lag);
  return holding;
}
function channelBreakFadeTarget() {
  if (selectedInput !== 'tv' || !hasVideo || transitionStatic) return 1;
  const channel = activeChannel();
  const segment = channel?.queue?.[currentIndex];
  if (!segment || segment.segmentType !== 'program' || activePlaybackPath !== segment.path || !Number.isFinite(video.currentTime)) return 1;
  const start = Number(segment.sourceStartSeconds) || 0;
  const end = start + (Number(segment.durationSeconds) || 0);
  const mediaEnd = Number(segment.mediaDurationSeconds) || Infinity;
  let level = 1;
  // Breaks cut on a fade to black need no help; any other mid-programme cut dips quickly to black and back.
  if (channel.queue[currentIndex + 1]?.segmentType === 'commercial' && end < mediaEnd - 1 && segment.endCutKind !== 'black') {
    level = Math.min(level, (end - playbackSourceTime()) / CHANNEL_BREAK_FADE_SECONDS);
  }
  if (start > 1 && channel.queue[currentIndex - 1]?.segmentType !== 'program' && segment.startCutKind !== 'black') {
    level = Math.min(level, (playbackSourceTime() - start) / CHANNEL_BREAK_FADE_SECONDS);
  }
  return Math.min(1, Math.max(0, level));
}
function updateChannelBreakFade() {
  const level = channelBreakFadeTarget();
  if (Math.abs(level - channelBreakFadeLevel) > 0.004) {
    channelBreakFadeLevel = level;
    breakFadeOverlay.style.opacity = String(1 - level);
    setMasterVolume(true);
  }
  maybeCutToChannelBreak();
}
// The broadcast clock is polled twice a second; cut on the frame the programme reaches its break so nothing past the cut leaks out.
function maybeCutToChannelBreak() {
  if (selectedInput !== 'tv' || !hasVideo || video.paused) return;
  const channel = activeChannel();
  const segment = channel?.queue?.[currentIndex];
  if (!channel?.broadcast || segment?.segmentType !== 'program' || channel.queue[currentIndex + 1]?.segmentType !== 'commercial'
    || activePlaybackPath !== segment.path || channelBreakAdvanceSequence === segment.sequence) return;
  const end = (Number(segment.sourceStartSeconds) || 0) + (Number(segment.durationSeconds) || 0);
  if (playbackSourceTime() < end - 0.03) return;
  const position = locateChannelSegment(channel, broadcastElapsed(channel));
  if (!position || position.index !== currentIndex) return;
  const remaining = Math.max(0, position.segment.durationSeconds - position.offsetSeconds);
  if (remaining > 1.5) return;
  channelBreakAdvanceSequence = segment.sequence;
  channel.broadcast.startedAtMs -= remaining * 1000;
  syncActiveBroadcast(true);
}
function channelBreakBoundaries(channel) {
  const elapsed = broadcastElapsed(channel);
  const position = locateChannelSegment(channel, elapsed);
  if (!position) return [];
  const boundaries = [];
  let startSeconds = position.startSeconds;
  for (let index = position.index; index < channel.queue.length; index += 1) {
    const before = channel.queue[index];
    const beforeStart = startSeconds;
    startSeconds += Number(before.durationSeconds) || 0;
    if (beforeStart - elapsed > CHANNEL_BREAK_REFINE_HORIZON_SECONDS) break;
    if (before.segmentType !== 'program' || channel.queue[index + 1]?.segmentType !== 'commercial') continue;
    let afterIndex = index + 1;
    while (channel.queue[afterIndex]?.segmentType === 'commercial') afterIndex += 1;
    const after = channel.queue[afterIndex];
    if (!after || after.segmentType !== 'program' || after.path !== before.path || Number(after.cutVersion) === CHANNEL_BREAK_CUT_VERSION) continue;
    const beforeEnd = (Number(before.sourceStartSeconds) || 0) + (Number(before.durationSeconds) || 0);
    if (Math.abs((Number(after.sourceStartSeconds) || 0) - beforeEnd) > 0.5) continue;
    let minSeconds = (Number(before.sourceStartSeconds) || 0) + CHANNEL_BREAK_MIN_SEGMENT_SECONDS;
    if (index === position.index) {
      // The playing segment's cut can still move, but only to a point comfortably ahead of the picture.
      const playingSeconds = (Number(before.sourceStartSeconds) || 0) + position.offsetSeconds;
      if (beforeEnd - playingSeconds < 20) continue;
      minSeconds = Math.max(minSeconds, Math.ceil((playingSeconds + 25) / 30) * 30);
    }
    boundaries.push({
      before,
      after,
      entry: {
        path: before.path,
        size: Number(before.size) || 0,
        modified: Number(before.modified) || 0,
        mediaDurationSeconds: Number(before.mediaDurationSeconds) || 0,
        targetSeconds: Number(after.breakTargetSeconds) > 0 ? Number(after.breakTargetSeconds) : beforeEnd,
        minSeconds,
        maxSeconds: beforeEnd + (Number(after.durationSeconds) || 0) - CHANNEL_BREAK_MIN_SEGMENT_SECONDS,
        secondsUntil: Math.max(0, startSeconds - elapsed),
        priority: channel.id === activeChannelId
      }
    });
  }
  return boundaries;
}
async function refineChannelBreaks(channel) {
  if (!channel?.broadcast || !channel.queue?.length || typeof window.tube.resolveChannelBreaks !== 'function') return;
  if (channel.breakRefinePromise) {
    channel.breakRefineAgain = true;
    return channel.breakRefinePromise;
  }
  channel.breakRefinePromise = (async () => {
    do {
      channel.breakRefineAgain = false;
      const boundaries = channelBreakBoundaries(channel);
      if (!boundaries.length) return;
      const results = await window.tube.resolveChannelBreaks(boundaries.map(boundary => boundary.entry));
      if (!channels.includes(channel)) return;
      const position = locateChannelSegment(channel, broadcastElapsed(channel));
      let changed = false;
      boundaries.forEach(({ before, after, entry }, index) => {
        const result = results?.[index];
        const beforeIndex = channel.queue.indexOf(before);
        if (!result || !CHANNEL_BREAK_KINDS.has(result.kind) || beforeIndex < 0 || !position || beforeIndex < position.index
          || channel.queue.indexOf(after) <= beforeIndex) return;
        const beforeStart = Number(before.sourceStartSeconds) || 0;
        const oldCut = Number(after.sourceStartSeconds) || 0;
        const afterEnd = oldCut + (Number(after.durationSeconds) || 0);
        const cut = Math.min(Math.max(Number(result.seconds), entry.minSeconds), afterEnd - CHANNEL_BREAK_MIN_SEGMENT_SECONDS);
        if (!Number.isFinite(cut) || cut <= beforeStart || cut >= afterEnd) return;
        if (beforeIndex === position.index) {
          const livePosition = locateChannelSegment(channel, broadcastElapsed(channel));
          if (livePosition?.index !== beforeIndex || cut - (beforeStart + livePosition.offsetSeconds) < 3) return;
        }
        // Moving a shared cut lengthens one segment by what it takes from the other, so the schedule after the pair is unchanged.
        before.durationSeconds = cut - beforeStart;
        after.sourceStartSeconds = cut;
        after.durationSeconds = afterEnd - cut;
        after.breakTargetSeconds = entry.targetSeconds;
        before.endCutKind = result.kind;
        after.startCutKind = result.kind;
        after.cutVersion = CHANNEL_BREAK_CUT_VERSION;
        changed = true;
      });
      if (changed) {
        channel.broadcast.totalDurationSeconds = channel.queue.reduce((sum, item) => sum + (Number(item.durationSeconds) || 0), 0);
        persistChannels();
        if (selectedInput === 'tv' && activeChannelId === channel.id) renderPlaylist();
      }
    } while (channel.breakRefineAgain && channels.includes(channel));
  })().catch(error => console.warn('Channel break points could not be refined', error))
    .finally(() => { channel.breakRefinePromise = null; });
  return channel.breakRefinePromise;
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
function channelPreparationStatus() {
  if (selectedInput !== 'tv' || startupIntroActive) return '';
  const enabled = channels.filter(channel => channel.enabled !== false && !channel.error);
  const pending = enabled.filter(channel => !channel.scanComplete || channel.scanning || channel.broadcastInitPromise || channel.broadcast?.queuePromise);
  return pending.length ? `UPDATING CHANNELS ${enabled.length - pending.length}/${enabled.length}` : '';
}
function channelLoadingStatus() {
  const channel = activeChannel();
  if (!channelsStartupReady) return 'PREPARING CHANNELS...';
  if (channel?.scanning || (channel && !channel.scanComplete)) return 'READING CHANNEL FILES...';
  if (channel?.broadcastInitPromise || channel?.broadcast?.queuePromise) return 'BUILDING SCHEDULE...';
  if (hasVideo && video.readyState >= 2 && !video.seeking) return 'BUFFERING...';
  return channelLoadPhase;
}
function drawChannelLoadingPicture(width, height, now) {
  const phase = Math.floor(now / 100);
  const rows = 32;
  for (let row = 0; row < rows; row += 1) {
    const level = 10 + Math.abs(Math.sin(row * 12.9898 + phase * 7.233)) * 14;
    compositeContext.fillStyle = `rgb(${level},${level + 3},${level + 5})`;
    compositeContext.fillRect(0, Math.floor(row * height / rows), width, Math.ceil(height / rows));
  }
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
// Screen menus are laid out at a fixed design size, then zoomed up so their lettering reads from across the room.
const SCREEN_DIALOG_DESIGN = { settings: { width: 520, height: 380 }, guide: { width: 1000, height: 640 } };
function setScreenDialogBounds(dialog) {
  if (!dialog || !dialog.open) return;
  const stageRect = stage.getBoundingClientRect();
  const compactSettings = dialog === tvSettingsDialog;
  const screenAnchored = compactSettings;
  const design = compactSettings ? SCREEN_DIALOG_DESIGN.settings : SCREEN_DIALOG_DESIGN.guide;
  const anchor = screenAnchored
    ? {
      left: Math.max(0, stageRect.left),
      top: Math.max(0, stageRect.top),
      width: Math.max(0, Math.min(window.innerWidth, stageRect.right) - Math.max(0, stageRect.left)),
      height: Math.max(0, Math.min(window.innerHeight, stageRect.bottom) - Math.max(0, stageRect.top))
    }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  if (screenAnchored && (!anchor.width || !anchor.height)) return;
  const roomWidth = screenAnchored ? anchor.width * 0.94 : window.innerWidth - 24;
  const roomHeight = screenAnchored ? anchor.height * 0.94 : window.innerHeight - 24;
  const zoom = Math.max(compactSettings ? 0 : 1, Math.min(compactSettings ? 3 : 2.6, roomWidth / design.width, roomHeight / design.height));
  const width = Math.max(compactSettings ? 0 : 240, Math.min(design.width * zoom, roomWidth));
  const height = Math.max(compactSettings ? 0 : 180, Math.min(design.height * zoom, roomHeight));
  const centeredLeft = anchor.left + (anchor.width - width) / 2;
  const centeredTop = anchor.top + (anchor.height - height) / 2;
  const left = screenAnchored ? centeredLeft : Math.max(9, Math.min(window.innerWidth - width - 9, centeredLeft));
  const top = screenAnchored ? centeredTop : Math.max(9, Math.min(window.innerHeight - height - 9, centeredTop));
  // CSS zoom also scales a fixed element's offsets and size, so hand it unzoomed numbers.
  dialog.style.zoom = String(zoom);
  dialog.style.left = `${left / zoom}px`;
  dialog.style.top = `${top / zoom}px`;
  dialog.style.width = `${width / zoom}px`;
  dialog.style.height = `${height / zoom}px`;
}
function updateInterfaceScale() {
  const root = document.documentElement;
  const cabinetZoom = Math.max(1, Math.min(2.4, window.innerWidth / 1100, window.innerHeight / 680));
  const interfaceZoom = Math.max(1, Math.min(2.6, window.innerWidth / 1000, window.innerHeight / 640));
  root.style.setProperty('--cab-zoom', cabinetZoom.toFixed(3));
  root.style.setProperty('--ui-zoom', interfaceZoom.toFixed(3));
}
updateInterfaceScale();
function showScreenDialog(dialog) {
  if (dialog.open) return;
  setScreenDialogBounds(dialog);
  dialog.showModal();
  setScreenDialogBounds(dialog);
}
function setupSettingsOverlays() {
  const videoPane = document.querySelector('#tvSettingsVideo');
  const audioPane = document.querySelector('#tvSettingsAudio');
  const tapesPane = document.querySelector('#tvSettingsTapes');
  for (const id of ['scanlines', 'curve']) {
    const control = document.querySelector(`#${id}`)?.closest('.dial-control');
    if (control) videoPane.append(control);
  }
  const volumeControl = document.querySelector('#volume')?.closest('.dial-control');
  if (volumeControl) audioPane.append(volumeControl);
  videoPane.append(
    document.querySelector('.picture-control-group'),
    document.querySelector('.signal-settings'),
    document.querySelector('.view-section')
  );
  document.querySelector('#tvSettingsCabinet').append(document.querySelector('.finish-panel'));
  document.querySelector('#tvSettingsChannels').append(document.querySelector('.channel-management'));
  audioPane.append(document.querySelector('.audio-control-group'));
  tapesPane.append(
    document.querySelector('.playlist-panel'),
    document.querySelector('.deck-options'),
    document.querySelector('.commercial-controls')
  );
  const inputControl = document.querySelector('.input-source-control');
  document.querySelector('.simple-tv-controls').after(inputControl);
  const audioOutputLabel = audioOutputSelect.closest('label');
  if (audioOutputLabel) audioPane.append(audioOutputLabel);
  for (const pane of [videoPane, audioPane, tapesPane, document.querySelector('#tvSettingsChannels')]) pane.hidden = true;
  videoPane.hidden = false;
  for (const dial of tvSettingsDialog.querySelectorAll('.dial')) dial.classList.add('dial-bar');
}
function selectSettingsTab(name) {
  const selected = name === 'tapes' && tvSet.dataset.input === 'tv'
    ? 'video' : ['audio', 'video', 'cabinet', 'scenes', 'breaks', 'tapes', 'channels', 'remote'].includes(name) ? name : 'video';
  for (const pane of document.querySelectorAll('.settings-pane')) pane.hidden = pane.id !== `tvSettings${selected[0].toUpperCase()}${selected.slice(1)}`;
  for (const button of document.querySelectorAll('[data-settings-tab]')) {
    if (button.dataset.settingsTab === selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
function activeChannelCommercials() { return selectedInput === 'tv' ? (activeChannel()?.movieOnly || activeChannel()?.adFree ? [] : (activeChannel()?.commercials || [])) : null; }
function activePlaylist() {
  if (selectedInput === 'tv') {
    const channel = activeChannel();
    return channel ? { id: `channel:${channel.id}`, name: channel.name, tracks: channel.queue || [] } : { id: 'channel:none', name: 'TV Channel', tracks: [] };
  }
  return playlists.find(item => item.id === activePlaylistId) || null;
}
function channelPlaybackSnapshot(channel, now = Date.now(), capturePlayback = false) {
  if (!channel?.broadcast) return channel?.savedPlaybackState || null;
  let elapsedSeconds = broadcastElapsed(channel, now);
  const current = channel.queue?.[currentIndex];
  if (capturePlayback && channel.id === activeChannelId && isCurrentChannelPlayback()
    && !switchingTracks && !video.seeking && video.readyState >= 2 && Number.isFinite(video.currentTime)
    && current?.path === activePlaybackPath && Number(current.durationSeconds) > 0) {
    const segmentStart = channel.queue.slice(0, currentIndex)
      .reduce((sum, segment) => sum + Math.max(0, Number(segment.durationSeconds) || 0), 0);
    elapsedSeconds = segmentStart + Math.max(0, Math.min(
      Number(current.durationSeconds) - 0.01,
      playbackSourceTime() - (Number(current.sourceStartSeconds) || 0)
    ));
  }
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
    ...(Number(item.breakTargetSeconds) > 0 ? { breakTargetSeconds: Number(item.breakTargetSeconds) } : {}),
    ...(CHANNEL_BREAK_KINDS.has(item.startCutKind) ? { startCutKind: item.startCutKind } : {}),
    ...(CHANNEL_BREAK_KINDS.has(item.endCutKind) ? { endCutKind: item.endCutKind } : {}),
    ...(Number(item.cutVersion) > 0 ? { cutVersion: Number(item.cutVersion) } : {}),
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
function persistChannels(capturePlayback = false) {
  try {
    const now = Date.now();
    const stored = channels.map(channel => ({
      id: channel.id,
      name: channel.name,
      abbreviation: channel.abbreviation || makeChannelAbbreviation(channel.name, channel.root),
      root: channel.root,
      movieOnly: channel.movieOnly === true,
      rotation: channel.rotation || {},
      playbackState: channelPlaybackSnapshot(channel, now, capturePlayback),
      enabled: channel.enabled !== false,
      adFree: channel.adFree === true,
      disabledShowPaths: Array.isArray(channel.disabledShowPaths) ? channel.disabledShowPaths : []
    }));
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(stored));
    localStorage.setItem('saturdayTube.activeChannel.v1', activeChannelId);
  } catch (error) { console.error('TV channels could not be saved', error); setStatus('TV CHANNEL SETTINGS COULD NOT BE SAVED'); }
}
function loadYoutubeStarterConfigurations() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(YOUTUBE_STARTERS_KEY) || '[]'); } catch { /* Fresh or invalid settings use blank starter slots. */ }
  const sourceApi = globalThis.SaturdayTubeYouTubeSources;
  if (!sourceApi || typeof sourceApi.normalizeStarterConfigurations !== 'function') {
    return [];
  }
  return sourceApi.normalizeStarterConfigurations(saved);
}
function activeYoutubeStarter() {
  return youtubeStarterConfigurations.find(item => item.id === activeYoutubeStarterId && item.program) || null;
}
function configuredYoutubeStarters() {
  return youtubeStarterConfigurations.filter(item => item.program);
}
function persistYoutubeStarterConfigurations() {
  try {
    const sourceApi = globalThis.SaturdayTubeYouTubeSources;
    if (!sourceApi || typeof sourceApi.serializeStarterConfigurations !== 'function') return;
    localStorage.setItem(YOUTUBE_STARTERS_KEY, JSON.stringify(sourceApi.serializeStarterConfigurations(youtubeStarterConfigurations)));
  } catch (error) { console.error('YouTube starter settings could not be saved', error); setStatus('YOUTUBE CHANNEL SETTINGS COULD NOT BE SAVED'); }
}
function renderYoutubeStarterSetup() {
  if (!youtubeStarterRows) return;
  youtubeStarterRows.replaceChildren();
  for (const starter of youtubeStarterConfigurations) {
    const row = document.createElement('article');
    row.className = 'youtube-starter-row';
    const heading = document.createElement('h4');
    heading.textContent = starter.name;
    const watch = document.createElement('button');
    watch.type = 'button';
    watch.textContent = 'WATCH';
    const fields = document.createElement('div');
    fields.className = 'youtube-starter-fields';
    const programLabel = document.createElement('label');
    programLabel.textContent = 'PROGRAM VIDEO OR PLAYLIST';
    const programInput = document.createElement('input');
    programInput.type = 'url';
    programInput.autocomplete = 'off';
    programInput.placeholder = 'Paste public YouTube link';
    programInput.setAttribute('aria-label', `${starter.name} programme YouTube link`);
    programInput.value = starter.programUrl;
    programLabel.append(programInput);
    const commercialLabel = document.createElement('label');
    commercialLabel.textContent = 'PROGRAM BREAK VIDEO OR PLAYLIST · OPTIONAL';
    const commercialInput = document.createElement('input');
    commercialInput.type = 'url';
    commercialInput.autocomplete = 'off';
    commercialInput.placeholder = 'YouTube video or playlist link';
    commercialInput.setAttribute('aria-label', `${starter.name} optional commercials playlist`);
    commercialInput.value = starter.commercialsUrl;
    commercialLabel.append(commercialInput);
    fields.append(programLabel, commercialLabel);
    const status = document.createElement('output');
    const refreshReadiness = () => {
      const program = window.SaturdayTubeYouTubeSources.parseYouTubeSource(programInput.value);
      const adText = commercialInput.value.trim();
      const ads = adText ? window.SaturdayTubeYouTubeSources.parseYouTubeSource(adText) : null;
      watch.disabled = !program || Boolean(adText && !ads);
      status.textContent = !program ? 'ADD A PUBLIC YOUTUBE VIDEO OR PLAYLIST LINK' : adText && !ads
        ? 'ADD A VALID YOUTUBE COMMERCIAL VIDEO OR PLAYLIST' : starter.program ? 'SOURCE SAVED · EMBEDDING AVAILABILITY CAN CHANGE' : 'LINKS ARE NOT SAVED';
    };
    programInput.addEventListener('input', refreshReadiness);
    commercialInput.addEventListener('input', refreshReadiness);
    watch.addEventListener('click', () => {
      const program = window.SaturdayTubeYouTubeSources.parseYouTubeSource(programInput.value);
      const adText = commercialInput.value.trim();
      const commercials = adText ? window.SaturdayTubeYouTubeSources.parseYouTubeSource(adText) : null;
      if (!program || (adText && !commercials)) { refreshReadiness(); return; }
      starter.program = program;
      starter.commercials = commercials;
      starter.programUrl = window.SaturdayTubeYouTubeSources.canonicalYouTubeUrl(program);
      starter.commercialsUrl = window.SaturdayTubeYouTubeSources.canonicalYouTubeUrl(commercials);
      programInput.value = starter.programUrl;
      commercialInput.value = starter.commercialsUrl;
      persistYoutubeStarterConfigurations();
      refreshReadiness();
      selectYoutubeStarter(starter.id);
    });
    row.append(heading, watch, fields, status);
    youtubeStarterRows.append(row);
    refreshReadiness();
  }
}
function currentChannelSelectionKey() {
  return activeYoutubeStarter() ? `youtube:${activeYoutubeStarterId}` : activeChannelId ? `local:${activeChannelId}` : '';
}
function selectYoutubeStarter(id) {
  const starter = youtubeStarterConfigurations.find(item => item.id === id && item.program);
  if (!starter || !channelsStartupReady) return;
  const previous = currentChannelSelectionKey();
  if (selectedInput === 'tv' && !activeYoutubeStarter()) saveChannelPlaybackState();
  if (previous && previous !== `youtube:${starter.id}`) previousChannelId = previous;
  activeYoutubeStarterId = starter.id;
  try { localStorage.setItem(YOUTUBE_ACTIVE_KEY, starter.id); } catch { /* The current station still works if storage is unavailable. */ }
  channelTuneToken += 1;
  if (selectedInput !== 'tv') setInputSource('tv');
  else {
    clearChannelVideoForInputChange();
    setTVSearching(true);
    void startActiveChannel();
  }
  renderChannels();
  syncBypassControls();
  showChannelSurfText(`${starter.name} · STREAMING`);
}
function renderChannels() {
  assignChannelAbbreviations();
  const streaming = activeYoutubeStarter();
  const channel = streaming ? null : activeChannel();
  rescanChannelButton.disabled = streaming || !channel || Boolean(channel.scanning) || !channelsStartupReady || Boolean(channelRefreshPromise);
  updateGuideShuffleControls();
  if (channelSurfName) {
    channelSurfName.textContent = streaming?.name || channel?.name || 'NO CHANNEL';
    channelSurfName.title = streaming ? `${streaming.name} · YouTube embedded player` : channel?.name || 'Add a TV channel folder or a YouTube starter link.';
  }
  const hasSurfableChannel = channelsStartupReady && (channels.some(item => item.enabled !== false && !item.error) || configuredYoutubeStarters().length > 0);
  if (channelDownButton) channelDownButton.disabled = !hasSurfableChannel;
  if (channelUpButton) channelUpButton.disabled = !hasSurfableChannel;
  channelStatus.textContent = streaming
    ? `YOUTUBE · ${streaming.program.kind.toUpperCase()} PROGRAM${streaming.commercials ? ' · OPTIONAL AD PLAYLIST' : ''}`
    : !channelsStartupReady ? 'PREPARING TV CHANNELS…' : channelRefreshPromise ? 'REFRESHING PLAYLISTS…' : channel?.scanning ? 'SCANNING…' : channel?.error ? 'FOLDER OFFLINE' : channel && !channel.scanComplete ? 'WARMING UP IN BACKGROUND…' : channel
      ? channel.movieOnly
        ? `${channel.episodeCount || 0} MOVIES · BACK-TO-BACK · NO ADS`
        : `${channel.showCount || 0} SHOW${channel.showCount === 1 ? '' : 'S'} · ${channel.episodeCount || 0} EPS · ${channel.commercialCount || 0} ADS`
      : channels.length ? 'NO CHANNELS SET UP' : 'NO LOCAL CHANNELS · ADD YOUTUBE LINKS BELOW';
  channelRootPath.textContent = streaming ? 'SOURCE · Official YouTube embedded player' : channel?.root || 'Each channel folder holds show subfolders or loose videos; a Commercials folder is optional.';
  channelRootPath.title = streaming ? 'YouTube playback uses the official embedded player.' : channel?.root || '';
  const source = localStorage.getItem(CHANNEL_SOURCE_KEY) || '';
  channelSourcePath.textContent = source
    ? `SOURCE · ${source}${channel?.playlistCached ? ' · SAVED PLAYLISTS · REFRESH AFTER EDITING FOLDERS' : ''}`
    : 'No channel source set · every folder inside it becomes a channel.';
  channelSourcePath.title = source;
  channelSummary.textContent = streaming
    ? 'YouTube retains its player controls, ads and branding. The optional retro-commercial playlist runs after the programming list ends.'
    : channel?.error
      ? channel.error
      : channel?.movieOnly
        ? 'MOVIES ONLY · NO COMMERCIALS OR TRAILERS · FEATURES PLAY BACK-TO-BACK.'
        : channel?.showCount
          ? channel.enabled === false
            ? 'CHANNEL DISABLED · ENABLE IT IN THE TV GUIDE.'
            : (channel.commercialCount || 0) === 0
              ? 'NO COMMERCIALS · SHOWS PLAY BACK-TO-BACK WITHOUT BREAKS.'
              : 'Episodes play in season and episode order, starting with the earliest available. A full commercial break follows every episode.'
          : channel
            ? 'No show episodes yet.'
            : 'Folders stay where they are; Saturday Tube reads episodes and channel-only commercials in place.';
  if (channelSetupNotice) {
    channelStatus.textContent = channelSetupNotice;
    channelSummary.textContent = 'Check folder access and try again.';
  }
}
function updateGuideShuffleControls() {
  const busy = Boolean(channelRefreshPromise);
  document.querySelector('#tvGuideShuffle').disabled = busy || !channelsStartupReady || !channels.length
    || channels.some(channel => channel.adFreeUpdating || channel.guideEditPromise);
  document.querySelector('#tvGuideShuffle').textContent = busy && channelShuffleStatus.startsWith('SHUFFLING') ? 'SHUFFLING…' : 'SHUFFLE ALL';
  document.querySelector('#tvGuideShuffleStatus').textContent = channelShuffleStatus;
  document.querySelector('#tvGuideAdd').disabled = busy;
}
function tvGuideLineup() {
  return [
    ...channels.map(channel => ({ kind: 'local', id: channel.id, channel })),
    ...configuredYoutubeStarters().map(starter => ({ kind: 'youtube', id: starter.id, starter }))
  ];
}
function currentGuideChannel() {
  const item = tvGuideLineup()[tvGuidePageIndex];
  return item?.kind === 'local' ? item.channel : null;
}
function renderTVGuide() {
  updateGuideShuffleControls();
  tvGuidePageContent.replaceChildren();
  const spread = document.createElement('div');
  spread.className = 'guide-open-spread';
  const leftPage = document.createElement('section');
  leftPage.className = 'guide-book-page guide-page-left';
  leftPage.setAttribute('aria-label', 'Channel and show management');
  const rightPage = document.createElement('section');
  rightPage.className = 'guide-book-page guide-page-right';
  rightPage.setAttribute('aria-label', 'Live episode listings');
  const lineup = tvGuideLineup();
  if (!lineup.length) {
    tvGuidePage.textContent = 'PAGE 0 / 0';
    const leftHeading = document.createElement('div');
    leftHeading.className = 'guide-running-head';
    leftHeading.textContent = 'CHANNEL DIRECTORY';
    const leftEmpty = document.createElement('p');
    leftEmpty.className = 'guide-empty';
    leftEmpty.textContent = 'NO CHANNELS IN THE LINEUP';
    const rightHeading = document.createElement('div');
    rightHeading.className = 'guide-running-head';
    rightHeading.textContent = 'TV LISTINGS';
    const rightEmpty = document.createElement('p');
    rightEmpty.className = 'guide-empty';
    rightEmpty.textContent = 'ADD A CHANNEL OR CONFIGURE A STREAMING STARTER.';
    leftPage.append(leftHeading, leftEmpty);
    rightPage.append(rightHeading, rightEmpty);
    spread.append(leftPage, rightPage);
    tvGuidePageContent.append(spread);
    document.querySelector('#tvGuidePrevious').disabled = true;
    document.querySelector('#tvGuideNext').disabled = true;
    return;
  }
  tvGuidePageIndex = (tvGuidePageIndex + lineup.length) % lineup.length;
  const guideItem = lineup[tvGuidePageIndex];
  tvGuidePage.textContent = `PAGE ${tvGuidePageIndex + 1} / ${lineup.length}`;
  document.querySelector('#tvGuidePrevious').disabled = lineup.length < 2;
  document.querySelector('#tvGuideNext').disabled = lineup.length < 2;
  if (guideItem.kind === 'youtube') {
    const starter = guideItem.starter;
    const leftHeading = document.createElement('div');
    leftHeading.className = 'guide-running-head';
    leftHeading.textContent = `PUBLIC STREAMING STARTER · ${tvGuidePageIndex + 1} OF ${lineup.length}`;
    const channelRow = document.createElement('div');
    channelRow.className = 'guide-channel-row';
    const channelName = document.createElement('strong');
    channelName.textContent = starter.name;
    const channelMeta = document.createElement('small');
    channelMeta.textContent = `YOUTUBE · ${starter.program.kind.toUpperCase()} PROGRAM`;
    channelRow.append(channelName, channelMeta);
    const watchButton = document.createElement('button');
    watchButton.type = 'button';
    watchButton.textContent = `WATCH ${starter.name.toUpperCase()} · ENTER`;
    watchButton.addEventListener('click', tuneGuideChannel);
    const note = document.createElement('p');
    note.className = 'guide-management-note';
    note.textContent = 'THE OFFICIAL EMBEDDED YOUTUBE PLAYER RETAINS ITS PLAYER CONTROLS, ADS AND BRANDING.';
    leftPage.append(leftHeading, channelRow, watchButton, note);

    const rightHeading = document.createElement('div');
    rightHeading.className = 'guide-running-head';
    rightHeading.textContent = 'PROGRAM & BREAK SOURCES';
    const sources = document.createElement('div');
    sources.className = 'guide-date-window';
    const program = document.createElement('strong');
    program.textContent = `PROGRAM · ${starter.program.kind.toUpperCase()}`;
    const breaks = document.createElement('em');
    breaks.textContent = starter.commercials ? `PROGRAM BREAK · ${starter.commercials.kind.toUpperCase()}` : 'PROGRAM BREAK · NONE SET';
    const availability = document.createElement('small');
    availability.textContent = 'NO SCHEDULE METADATA · VIDEO AVAILABILITY MAY VARY';
    sources.append(program, breaks, availability);
    const scheduleNote = document.createElement('p');
    scheduleNote.className = 'guide-commercial-note';
    scheduleNote.textContent = 'PROGRAM BREAK SOURCE PLAYS AFTER THE SELECTED PROGRAM SOURCE ENDS.';
    rightPage.append(rightHeading, sources, scheduleNote);
    spread.append(leftPage, rightPage);
    tvGuidePageContent.append(spread);
    return;
  }
  const channel = guideItem.channel;

  const nowMs = Date.now();
  const windowStart = new Date(nowMs);
  const windowEnd = new Date(nowMs + GUIDE_WINDOW_SECONDS * 1000);
  const leftRunningHead = document.createElement('div');
  leftRunningHead.className = 'guide-running-head';
  leftRunningHead.textContent = `CHANNEL DIRECTORY · ${tvGuidePageIndex + 1} OF ${tvGuideLineup().length}`;
  const channelRow = document.createElement('label');
  channelRow.className = 'guide-channel-row';
  const channelCheck = document.createElement('input');
  channelCheck.type = 'checkbox';
  channelCheck.checked = channel.enabled !== false;
  channelCheck.disabled = Boolean(channelRefreshPromise);
  channelCheck.setAttribute('aria-label', `Enable ${channel.name}`);
  channelCheck.addEventListener('change', () => { void setGuideChannelEnabled(channel.id, channelCheck.checked); });
  const channelName = document.createElement('strong');
  channelName.textContent = channel.name;
  const channelNumber = document.createElement('b');
  channelNumber.className = 'guide-directory-number';
  channelNumber.textContent = `CH ${channelDialNumber(channel)}`;
  const channelMeta = document.createElement('small');
  channelMeta.textContent = `${channel.showCount || 0} SHOWS · ${channel.episodeCount || 0} EPISODES`;
  channelRow.append(channelCheck, channelNumber, channelName, channelMeta);
  const channelActions = document.createElement('div');
  channelActions.className = 'guide-channel-actions';
  const tuneButton = document.createElement('button');
  tuneButton.type = 'button';
  tuneButton.textContent = `WATCH CH ${channelDialNumber(channel)} · ENTER`;
  tuneButton.disabled = channel.enabled === false;
  tuneButton.addEventListener('click', tuneGuideChannel);
  const adFreeButton = document.createElement('button');
  adFreeButton.type = 'button';
  adFreeButton.textContent = `AD FREE · ${channel.adFree ? 'ON' : 'OFF'}`;
  adFreeButton.setAttribute('aria-pressed', String(channel.adFree === true));
  adFreeButton.setAttribute('aria-label', `Ad free for ${channel.name}`);
  adFreeButton.disabled = Boolean(channel.adFreeUpdating || channel.guideEditPromise || channelRefreshPromise);
  adFreeButton.addEventListener('click', () => { void setGuideAdFree(channel, !channel.adFree); });
  channelActions.append(tuneButton, adFreeButton);

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
      check.disabled = channel.enabled === false || Boolean(channel.adFreeUpdating || channel.guideEditPromise || channelRefreshPromise);
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
  leftPage.append(leftRunningHead, channelRow, channelActions, showHeading, showList, managementNote);

  const rightRunningHead = document.createElement('div');
  rightRunningHead.className = 'guide-running-head';
  rightRunningHead.textContent = 'SATURDAY TUBE · LOCAL BROADCAST';
  const dateWindow = document.createElement('div');
  dateWindow.className = 'guide-date-window';
  const dateLabel = document.createElement('strong');
  dateLabel.textContent = windowStart.toLocaleDateString([], { weekday: 'long' });
  const dateLine = document.createElement('em');
  dateLine.textContent = windowStart.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = document.createElement('small');
  timeLabel.textContent = `${windowStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${windowEnd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · LOCAL TIME`;
  dateWindow.append(dateLabel, dateLine, timeLabel);

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
      const bug = document.createElement('b');
      bug.className = 'guide-channel-bug';
      bug.textContent = String(channelDialNumber(channel));
      const kind = document.createElement('small');
      kind.textContent = segment.showName || 'PROGRAM';
      const title = document.createElement('span');
      title.textContent = String(segment.title || 'Episode').replace(/\.(?:mkv|mp4|m4v|mov|webm|avi|mpe?g|wmv|flv|ts|vob|ogv)$/i, '');
      row.append(when, bug, kind, title);
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
  scheduleNote.textContent = channel.adFree
    ? 'AD FREE · COMMERCIALS ARE DISABLED ON THIS CHANNEL.'
    : 'COMMERCIALS ARE OMITTED; THEIR AIRTIME STILL COUNTS TOWARD EVERY START TIME.';
  schedule.append(scheduleHeading, scheduleList, scheduleNote);
  rightPage.append(rightRunningHead, dateWindow, schedule);
  spread.append(leftPage, rightPage);
  tvGuidePageContent.append(spread);
  if (tvGuideDialog.open && channel.enabled !== false && !channel.scanning && !channel.error) {
    if (!channel.scanComplete) void warmChannelsInBackground();
    else void ensureGuideSchedule(channel);
  }
}
function tuneGuideChannel() {
  const item = tvGuideLineup()[tvGuidePageIndex];
  if (!item) return;
  if (item.kind === 'youtube') {
    tvGuideDialog.close();
    selectYoutubeStarter(item.id);
    if (selectedInput !== 'tv') setInputSource('tv');
    return;
  }
  if (item.channel.enabled === false) {
    setStatus('CHANNEL OFF AIR · ENABLE IT IN THE GUIDE');
    return;
  }
  tvGuideDialog.close();
  selectActiveChannel(item.id);
  if (selectedInput !== 'tv') setInputSource('tv');
}
function channelCommercials(channel) {
  return channel.adFree === true ? [] : channel.commercials || [];
}
async function setGuideAdFree(channel, enabled) {
  if (channel.adFreeUpdating) return;
  channel.adFreeUpdating = true;
  renderTVGuide();
  const previous = channel.adFree === true;
  try {
    if (channel.broadcastInitPromise) await channel.broadcastInitPromise;
    if (channel.broadcast?.queuePromise) await channel.broadcast.queuePromise;
    const snapshot = channelPlaybackSnapshot(channel, Date.now(), true);
    channel.adFree = enabled;
    await rebuildGuideChannel(channel, snapshot);
    if (!enabled) await fillChannelCommercialBreaks(channel);
    persistChannels();
  } catch (error) {
    channel.adFree = previous;
    console.error('Channel commercial preference could not be changed', error);
    setStatus('AD FREE CHANGE FAILED · TRY AGAIN');
  } finally {
    channel.adFreeUpdating = false;
    renderTVGuide();
  }
}
async function ensureGuideSchedule(channel) {
  if (!channel || channel.scanning || channel.error || channel.enabled === false || !channel.shows?.some(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path) && show.episodes?.some(item => Number(item.durationSeconds) > 0))) return;
  if (channel.guideSchedulePromise) return channel.guideSchedulePromise;
  const pending = (async () => {
    if (!channel.broadcast) await initializeChannelBroadcast(channel);
    const elapsed = broadcastElapsed(channel);
    await appendBroadcastCoverage(channel, elapsed + GUIDE_WINDOW_SECONDS);
    if (tvGuideDialog.open && currentGuideChannel()?.id === channel.id) renderTVGuide();
  })();
  channel.guideSchedulePromise = pending;
  try { await pending; }
  finally { if (channel.guideSchedulePromise === pending) channel.guideSchedulePromise = null; }
}
function openTVGuide() {
  if (tvSet.dataset.input !== 'tv') return;
  const selection = currentChannelSelectionKey();
  const lineup = tvGuideLineup();
  const currentIndex = lineup.findIndex(item => `${item.kind === 'youtube' ? 'youtube' : 'local'}:${item.id}` === selection);
  tvGuidePageIndex = Math.max(0, currentIndex);
  renderTVGuide();
  showScreenDialog(tvGuideDialog);
  if (guideRefreshTimer) window.clearInterval(guideRefreshTimer);
  const channel = currentGuideChannel();
  if (channel) void ensureGuideSchedule(channel);
  guideRefreshTimer = window.setInterval(() => {
    if (!tvGuideDialog.open) return;
    renderTVGuide();
    const pageChannel = currentGuideChannel();
    if (pageChannel) void ensureGuideSchedule(pageChannel);
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
  channel.guideEditPromise = rebuildGuideChannel(channel, snapshot);
  updateGuideShuffleControls();
  try { await channel.guideEditPromise; }
  finally {
    channel.guideEditPromise = null;
    renderTVGuide();
  }
}
async function rebuildGuideChannel(channel, snapshot) {
  const eligibleShows = channel.shows.filter(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path));
  const restored = await window.tube.reconcileChannelPlayback(eligibleShows, channelCommercials(channel), {
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
  persistChannels(true);
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
  if (channel.restorePending) return Math.max(0, Number(broadcast.initialOffsetSeconds) || 0);
  if (window.SaturdayIntermission?.active) now = Math.min(now, window.SaturdayIntermission.startedAt);
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
    if (channel.adFree && segment.segmentType === 'commercial') continue;
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
    lastShowPath: generated.lastShowPath || '',
    lastCommercialPath: generated.lastCommercialPath || '',
    commercialBagPaths: generated.commercialBagPaths || [],
    recentCommercialPaths: generated.recentCommercialPaths || []
  };
  channel.broadcast.totalDurationSeconds = Number(channel.broadcast.totalDurationSeconds) || 0;
  for (const item of channel.queue.slice(previousLength)) channel.broadcast.totalDurationSeconds += Number(item.durationSeconds) || 0;
  persistChannels();
}
async function fillChannelCommercialBreaks(channel) {
  if (channel.adFree) return;
  if (!channel?.broadcast || !channel.queue?.length || !channel.commercials?.length) return;
  if (channel.broadcast.queuePromise) await channel.broadcast.queuePromise;
  const position = locateChannelSegment(channel, broadcastElapsed(channel));
  const startIndex = position ? position.index : 0;
  const scheduled = channel.queue.slice(startIndex);
  // Keep what is on air (and the rest of a break already under way); later breaks are re-dealt from the current ad library.
  let keepCount = 1;
  if (scheduled[0]?.segmentType === 'commercial') while (scheduled[keepCount]?.segmentType === 'commercial') keepCount += 1;
  const upcoming = [];
  // Durations of merged halves are applied only once the rebuilt queue is committed.
  const mergedDurations = new Map();
  const durationOf = item => mergedDurations.get(item) ?? (Number(item.durationSeconds) || 0);
  for (const item of [...scheduled.slice(0, keepCount), ...scheduled.slice(keepCount).filter(entry => entry.segmentType !== 'commercial')]) {
    const previous = upcoming[upcoming.length - 1];
    // Short programmes such as music videos air whole; only their end gets a break.
    if (previous && item.segmentType === 'program' && previous.segmentType === 'program' && previous.path === item.path
      && Number(item.mediaDurationSeconds) < CHANNEL_MIN_MIDROLL_PROGRAM_SECONDS
      && Math.abs((Number(previous.sourceStartSeconds) || 0) + durationOf(previous) - (Number(item.sourceStartSeconds) || 0)) < 0.5) {
      mergedDurations.set(previous, durationOf(previous) + (Number(item.durationSeconds) || 0));
      continue;
    }
    upcoming.push(item);
  }
  if (!upcoming.some((item, index) => item.segmentType === 'program' && upcoming[index + 1]?.segmentType !== 'commercial')) return;
  const filled = await window.tube.fillChannelCommercialBreaks(
    upcoming.map(item => ({ path: item.path, segmentType: item.segmentType, durationSeconds: durationOf(item) })),
    channel.commercials.map(item => ({ path: item.path, durationSeconds: item.durationSeconds })),
    channel.rotation || {}
  );
  if (!filled?.breaks?.length || !channels.includes(channel) || channel.adFree) return;
  const byPath = new Map(channel.commercials.map(item => [item.path, { ...item, showName: 'COMMERCIALS' }]));
  const breaksAfter = new Map(filled.breaks.map(entry => [entry.afterIndex, entry.segments]));
  const rebuilt = [];
  upcoming.forEach((item, index) => {
    rebuilt.push(item);
    for (const segment of breaksAfter.get(index) || []) {
      const source = byPath.get(segment.path);
      if (!source?.url) continue;
      rebuilt.push({ ...source, ...segment, id: source.id, url: source.url, title: segment.title || source.title, showName: 'COMMERCIALS',
        segmentType: 'commercial', channelMedia: true, channelAd: true, managedLocalCopy: false, unavailable: false,
        programSequence: Number(item.programSequence) || 0 });
    }
  });
  // Only unaired items are renumbered, so play history and the on-air segment are unaffected.
  let sequence = Number.isFinite(Number(upcoming[0]?.sequence)) ? Number(upcoming[0].sequence) : Number(channel.nextSequence) || 0;
  let breakSequence = null;
  let adBreakPosition = 0;
  rebuilt.forEach((item, index) => {
    if (index > 0) item.sequence = ++sequence;
    if (item.segmentType === 'commercial') {
      if (breakSequence === null) breakSequence = item.sequence;
      item.breakSequence = breakSequence;
      item.adBreakPosition = ++adBreakPosition;
    } else {
      breakSequence = null;
      adBreakPosition = 0;
    }
  });
  for (const [item, durationSeconds] of mergedDurations) {
    item.durationSeconds = durationSeconds;
    delete item.endCutKind;
  }
  channel.queue.splice(startIndex, scheduled.length, ...rebuilt);
  channel.nextSequence = Math.max(Number(channel.nextSequence) || 0, sequence + 1);
  channel.broadcast.totalDurationSeconds = channel.queue.reduce((sum, item) => sum + (Number(item.durationSeconds) || 0), 0);
  channel.rotation = {
    ...(channel.rotation || {}),
    lastCommercialPath: filled.lastCommercialPath || '',
    commercialBagPaths: filled.commercialBagPaths || [],
    recentCommercialPaths: filled.recentCommercialPaths || []
  };
  persistChannels();
  if (selectedInput === 'tv' && activeChannelId === channel.id) renderPlaylist();
  renderTVGuide();
  void refineChannelBreaks(channel);
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
      channelCommercials(channel).map(item => ({
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
    void refineChannelBreaks(channel);
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
// Damaged or truncated files (neither Chromium nor FFmpeg can read them) are skipped instead of leaving the channel stuck on
// LOADING. They are remembered by size and date for a day, so a re-downloaded or repaired file is tried again.
const UNPLAYABLE_CHANNEL_MEDIA_KEY = 'saturdayTube.unplayableChannelMedia.v1';
const UNPLAYABLE_RETRY_MS = 24 * 60 * 60 * 1000;
const CHANNEL_LOAD_STALL_MS = 15000;
const MAX_UNPLAYABLE_SKIPS_PER_TUNE = 40;
let unplayableChannelMedia = {};
try { unplayableChannelMedia = JSON.parse(localStorage.getItem(UNPLAYABLE_CHANNEL_MEDIA_KEY) || '{}') || {}; } catch { unplayableChannelMedia = {}; }
let unplayableSkipCount = { tuneToken: -1, count: 0 };
function channelMediaIdentity(item) { return `${Number(item?.size) || 0}:${Number(item?.modified) || 0}`; }
function isUnplayableChannelMedia(item) {
  const entry = item?.path ? unplayableChannelMedia[item.path] : null;
  return Boolean(entry) && entry.identity === channelMediaIdentity(item) && Date.now() - (Number(entry.at) || 0) < UNPLAYABLE_RETRY_MS;
}
function markUnplayableChannelMedia(item) {
  if (!item?.path) return;
  unplayableChannelMedia[item.path] = { identity: channelMediaIdentity(item), at: Date.now() };
  for (const [key, entry] of Object.entries(unplayableChannelMedia)) {
    if (Date.now() - (Number(entry?.at) || 0) >= UNPLAYABLE_RETRY_MS) delete unplayableChannelMedia[key];
  }
  try { localStorage.setItem(UNPLAYABLE_CHANNEL_MEDIA_KEY, JSON.stringify(unplayableChannelMedia)); } catch { /* Skipping still works this session. */ }
}
// Moves the broadcast clock past an unreadable segment: a programme skips all of its parts (and the breaks between them),
// a commercial skips just that spot.
function skipUnplayableChannelSegment(channel, position, expectedTuneToken = channelTuneToken) {
  if (!channel?.broadcast || !position) return false;
  if (unplayableSkipCount.tuneToken !== expectedTuneToken) unplayableSkipCount = { tuneToken: expectedTuneToken, count: 0 };
  unplayableSkipCount.count += 1;
  if (unplayableSkipCount.count > MAX_UNPLAYABLE_SKIPS_PER_TUNE) {
    setTVSearching(false);
    setStatus('NO PLAYABLE PROGRAMMES ON THIS CHANNEL');
    return false;
  }
  const broken = position.segment;
  const isProgramme = broken.segmentType === 'program';
  let seconds = position.startSeconds;
  let target = -1;
  for (let index = position.index; index < channel.queue.length; index += 1) {
    const item = channel.queue[index];
    if (index > position.index && !isUnplayableChannelMedia(item)
      && (isProgramme ? item.segmentType === 'program' && item.path !== broken.path : true)) {
      target = index;
      break;
    }
    seconds += Math.max(0, Number(item.durationSeconds) || 0);
  }
  const skipSeconds = Math.max(0.5, seconds - (position.startSeconds + position.offsetSeconds));
  // initialOffsetSeconds moves the clock whether it is running or held for a restore.
  channel.broadcast.initialOffsetSeconds = (Number(channel.broadcast.initialOffsetSeconds) || 0) + skipSeconds;
  console.warn(`Skipping unplayable ${isProgramme ? 'programme' : 'commercial'} ${broken.path} (${Math.round(skipSeconds)} s)${target < 0 ? '; waiting for more schedule' : ''}`);
  setStatus(isProgramme ? 'PROGRAMME UNAVAILABLE · SKIPPING AHEAD' : 'SKIPPING DAMAGED COMMERCIAL');
  setTVSearching(true);
  window.setTimeout(() => {
    if (expectedTuneToken === channelTuneToken && selectedInput === 'tv' && activeChannelId === channel.id) syncActiveBroadcast(true, expectedTuneToken);
  }, 0);
  return true;
}
function failCurrentChannelSegment() {
  if (selectedInput !== 'tv' || !isCurrentChannelPlayback()) return false;
  const channel = activeChannel();
  const segment = channel?.queue?.[currentIndex];
  if (!segment) return false;
  markUnplayableChannelMedia(segment);
  const position = locateChannelSegment(channel, broadcastElapsed(channel));
  if (!position || position.segment.path !== segment.path) {
    syncActiveBroadcast(true, channelTuneToken);
    return true;
  }
  return skipUnplayableChannelSegment(channel, position, channelTuneToken);
}
function syncActiveBroadcast(forceTune = false, expectedTuneToken = channelTuneToken) {
  if (window.SaturdayIntermission?.active) return;
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
  if (!forceTune && holdBroadcastForPlayingSegment(channel, position)) return;
  position = locateChannelSegment(channel, broadcastElapsed(channel)) || position;
  position = pruneCompletedChannelQueue(channel, position);
  elapsed = broadcastElapsed(channel);
  if (isUnplayableChannelMedia(position.segment)) {
    skipUnplayableChannelSegment(channel, position, expectedTuneToken);
    return;
  }
  const current = channel.queue[currentIndex];
  const sameSegment = hasVideo && activePlaybackChannelId === channel.id && activePlaybackTuneToken === expectedTuneToken
    && activePlaybackPath === position.segment.path && current?.path === position.segment.path
    && current?.segmentType === position.segment.segmentType && current?.sequence === position.segment.sequence;
  if (forceTune || !sameSegment) {
    void refineChannelBreaks(channel);
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
    const delta = playbackSourceTime() - sourceTimeSeconds;
    // Chasing wall time after a slow read starts another seek; let the actual picture set the broadcast clock instead.
    if (Math.abs(delta) > 0.05 && channelPlaybackOnAir(channel)) shiftBroadcastClock(channel, delta);
  }
  prepareUpcomingChannelAudio(channel, position);
  if (channelPlaybackReadyForWarmup(channel)) prewarmAdjacentChannels();
  if (channel.broadcast.totalDurationSeconds - elapsed < 180) void appendBroadcastCoverage(channel, elapsed + 60);
}
function needsChannelTranscode(track) {
  return /\.(?:avi|mkv|wmv|asf|flv|rm|rmvb|mxf|ts|mts|m2ts|vob|dv|nut)$/i.test(String(track?.path || ''));
}
function channelPlaybackSource(track) {
  const compatible = channelAudioCompatibleMedia.get(track?.path);
  return compatible?.url ? { ...track, id: compatible.id, url: compatible.url } : track;
}
// Chromium plays the picture of files whose audio it cannot decode (AC-3, E-AC-3, DTS, TrueHD, PCM in MP4, MP2, WMA…) but stays
// silent, so anything outside the codecs it reliably decodes gets a cached copy with AAC audio (H.264 video is copied).
const CHANNEL_AUDIO_CHECK_EXTENSIONS = /\.(?:mkv|mp4|m4v|mov|webm|flv|avi|mpg|mpeg|ts|wmv)$/i;
const BROWSER_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const AUDIO_PROBE_RETRY_MS = 5 * 60 * 1000;
const channelAudioCodecVerified = new Set();
const mediaWithoutAudio = new Set();
const channelAudioCompatibilityFailures = new Map();
const channelAudioConversionStarted = new Set();
function audioCodecNeedsConversion(codec) {
  const name = String(codec || '').trim().toLowerCase();
  return Boolean(name) && name !== 'none' && !BROWSER_SAFE_AUDIO_CODECS.has(name);
}
function ensureChannelAudioCompatible(track, priority = 'background') {
  const sourcePath = String(track?.path || '');
  if (!track?.id || !sourcePath || !CHANNEL_AUDIO_CHECK_EXTENSIONS.test(sourcePath)
    || typeof window.tube.getMediaAudioCodec !== 'function' || channelAudioCodecVerified.has(sourcePath)) return Promise.resolve(null);
  if (Date.now() - (channelAudioCompatibilityFailures.get(sourcePath) || -Infinity) < AUDIO_PROBE_RETRY_MS) return Promise.resolve(null);
  if (channelAudioCompatibleMedia.has(sourcePath)) return Promise.resolve(channelAudioCompatibleMedia.get(sourcePath));
  if (channelAudioCompatibilityJobs.has(sourcePath)) {
    // A warm-up copy of what is now on screen jumps the conversion queue (main dedupes the job and starts it at once).
    if (priority === 'foreground' && channelAudioConversionStarted.has(sourcePath)) {
      window.tube.transcodeMedia(track.id, { priority: 'foreground' }).catch(() => {});
    }
    return channelAudioCompatibilityJobs.get(sourcePath);
  }
  const job = window.tube.getMediaAudioCodec(track.id).then(codec => {
    if (!audioCodecNeedsConversion(codec)) {
      // An unreadable probe ('') is not trusted as verified; the playback watchdog still checks that sound is decoding.
      if (codec) channelAudioCodecVerified.add(sourcePath);
      if (codec === 'none') mediaWithoutAudio.add(sourcePath);
      return null;
    }
    channelAudioConversionStarted.add(sourcePath);
    const onScreen = priority === 'foreground' || activePlaybackPath === sourcePath;
    return window.tube.transcodeMedia(track.id, { priority: onScreen ? 'foreground' : 'background' });
  }).then(converted => {
    if (converted?.url) channelAudioCompatibleMedia.set(sourcePath, converted);
    return converted?.url ? converted : null;
  }).catch(error => {
    channelAudioCompatibilityFailures.set(sourcePath, Date.now());
    throw error;
  }).finally(() => {
    channelAudioConversionStarted.delete(sourcePath);
    if (channelAudioCompatibilityJobs.get(sourcePath) === job) channelAudioCompatibilityJobs.delete(sourcePath);
  });
  channelAudioCompatibilityJobs.set(sourcePath, job);
  return job;
}
// Swaps the playing file for its AAC copy at the same position (channel or tape), if the viewer is still on it.
function switchToAudioCompatibleCopy(sourcePath, converted, generation, tuneToken, input) {
  if (!converted?.url || generation !== playbackGeneration || selectedInput !== input || activePlaybackPath !== sourcePath
    || activePlaybackUrl === converted.url) return false;
  if (input === 'tv' && (tuneToken !== channelTuneToken || activePlaybackChannelId !== activeChannelId)) return false;
  pendingPlaybackRestore = {
    trackPath: sourcePath,
    currentTime: Number.isFinite(video.currentTime) ? playbackSourceTime() : 0,
    wasPlaying: !video.paused && !video.ended,
    input
  };
  livePlayback = null;
  switchingTracks = true;
  fallbackAttempted = true;
  activePlaybackUrl = converted.url;
  video.src = converted.url;
  video.load();
  switchingTracks = false;
  return true;
}
function prepareChannelAudioCompatibility(track) {
  const input = selectedInput;
  // A converted copy (fallbackAttempted) always carries AAC audio already.
  if (!track?.path || fallbackAttempted || (input !== 'tv' && input !== 'video') || Boolean(track.channelMedia) !== (input === 'tv')) return;
  // Channel audio is verified alongside native loading, or already arrives as live AAC.
  if (input === 'tv') return;
  const generation = playbackGeneration;
  const tuneToken = channelTuneToken;
  ensureChannelAudioCompatible(track, 'foreground')
    .then(converted => switchToAudioCompatibleCopy(track.path, converted, generation, tuneToken, input))
    .catch(error => console.warn('Audio compatibility copy was unavailable', error));
}
// Last-resort repair when the picture plays but no sound is being decoded: convert the file's audio regardless of the probe.
const audioRepairAttempted = new Set();
const AUDIO_REPAIR_RETRY_MS = 20000;
function repairPlaybackAudio(track) {
  const input = selectedInput;
  const sourcePath = String(track?.path || '');
  if (input === 'tv' && track?.channelMedia) {
    if (!sourcePath || audioRepairAttempted.has(sourcePath)) return false;
    audioRepairAttempted.add(sourcePath);
    window.setTimeout(() => audioRepairAttempted.delete(sourcePath), AUDIO_REPAIR_RETRY_MS);
    console.warn(`No audio is decoding for ${sourcePath}; restarting it as a live stream`);
    return restartChannelPlaybackLive({ forceEncode: livePlayback?.mode === 'copy' });
  }
  if (!track?.id || !sourcePath || fallbackAttempted || audioRepairAttempted.has(sourcePath) || typeof window.tube.transcodeMedia !== 'function') return false;
  audioRepairAttempted.add(sourcePath);
  const generation = playbackGeneration;
  const tuneToken = channelTuneToken;
  console.warn(`No audio is decoding for ${sourcePath}; switching to a converted copy`);
  setStatus('RESTORING SOUND');
  window.tube.transcodeMedia(track.id).then(converted => {
    if (!converted?.url) return;
    channelAudioCompatibleMedia.set(sourcePath, converted);
    channelAudioCodecVerified.delete(sourcePath);
    switchToAudioCompatibleCopy(sourcePath, converted, generation, tuneToken, input);
  }).catch(error => {
    console.warn('Audio repair copy could not be made', error);
    // Try again shortly (a busy drive or a killed job is not permanent); the watchdog re-arms once this clears.
    window.setTimeout(() => {
      audioRepairAttempted.delete(sourcePath);
      if (activePlaybackPath === sourcePath) audioWatchdog.decodeOk = false;
    }, AUDIO_REPAIR_RETRY_MS);
  });
  return true;
}
// Check the next programme's codecs only after the current picture has settled.
const upcomingChannelMediaJobs = new Map();
function channelPlaybackReadyForWarmup(channel) {
  return channelPlaybackOnAir(channel) && channelStableSince > 0 && performance.now() - channelStableSince >= 5000
    && !channels.some(item => item.scanning);
}
function prepareUpcomingChannelAudio(channel, position) {
  if (!channel?.queue || !position || !channelPlaybackReadyForWarmup(channel)) return;
  const seen = new Set([position.segment.path]);
  for (let index = position.index + 1; index < channel.queue.length && seen.size < 2; index += 1) {
    const item = channel.queue[index];
    if (item.segmentType !== 'program' || seen.has(item.path)) continue;
    seen.add(item.path);
    if (typeof window.tube.openChannelMedia === 'function') {
      if (upcomingChannelMediaJobs.has(item.path)) continue;
      const generation = playbackGeneration;
      const job = window.tube.openChannelMedia(item.id, 0, { prepareOnly: true })
        .catch(error => {
          if (generation === playbackGeneration) console.warn('Upcoming channel media could not be prepared', error);
          window.setTimeout(() => {
            if (upcomingChannelMediaJobs.get(item.path) === job) upcomingChannelMediaJobs.delete(item.path);
          }, 60_000);
        });
      upcomingChannelMediaJobs.set(item.path, job);
      while (upcomingChannelMediaJobs.size > 64) upcomingChannelMediaJobs.delete(upcomingChannelMediaJobs.keys().next().value);
    }
  }
}
async function prewarmChannelPlayback(channel, requestToken) {
  if (requestToken !== channelPrewarmToken || !channel.broadcast || !channel.queue?.length) return;
  const position = locateChannelSegment(channel, broadcastElapsed(channel));
  if (!position) return;
  const program = position.segment.segmentType === 'program'
    ? position.segment
    : channel.queue.slice(position.index + 1).find(item => item.segmentType === 'program');
  if (!program?.id) return;
  const generation = playbackGeneration;
  try {
    // Only the file's codecs are looked up ahead of time; conversion happens live while it airs.
    if (typeof window.tube.openChannelMedia === 'function') await window.tube.openChannelMedia(program.id, 0, { prepareOnly: true });
  } catch (error) {
    if (generation !== playbackGeneration) return;
    console.warn(`Channel media prewarm failed for ${channel.name}`, error);
  }
}
function prewarmAdjacentChannels() {
  const available = channels.filter(channel => channel.enabled !== false && channel.scanComplete && !channel.error);
  if (!channelsStartupReady || available.length < 2 || channelPrewarmedGeneration === playbackGeneration
    || (selectedInput === 'tv' && !channelPlaybackReadyForWarmup(activeChannel()))) return;
  channelPrewarmedGeneration = playbackGeneration;
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
  const streaming = activeYoutubeStarter();
  const channel = activeChannel();
  const tuneToken = channelTuneToken;
  if (selectedInput === 'tv' && (!hasVideo || video.paused)) setTVSearching(true);
  if (!channelsStartupReady) {
    setTVSearching(true);
    setStatus('PREPARING TV CHANNELS');
    return;
  }
  if (streaming) {
    const youtube = window.SaturdayTubeYouTubePlayer;
    if (!youtube) {
      setTVSearching(false);
      setStatus('YOUTUBE PLAYER IS NOT AVAILABLE');
      return;
    }
    if (youtube.isStarted(streaming.id)) return;
    setTVSearching(true);
    void youtube.start(streaming, message => {
      setStatus(message);
      if (!String(message).startsWith('LOADING')) setTVSearching(false);
      setMasterVolume();
    });
    return;
  }
  window.SaturdayTubeYouTubePlayer?.stop();
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
    if (!channel.scanning) prioritizeActiveChannelScan();
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
async function scanChannel(channel, { force = false } = {}) {
  if (channel.scanPromise) return channel.scanPromise;
  const pending = (async () => {
    channel.scanning = true;
    channel.error = '';
    renderChannels();
    let savedPlaybackState = channelPlaybackSnapshot(channel) || channel.savedPlaybackState || null;
    try {
      const restoredRoot = await window.tube.restoreChannelFolder(channel.root);
      const scanned = await window.tube.rescanChannelFolder(restoredRoot, { force });
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
      channel.playlistCached = scanned.fromCache === true;
      if (savedPlaybackState) {
        const restored = await window.tube.reconcileChannelPlayback(
          channel.shows.filter(show => show.enabled !== false && !channel.disabledShowPaths?.includes(show.path)),
          channelCommercials(channel),
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
        await fillChannelCommercialBreaks(channel);
        void refineChannelBreaks(channel);
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
      if (channelsStartupReady) releaseChannelRestore(channel);
      renderChannels();
      if (tvGuideDialog.open) {
        renderTVGuide();
        if (currentGuideChannel()?.id === channel.id) void ensureGuideSchedule(channel);
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
  window.SaturdayTubeYouTubePlayer?.stop();
  channelStableSince = 0;
  channelLoadPhase = 'TUNING...';
  playbackGeneration += 1;
  activePlaybackGeneration = -1;
  activePlaybackUrl = '';
  livePlayback = null;
  setPlayingAuthenticTape(false);
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
  renderYoutubeStarterSetup();
  channelsStartupReady = false;
  if (selectedInput === 'tv') setTVSearching(true);
  let raw = [];
  try { raw = JSON.parse(localStorage.getItem(CHANNELS_KEY) || '[]'); } catch { /* Start with an empty channel list. */ }
  if (!Array.isArray(raw)) raw = [];
  channels = raw.filter(item => item && typeof item.id === 'string' && typeof item.root === 'string').map(item => ({
    id: item.id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'TV Channel',
    abbreviation: makeChannelAbbreviation(typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'TV Channel', item.root),
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
    adFree: item.adFree === true,
    restorePending: true,
    queue: [], cursor: 0, broadcast: null, shows: [], commercials: [], showCount: 0, episodeCount: 0, commercialCount: 0, error: '', scanning: false, scanComplete: false, scanPromise: null
  }));
  const savedActive = localStorage.getItem('saturdayTube.activeChannel.v1');
  activeChannelId = channels.some(item => item.id === savedActive) ? savedActive : channels[0]?.id || '';
  renderChannels();
  await discoverNewChannels();
  const firstEnabled = channels.find(item => item.enabled !== false);
  if (!activeChannel() || activeChannel().enabled === false) activeChannelId = firstEnabled?.id || '';
  const startupOrder = [activeChannel(), ...channels.filter(item => item.id !== activeChannelId)].filter(Boolean);
  // Only wait for the first playable channel; everything else keeps warming in the background.
  let firstPlayable = null;
  for (const channel of startupOrder) {
    if (channel.enabled === false) continue;
    await scanChannel(channel);
    releaseChannelRestore(channel);
    if (isPlayableChannel(channel)) { firstPlayable = channel; break; }
  }
  channelsStartupReady = true;
  if (!isPlayableChannel(activeChannel())) activeChannelId = firstPlayable?.id || activeChannelId;
  const firstRunKey = 'saturdayTube.publicStarterModeInitialized.v1';
  const firstRunPublicMode = !HAD_SAVED_CONTROL_PREFERENCES && channels.length === 0 && !localStorage.getItem(firstRunKey);
  if (firstRunPublicMode && configuredYoutubeStarters().length) {
    activeYoutubeStarterId = configuredYoutubeStarters()[0].id;
    try {
      localStorage.setItem(YOUTUBE_ACTIVE_KEY, activeYoutubeStarterId);
      localStorage.setItem(firstRunKey, '1');
    } catch { /* A fresh install can still tune the first starter for this session. */ }
    setInputSource('tv', false);
  }
  persistChannels();
  renderChannels();
  if (selectedInput === 'tv') {
    if (activeYoutubeStarter() || isPlayableChannel(activeChannel())) void startActiveChannel();
    else {
      setTVSearching(false);
      setStatus(activeChannel()?.error ? 'TV CHANNEL SCAN FAILED · CHECK DRIVE' : 'NO PLAYABLE TV CHANNEL FOUND');
    }
  }
  void warmChannelsInBackground();
}
function isPlayableChannel(channel) {
  return Boolean(channel && channel.enabled !== false && !channel.error && channel.queue?.some(item => item.segmentType === 'program'));
}
function releaseChannelRestore(channel) {
  if (!channel?.restorePending) return;
  if (channel.broadcast) channel.broadcast.startedAtMs = Date.now();
  channel.restorePending = false;
}
function prioritizeActiveChannelScan() {
  // One tuned channel may jump ahead of the ordered warm-up; channels surfed past are left for the warm-up queue.
  if (channelPriorityScanPromise) return;
  const channel = activeChannel();
  if (!channel || channel.scanComplete || channel.scanning) return;
  channelPriorityScanPromise = scanChannel(channel).finally(() => {
    channelPriorityScanPromise = null;
    if (selectedInput === 'tv') prioritizeActiveChannelScan();
  });
}
function warmChannelsInBackground() {
  if (channelWarmupPromise) return channelWarmupPromise;
  channelWarmupPromise = (async () => {
    // Scan in channel order whatever is on screen (TV or VHS) so every channel is ready before it is surfed to.
    let next;
    while ((next = channels.find(channel => !channel.scanComplete))) {
      await scanChannel(next);
      releaseChannelRestore(next);
    }
  })().catch(error => console.warn('Background channel warm-up stopped', error)).finally(() => {
    channelWarmupPromise = null;
    renderChannels();
    if (selectedInput === 'tv' && isPlayableChannel(activeChannel())) prewarmAdjacentChannels();
  });
  return channelWarmupPromise;
}
function savedChannelSource() {
  const saved = localStorage.getItem(CHANNEL_SOURCE_KEY) || '';
  if (saved) return saved;
  // Older setups never saved a source; adopt the shared TV-Channels parent so new folders still appear.
  const parent = channels.map(channel => String(channel.root).replace(/[\\/][^\\/]+[\\/]?$/, ''))
    .find(folder => /[\\/]tv-channels$/i.test(folder));
  if (parent) localStorage.setItem(CHANNEL_SOURCE_KEY, parent);
  return parent || '';
}
// "9_Disney" is Disney placed ninth on the dial; the number only orders channels and is never part of the name.
const CHANNEL_ORDER_PREFIX = /^\s*(\d+)\s*[_.)-]\s*/;
function channelFolderName(root) {
  const folder = String(root || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().trim();
  return folder.replace(CHANNEL_ORDER_PREFIX, '').trim() || folder;
}
function channelFolderOrder(root) {
  const match = String(root || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().match(CHANNEL_ORDER_PREFIX);
  return match ? Number(match[1]) : Infinity;
}
function sortChannelsByDial() {
  const before = channels.map(channel => channel.id).join('|');
  channels.sort((a, b) => (channelFolderOrder(a.root) - channelFolderOrder(b.root))
    || channelFolderName(a.root).localeCompare(channelFolderName(b.root), undefined, { numeric: true, sensitivity: 'base' }));
  return channels.map(channel => channel.id).join('|') !== before;
}
function channelFolderKey(root) {
  return channelFolderName(root).toLocaleLowerCase('en-US');
}
function remapChannelPaths(value, oldRoot, newRoot) {
  const prefix = `${String(oldRoot).replace(/[\\/]+$/, '')}/`;
  const remap = text => (typeof text === 'string' && text.startsWith(prefix) ? `${String(newRoot).replace(/[\\/]+$/, '')}/${text.slice(prefix.length)}` : text);
  if (Array.isArray(value)) return value.map(item => remapChannelPaths(item, oldRoot, newRoot));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [remap(key), remapChannelPaths(item, oldRoot, newRoot)]));
  }
  return remap(value);
}
// A renamed folder keeps its channel: saved playback, history and hidden shows follow the files to the new path.
function adoptRenamedChannelFolder(channel, root) {
  const oldRoot = channel.root;
  const snapshot = channel.broadcast ? channelPlaybackSnapshot(channel) : channel.savedPlaybackState;
  channel.savedPlaybackState = snapshot ? remapChannelPaths(snapshot, oldRoot, root) : null;
  channel.playHistory = remapChannelPaths(channel.playHistory || {}, oldRoot, root);
  channel.rotation = remapChannelPaths(channel.rotation || {}, oldRoot, root);
  channel.disabledShowPaths = remapChannelPaths(channel.disabledShowPaths || [], oldRoot, root);
  if (channel.broadcast) {
    channel.queue = [];
    channel.broadcast = null;
  }
  channel.root = root;
}
function insideChannelSource(root, source = localStorage.getItem(CHANNEL_SOURCE_KEY) || '') {
  return Boolean(source) && String(root || '').startsWith(`${source.replace(/[\\/]+$/, '')}/`);
}
// A channel whose folder moved into the source keeps its id and playback; a stale copy outside the source is dropped.
function reconcileMovedChannels() {
  const source = localStorage.getItem(CHANNEL_SOURCE_KEY) || '';
  if (!source) return false;
  const inSource = new Set(channels.filter(channel => insideChannelSource(channel.root, source)).map(channel => channelFolderKey(channel.root)));
  const stale = channels.filter(channel => !insideChannelSource(channel.root, source) && inSource.has(channelFolderKey(channel.root)));
  if (!stale.length) return false;
  for (const channel of stale) {
    const replacement = channels.find(item => item !== channel && insideChannelSource(item.root, source)
      && channelFolderKey(item.root) === channelFolderKey(channel.root));
    if (activeChannelId === channel.id && replacement) activeChannelId = replacement.id;
  }
  channels = channels.filter(channel => !stale.includes(channel));
  return true;
}
function appendDiscoveredChannels(folders) {
  const added = [];
  let moved = false;
  for (const folder of folders || []) {
    if (!folder?.root || channels.some(channel => channel.root === folder.root)) continue;
    const renamed = folder.renamedFrom ? channels.find(channel => channel.root === folder.renamedFrom) : null;
    const previous = renamed || (insideChannelSource(folder.root)
      ? channels.find(channel => !insideChannelSource(channel.root) && channelFolderKey(channel.root) === channelFolderKey(folder.root))
      : null);
    if (previous) {
      adoptRenamedChannelFolder(previous, folder.root);
      previous.root = folder.root;
      previous.name = folder.name || previous.name;
      previous.error = '';
      previous.scanComplete = false;
      added.push(previous);
      moved = true;
      continue;
    }
    const channel = {
      id: `channel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: folder.name || 'TV Channel',
      abbreviation: makeChannelAbbreviation(folder.name || 'TV Channel', folder.root),
      root: folder.root,
      rotation: {}, savedPlaybackState: null, playHistory: {}, lastPlayedSequence: null,
      nextSequence: 0, nextProgrammeSequence: 0, enabled: true, disabledShowPaths: [],
      queue: [], cursor: 0, broadcast: null, shows: [], commercials: [],
      showCount: 0, episodeCount: 0, commercialCount: 0, error: '', scanning: false, scanComplete: false, scanPromise: null
    };
    channels.push(channel);
    added.push(channel);
  }
  if (reconcileMovedChannels()) moved = true;
  if (sortChannelsByDial()) moved = true;
  if (added.length || moved) {
    persistChannels();
    renderChannels();
  }
  return added;
}
async function discoverNewChannels() {
  try {
    return appendDiscoveredChannels(await window.tube.discoverSiblingChannels(channels.map(channel => channel.root), savedChannelSource()));
  } catch (error) {
    console.warn('TV channel folders could not be discovered', error);
    return [];
  }
}
async function chooseChannelSource() {
  channelSetupNotice = '';
  chooseChannelSourceButton.disabled = true;
  channelStatus.textContent = 'CHOOSE SOURCE FOLDER…';
  try {
    const source = await window.tube.chooseChannelSource();
    if (!source) return;
    localStorage.setItem(CHANNEL_SOURCE_KEY, source.root);
    const added = appendDiscoveredChannels(source.channels);
    if (!source.channels?.length) channelSetupNotice = 'No channel folders found inside that folder.';
    if (!activeChannel() && added[0]) activeChannelId = added[0].id;
    for (const channel of added) await scanChannel(channel);
    persistChannels();
    if (selectedInput === 'tv' && added.some(channel => channel.id === activeChannelId)) await startActiveChannel();
  } catch (error) {
    console.warn('TV channel source could not be read', error);
    channelSetupNotice = userFacingChannelError(error, true);
  } finally { chooseChannelSourceButton.disabled = false; renderChannels(); }
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
// Puts a channel's not-yet-aired programmes back at the front of their shows' episode lists and drops its schedule, so the
// next scan builds a fresh one (new show order, new break points) without skipping an episode. A part-aired one replays.
function unwrapChannelSchedule(channel) {
  const position = channel?.broadcast ? locateChannelSegment(channel, broadcastElapsed(channel)) : null;
  const rotation = channel.rotation && typeof channel.rotation === 'object' ? channel.rotation : {};
  const bags = { ...(rotation.episodeBags || {}) };
  const returned = {};
  for (const item of (channel.queue || []).slice(position ? position.index : 0)) {
    if (item?.segmentType !== 'program' || typeof item.showPath !== 'string' || typeof item.path !== 'string') continue;
    const paths = returned[item.showPath] ||= [];
    if (!paths.includes(item.path)) paths.push(item.path);
  }
  for (const [showPath, paths] of Object.entries(returned)) {
    bags[showPath] = [...paths, ...(Array.isArray(bags[showPath]) ? bags[showPath] : []).filter(filePath => !paths.includes(filePath))];
  }
  channel.rotation = { ...rotation, episodeBags: bags };
  channel.queue = [];
  channel.cursor = 0;
  channel.broadcast = null;
  channel.savedPlaybackState = null;
}
async function shuffleAllChannels() {
  if (!channelsStartupReady || !channels.length || channelRefreshPromise
    || channels.some(channel => channel.adFreeUpdating || channel.guideEditPromise)) return;
  const ordered = [activeChannel(), ...channels.filter(channel => channel.id !== activeChannelId)].filter(Boolean);
  channelRefreshPromise = (async () => {
    // Let the shared refresh lock be assigned before rendering or starting any queue work.
    await Promise.resolve();
    let completed = 0;
    const failed = [];
    for (const [index, channel] of ordered.entries()) {
      if (!channels.includes(channel)) continue;
      channelShuffleStatus = `SHUFFLING ${index + 1} / ${ordered.length} · ${channel.name.toUpperCase()}`;
      renderChannels();
      renderTVGuide();
      try {
        if (channel.scanPromise) await channel.scanPromise;
        if (!channel.scanComplete) await scanChannel(channel);
        if (channel.error) throw new Error(channel.error);
        if (channel.guideSchedulePromise) await channel.guideSchedulePromise;
        if (channel.broadcastInitPromise) await channel.broadcastInitPromise;
        if (channel.broadcast?.queuePromise) await channel.broadcast.queuePromise;
        if (selectedInput === 'tv' && activeChannelId === channel.id) {
          channelTuneToken += 1;
          clearChannelVideoForInputChange();
          setTVSearching(true);
        }
        resetChannelShuffle(channel);
        await initializeChannelBroadcast(channel);
        if (channel.error) throw new Error(channel.error);
        releaseChannelRestore(channel);
        persistChannels();
        completed += 1;
      } catch (error) {
        failed.push(channel.name);
        console.error(`Channel shuffle failed for ${channel.name}`, error);
      } finally {
        if (selectedInput === 'tv' && activeChannelId === channel.id) startActiveChannel();
      }
    }
    channelShuffleStatus = failed.length
      ? `SHUFFLED ${completed} / ${ordered.length} · FAILED: ${failed.join(', ')} · CHECK CHANNELS AND RETRY`
      : `SHUFFLED ${completed} CHANNEL${completed === 1 ? '' : 'S'} + COMMERCIALS`;
    setStatus(channelShuffleStatus);
  })().catch(error => {
    console.error('TV channel shuffle stopped', error);
    channelShuffleStatus = 'SHUFFLE FAILED · TRY AGAIN';
    setStatus(channelShuffleStatus);
  }).finally(() => {
    channelRefreshPromise = null;
    renderChannels();
    renderTVGuide();
  });
  return channelRefreshPromise;
}
async function rescanActiveChannel({ reshuffle = false } = {}) {
  const channel = activeChannel();
  if (!channel || !channelsStartupReady || channelRefreshPromise) return;
  rescanChannelButton.disabled = true;
  channelRefreshPromise = (async () => {
    // Refresh is the only full rebuild of saved playlists; startup reuses them while the folders are unchanged.
    // Each channel is rewrapped from its folder in turn, keeping every show's place in its episodes.
    for (const added of await discoverNewChannels()) await scanChannel(added, { force: true });
    if (channel.scanPromise) await channel.scanPromise;
    if (reshuffle) resetChannelShuffle(channel);
    else unwrapChannelSchedule(channel);
    await scanChannel(channel, { force: true });
    for (const other of channels.filter(item => item.id !== channel.id && item.enabled !== false)) {
      if (other.scanPromise) await other.scanPromise;
      if (reshuffle) resetChannelShuffle(other);
      else unwrapChannelSchedule(other);
      await scanChannel(other, { force: true });
      releaseChannelRestore(other);
    }
  })().catch(error => console.warn('TV channel refresh stopped', error)).finally(() => {
    channelRefreshPromise = null;
    rescanChannelButton.disabled = false;
    renderChannels();
  });
  return channelRefreshPromise;
}
function resetChannelShuffle(channel) {
  const first = channel.queue?.find(item => item.segmentType === 'program');
  unwrapChannelSchedule(channel);
  channel.rotation = {
    lastShowPath: first?.showPath || '',
    episodeOrderVersion: 'season-episode-v1',
    lastEpisodeByShow: first?.showPath && first?.path ? { [first.showPath]: first.path } : {}
  };
  channel.playHistory = {};
  channel.lastPlayedSequence = null;
  channel.nextSequence = 0;
  channel.nextProgrammeSequence = 0;
}
function makeChannelAbbreviation(name, root = '') {
  // Only the channel's own folder name counts; parent folders and the dial-order number must not leak into the label.
  const folder = (root ? channelFolderName(root) : '') || String(name || '');
  const identity = folder.toLocaleLowerCase('en-US').replace(/[\s._-]+/g, ' ').trim();
  if (/^comedy ?central$/.test(identity)) return 'CMDY';
  if (/^hbo ?(kids|family)$/.test(identity)) return 'HBOK';
  if (/^hbo$/.test(identity)) return 'HBO';
  if (/^(00s|2000s)$/.test(identity)) return '00s';
  if (/^(90s|1990s)$/.test(identity)) return '90s';
  if (/^nick ?jr$/.test(identity)) return 'NKJR';
  if (/^(nickelodeon|nick)$/.test(identity)) return 'NICK';
  if (/^666$/.test(identity)) return '666';
  if (/^cartoon ?network$/.test(identity)) return 'CN';
  if (/^disney( channel)?$/.test(identity)) return 'DSNY';
  if (/^(studio )?ghibli$/.test(identity)) return 'GHBL';
  if (/^mtv$/.test(identity)) return 'MTV';
  if (/^vh ?1$/.test(identity)) return 'VH1';
  const words = identity.match(/[a-z0-9]+/ig) || [];
  const meaningful = words.filter(word => !['the', 'a', 'an'].includes(word));
  if (meaningful.length > 1) return meaningful.map(word => word[0]).join('').slice(0, 5).toLocaleUpperCase('en-US');
  return (meaningful[0] || 'TV').slice(0, 4).toLocaleUpperCase('en-US');
}
function assignChannelAbbreviations() {
  const used = new Set();
  for (const channel of channels) {
    const base = makeChannelAbbreviation(channel.name, channel.root);
    let label = base;
    for (let suffix = 2; used.has(label); suffix += 1) label = `${base.slice(0, 5 - String(suffix).length)}${suffix}`;
    used.add(label);
    channel.abbreviation = label;
  }
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
  if (!channel) return;
  // The number sits after the name on the right-aligned readout, so it stays put while names change length.
  showChannelSurfText(`${channelSurfAbbreviation(channel)} ${channelDialNumber(channel)}`);
}
function showChannelSurfText(text, holdMs = 1900) {
  if (!channelSurfOverlay) return;
  channelSurfOverlay.textContent = text;
  channelSurfOverlay.hidden = false;
  channelSurfShownAt = performance.now();
  channelSurfHoldMs = holdMs;
  channelSurfOverlay.classList.remove('surf-in');
  channelSurfOverlay.style.animationDuration = `${holdMs}ms`;
  void channelSurfOverlay.offsetWidth;
  channelSurfOverlay.classList.add('surf-in');
  if (channelSurfOverlayTimer) window.clearTimeout(channelSurfOverlayTimer);
  channelSurfOverlayTimer = window.setTimeout(() => {
    channelSurfOverlay.hidden = true;
    channelSurfOverlay.classList.remove('surf-in');
    channelSurfOverlayTimer = null;
  }, holdMs);
}
function selectActiveChannel(id) {
  if (!channelsStartupReady || !channels.some(channel => channel.id === id && channel.enabled !== false && !channel.error)) return;
  const wasStreaming = Boolean(activeYoutubeStarter());
  const changed = activeChannelId !== id || wasStreaming;
  if (selectedInput === 'tv') {
    if (!wasStreaming) saveChannelPlaybackState();
    window.dispatchEvent(new Event('saturdayTube-channel-change'));
  }
  if (changed) channelTuneToken += 1;
  if (changed) {
    const previous = currentChannelSelectionKey();
    if (previous) previousChannelId = previous;
  }
  activeYoutubeStarterId = '';
  try { localStorage.setItem(YOUTUBE_ACTIVE_KEY, ''); } catch { /* Selection remains valid for this session. */ }
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
  syncBypassControls();
  showChannelSurfOverlay(activeChannel());
  if (selectedInput === 'tv') {
    if (changed) clearChannelVideoForInputChange();
    setTVSearching(true);
    void startActiveChannel();
  }
}
function cycleActiveChannel(direction) {
  if (!channelsStartupReady) return;
  const lineup = [
    ...channels.filter(channel => channel.enabled !== false && !channel.error).map(channel => ({ kind: 'local', id: channel.id })),
    ...configuredYoutubeStarters().map(starter => ({ kind: 'youtube', id: starter.id }))
  ];
  if (!lineup.length) return;
  const currentKey = currentChannelSelectionKey();
  const current = lineup.findIndex(item => `${item.kind}:${item.id}` === currentKey);
  const nextIndex = current < 0
    ? (direction > 0 ? 0 : lineup.length - 1)
    : (current + direction + lineup.length) % lineup.length;
  const next = lineup[nextIndex];
  if (next.kind === 'youtube') {
    selectYoutubeStarter(next.id);
    return;
  }
  selectActiveChannel(next.id);
  if (selectedInput !== 'tv') setInputSource('tv');
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
let trackpadPoint = null;
const trackpadCursor = document.createElement('div');
trackpadCursor.id = 'trackpadCursor';
trackpadCursor.setAttribute('popover', 'manual');
trackpadCursor.setAttribute('aria-hidden', 'true');
trackpadCursor.innerHTML = '<svg viewBox="0 0 24 28"><path d="M2 2v22l6-6 4 9 4-2-4-8h9Z"/></svg>';
document.body.append(trackpadCursor);
function showTrackpadCursor(value) {
  trackpadPoint = { x: value.x, y: value.y };
  trackpadCursor.style.left = `${value.x}px`;
  trackpadCursor.style.top = `${value.y}px`;
  document.body.classList.add('remote-trackpad-active');
  if (trackpadCursor.matches(':popover-open')) trackpadCursor.hidePopover();
  trackpadCursor.showPopover();
  showPlaybackCursor();
}
function showPlaybackCursor(event) {
  if (event?.pointerType && event.pointerType !== 'mouse') return;
  if (event && trackpadPoint && (Math.abs(event.clientX - trackpadPoint.x) > 1 || Math.abs(event.clientY - trackpadPoint.y) > 1)) {
    trackpadPoint = null;
    trackpadCursor.hidePopover();
    document.body.classList.remove('remote-trackpad-active');
  }
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = null;
  document.body.classList.remove('cursor-idle');
  cursorTimer = setTimeout(() => {
    cursorTimer = null;
    document.body.classList.add('cursor-idle');
    trackpadCursor.hidePopover();
  }, 1200);
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
  shuttingOff = false;
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
  titleEl.textContent = showLanding ? '' : '';
  seek.value = '0';
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playButton.textContent = '▶ PLAY';
  fallbackAttempted = false;
  playbackGeneration += 1;
  activePlaybackGeneration = -1;
  activePlaybackUrl = '';
  livePlayback = null;
  setPlayingAuthenticTape(false);
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
function beginTrackPlayback(index, restoreSession = null, trackOverride = null, sourceOptions = {}) {
  if (window.SaturdayIntermission?.active) return;
  const list = activePlaylist();
  let track = trackOverride || list?.tracks[index];
  if (!track || track.unavailable || !track.url) return;
  channelStableSince = 0;
  window.tube.setPlaybackPriority?.(true);
  if (!track.channelMedia && !trackOverride) track = channelPlaybackSource(track);
  const usingConvertedCopy = Boolean(track.path) && channelAudioCompatibleMedia.get(track.path)?.url === track.url;
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
  stage.classList.remove('shutting-off');
  lastCompositePaused = null;
  lastUploadedTime = -1;
  lastRenderedSource = null;
  hasVideo = true;
  currentIndex = index;
  fallbackAttempted = usingConvertedCopy;
  playbackGeneration += 1;
  activePlaybackGeneration = playbackGeneration;
  activePlaybackUrl = track.url;
  activePlaybackChannelId = track.channelMedia === true && selectedInput === 'tv' ? activeChannelId : '';
  activePlaybackTuneToken = activePlaybackChannelId ? channelTuneToken : -1;
  activePlaybackPath = track.path || '';
  setPlayingAuthenticTape(isAuthenticTapeTrack(track));
  loadPlaybackSource(track, restoreSession, sourceOptions);
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
function attachPlaybackUrl(url, generation) {
  if (window.SaturdayIntermission?.active && intermissionPlayback) {
    intermissionPlayback.deferredSource = { url, generation };
    return;
  }
  activePlaybackUrl = url;
  video.src = url;
  video.load();
  watchChannelLoad(generation);
}
// Channel programmes Chromium can't play as they are stream through a live conversion; everything else loads directly.
function loadPlaybackSource(track, restoreSession, sourceOptions = {}) {
  livePlayback = null;
  const generation = playbackGeneration;
  if (track.channelMedia !== true || !activePlaybackChannelId || typeof window.tube.openChannelMedia !== 'function') {
    attachPlaybackUrl(track.url, generation);
    return;
  }
  const startSeconds = Math.max(0, Number(restoreSession?.currentTime) || 0);
  channelLoadPhase = needsChannelTranscode(track) || sourceOptions.forceLive ? 'READING VIDEO FORMAT...' : 'LOADING VIDEO...';
  window.tube.openChannelMedia(track.id, startSeconds, sourceOptions).then(plan => {
    if (generation !== playbackGeneration) return;
    if (plan?.audio === 'none') mediaWithoutAudio.add(track.path);
    else if (plan?.audio) mediaWithoutAudio.delete(track.path);
    if (plan?.live && plan.url) {
      channelLoadPhase = 'STARTING LIVE VIDEO...';
      livePlayback = { path: track.path, baseSeconds: Math.max(0, Number(plan.startSeconds) || 0), mode: plan.mode, options: sourceOptions };
      attachPlaybackUrl(plan.url, generation);
    } else {
      channelLoadPhase = 'LOADING VIDEO...';
      attachPlaybackUrl(plan?.url || track.url, generation);
      if (plan?.verifyAudio) verifyNativeChannelAudio(track, generation);
    }
  }).catch(error => {
    if (generation !== playbackGeneration) return;
    console.warn('Channel media could not be prepared; loading it directly', error);
    attachPlaybackUrl(track.url, generation);
  });
}
function verifyNativeChannelAudio(track, generation) {
  if (channelAudioCompatibilityJobs.has(track.path)) return;
  const job = window.tube.getMediaAudioCodec(track.id).then(codec => {
    if (codec) channelAudioCodecVerified.add(track.path);
    if (codec === 'none') mediaWithoutAudio.add(track.path);
    else if (codec) mediaWithoutAudio.delete(track.path);
    if (generation === playbackGeneration && activePlaybackPath === track.path && audioCodecNeedsConversion(codec)) {
      restartChannelPlaybackLive();
    }
  }).catch(error => {
    if (generation !== playbackGeneration || error.name === 'AbortError') return;
    channelAudioCompatibilityFailures.set(track.path, Date.now());
    console.warn('Channel audio check could not read the file; playback watchdog remains active', error);
  }).finally(() => {
    if (channelAudioCompatibilityJobs.get(track.path) === job) channelAudioCompatibilityJobs.delete(track.path);
  });
  channelAudioCompatibilityJobs.set(track.path, job);
}
// Restarts the programme on screen as a live stream from where the picture is (or was meant to start). Copied pictures
// fall back to a full re-encode; repeated failures on one file give up so the channel moves on.
const LIVE_RESTART_WINDOW_MS = 2 * 60 * 1000;
const MAX_LIVE_RESTARTS = 3;
const liveRestarts = new Map();
function restartChannelPlaybackLive({ forceEncode = false, sourceSeconds = null } = {}) {
  if (selectedInput !== 'tv' || !isCurrentChannelPlayback()) return false;
  const track = activePlaylist()?.tracks[currentIndex];
  if (!track?.id || !track.path || typeof window.tube.openChannelMedia !== 'function') return false;
  const now = Date.now();
  const history = (liveRestarts.get(track.path) || []).filter(time => now - time < LIVE_RESTART_WINDOW_MS);
  if (history.length >= MAX_LIVE_RESTARTS) return false;
  history.push(now);
  liveRestarts.set(track.path, history);
  const from = Number.isFinite(sourceSeconds) ? sourceSeconds
    : video.readyState >= 1 ? playbackSourceTime()
    : Number(pendingPlaybackRestore?.currentTime) || (livePlayback?.baseSeconds ?? 0);
  console.warn(`Restarting ${track.path} as a live ${forceEncode ? 'converted' : ''} stream at ${from.toFixed(1)} s`);
  beginTrackPlayback(currentIndex, { trackPath: track.path, currentTime: Math.max(0, from), wasPlaying: true, input: 'tv' }, track,
    { forceLive: true, forceEncode });
  return true;
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
  if (dial === brightnessDial) applyTvBacklight(clamped);
  if (dial === videoDial) {
    document.querySelector('#volumeArrowReadout').textContent = dialReadoutText(dial, clamped);
    document.querySelector('#volumeDownButton').disabled = clamped <= 0;
    document.querySelector('#volumeUpButton').disabled = clamped >= 100;
  }
}
function adjustTracking(direction) {
  const before = dialValue(vhsScanDial);
  setDialValue(vhsScanDial, before + Math.sign(direction) * 5);
  if (dialValue(vhsScanDial) !== before) saveControlPreferences();
}
function showVolumeOverlay() {
  if (!volumeOverlay) return;
  const level = Math.round(dialValue(videoDial));
  const bar = volumeOverlay.querySelector('.volume-bar');
  if (bar.childElementCount !== 40) bar.replaceChildren(...Array.from({ length: 40 }, () => document.createElement('i')));
  [...bar.children].forEach((tick, index) => tick.classList.toggle('on', index < Math.round(level * 0.4)));
  bar.style.setProperty('--level', String(level / 100));
  volumeOverlay.querySelector('.volume-value').textContent = String(level);
  volumeOverlay.hidden = false;
  if (volumeOverlayTimer) window.clearTimeout(volumeOverlayTimer);
  volumeOverlayTimer = window.setTimeout(() => { volumeOverlay.hidden = true; volumeOverlayTimer = null; }, 2000);
}
function syncMuteOverlay() {
  if (muteOverlay) muteOverlay.hidden = mutedVolume === null;
}
function setMuted(muted) {
  if (muted === (mutedVolume !== null)) return;
  if (muted) {
    mutedVolume = dialValue(videoDial) || 50;
    setDialValue(videoDial, 0);
  } else {
    setDialValue(videoDial, mutedVolume);
    mutedVolume = null;
  }
  setMasterVolume();
  saveControlPreferences();
  syncMuteOverlay();
  if (!muted) showVolumeOverlay();
}
function toggleMute() {
  setMuted(mutedVolume === null);
}
function adjustMasterVolume(direction, step = 5) {
  // Like a real set, a volume key while muted brings the sound back at its old level first.
  if (mutedVolume !== null) { setMuted(false); return; }
  const before = dialValue(videoDial);
  setDialValue(videoDial, before + Math.sign(direction) * step);
  showVolumeOverlay();
  if (dialValue(videoDial) === before) return;
  setMasterVolume();
  saveControlPreferences();
}
const dialChangeHandlers = new Map();
function bindRotaryDial(dial, onChange = () => {}) {
  dialChangeHandlers.set(dial, onChange);
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
  if (dial === brightnessDial) applyTvBacklight(value);
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
let backdropDim = false;
const VIEW_MODE_KEY = 'saturdayTube.viewMode.v1';
let savedViewMode = 'off';
try { savedViewMode = localStorage.getItem(VIEW_MODE_KEY) || 'off'; }
catch (error) { console.warn('View mode could not be restored', error); }
async function setBackdropDim(enabled) {
  backdropDim = enabled === true;
  try { if (typeof window.tube.setBackdropDim === 'function') backdropDim = await window.tube.setBackdropDim(backdropDim); }
  catch (error) { console.warn('Dim-room backdrop is unavailable', error); }
}
async function toggleNativeWindowFullscreen() {
  try {
    if (backdropDim) await setBackdropDim(false);
    if (window.SaturdayScenes.active) {
      window.SaturdayScenes.exit();
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(true);
    } else nativeWindowFullscreen = await window.tube.toggleWindowFullscreen();
    syncFullscreenButtonState();
  } catch (error) { setStatus('FULLSCREEN NOT AVAILABLE'); console.error(error); }
}
function syncFullscreenButtonState() {
  try { localStorage.setItem(VIEW_MODE_KEY, fullscreenMode()); }
  catch (error) { console.warn('View mode could not be saved', error); }
  document.querySelector('#screenOnlyButton').setAttribute('aria-pressed', String(document.fullscreenElement === stage || document.body.classList.contains('screen-fill')));
  document.querySelector('#tvFullscreenButton').setAttribute('aria-pressed', String(fullscreenMode() === 'tv'));
  document.querySelector('#dimRoomButton').setAttribute('aria-pressed', String(fullscreenMode() === 'dim'));
  document.querySelector('#sceneModeButton').setAttribute('aria-pressed', String(fullscreenMode() === 'scene'));
  reportRemoteState();
}
function fullscreenMode() {
  if (window.SaturdayScenes.active) return 'scene';
  if (document.fullscreenElement === stage || document.body.classList.contains('screen-fill')) return 'screen';
  if (nativeWindowFullscreen || document.fullscreenElement) return 'tv';
  return backdropDim ? 'dim' : 'off';
}
async function restoreViewMode() {
  try {
    if (savedViewMode === 'scene') await enterSceneFullscreen();
    else if (savedViewMode === 'dim') await setBackdropDim(true);
    else if (savedViewMode === 'tv' || savedViewMode === 'screen') {
      document.body.classList.toggle('screen-fill', savedViewMode === 'screen');
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(true);
    }
    syncFullscreenButtonState();
  } catch (error) {
    setStatus('SAVED VIEW COULD NOT BE RESTORED');
    console.error('Saved view mode could not be restored', error);
  }
}
// Remote and ⌘F cycle: window → picture filling the screen → whole TV filling the screen → TV in its window with the rest
// of the desktop dimmed → virtual room → window. Fullscreen views use native window fullscreen (no user gesture needed) and the
// screen-only step just lets the picture fill it, so stepping between them is instant.
let fullscreenTransition = false;
async function enterSceneFullscreen() {
  document.body.classList.remove('screen-fill');
  if (document.fullscreenElement) await document.exitFullscreen();
  if (backdropDim) await setBackdropDim(false);
  nativeWindowFullscreen = await window.tube.setWindowFullscreen(true);
  try { await window.SaturdayScenes.enter(); }
  catch (error) {
    nativeWindowFullscreen = await window.tube.setWindowFullscreen(false);
    throw error;
  }
}
async function changeRoom() {
  if (fullscreenTransition) return;
  fullscreenTransition = true;
  try {
    if (window.SaturdayScenes.active) await window.SaturdayScenes.next();
    else await enterSceneFullscreen();
    syncFullscreenButtonState();
  } catch (error) {
    setStatus('ROOM NOT AVAILABLE');
    console.error('Remote room selection failed', error);
  } finally { fullscreenTransition = false; }
}
async function cycleFullscreen() {
  if (fullscreenTransition) return;
  fullscreenTransition = true;
  try {
    const mode = fullscreenMode();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (mode === 'off') {
      document.body.classList.add('screen-fill');
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(true);
    } else if (mode === 'screen') {
      document.body.classList.remove('screen-fill');
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(true);
    } else if (mode === 'tv') {
      document.body.classList.remove('screen-fill');
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(false);
      // Main shows the sheet once the window has finished leaving fullscreen.
      await setBackdropDim(true);
    } else if (mode === 'dim') {
      document.body.classList.remove('screen-fill');
      await setBackdropDim(false);
      await enterSceneFullscreen();
    } else {
      window.SaturdayScenes.exit();
      nativeWindowFullscreen = await window.tube.setWindowFullscreen(false);
    }
  } catch (error) { setStatus('FULLSCREEN NOT AVAILABLE'); console.error(error); }
  finally { fullscreenTransition = false; }
  canvas.width = 0;
  canvas.height = 0;
  syncFullscreenButtonState();
}
async function exitFullscreenModes() {
  try {
    document.body.classList.remove('screen-fill');
    window.SaturdayScenes.exit();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (nativeWindowFullscreen) nativeWindowFullscreen = await window.tube.setWindowFullscreen(false);
    if (backdropDim) await setBackdropDim(false);
  } catch (error) { console.error(error); }
  canvas.width = 0;
  canvas.height = 0;
  syncFullscreenButtonState();
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
  if (selectedInput === 'tv') {
    if (activeYoutubeStarter()) window.SaturdayTubeYouTubePlayer?.togglePlayback();
    return;
  }
  if (selectedInput === 'static') {
    const resume = resumeVideoAfterStatic;
    setInputSource('video');
    if (!resume && hasVideo && video.paused) startVideoPlayback().catch(() => {});
    return;
  }
  video.paused ? startVideoPlayback().catch(() => {}) : video.pause();
});
document.querySelector('#previousButton').addEventListener('click', () => {
  if (selectedInput === 'tv') {
    if (activeYoutubeStarter()) window.SaturdayTubeYouTubePlayer?.previous();
    return;
  }
  if (video.currentTime > 3) video.currentTime = 0;
  else stepTrack(-1);
});
document.querySelector('#nextButton').addEventListener('click', () => {
  if (selectedInput === 'tv') {
    if (activeYoutubeStarter()) window.SaturdayTubeYouTubePlayer?.next();
    return;
  }
  stepTrack(1);
});
video.addEventListener('play', () => {
  if (window.SaturdayIntermission?.active) { video.pause(); return; }
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
    channelStableSince = performance.now();
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
  channelStableSince = 0;
  if (isCurrentChannelPlayback()) setTVSearching(true, TV_SEARCHING_GRACE_MS);
});
video.addEventListener('pause', () => {
  if (!isCurrentPlaybackEvent()) return;
  if (!switchingTracks) savePlaybackSession();
  lastCompositePaused = null;
  playButton.textContent = '▶ PLAY';
  applyAudioEffect(false);
  if (hasVideo && !video.ended && !shuttingOff) { setStatus('PAUSED'); document.querySelector('#deckState').textContent = 'PAUSED'; }
});
window.setInterval(() => {
  if (selectedInput === 'tv') void syncActiveBroadcast(false);
}, 500);
// The break fade also rides the picture loop, but animation frames stop while the window is minimised or covered; this keeps
// the fade (which sets the volume) and the break cut moving so sound can never be left faded out.
window.setInterval(updateChannelBreakFade, 100);
// Audio watchdog: sound has to survive a suspended or sleeping output device, a stalled audio clock and files whose audio
// Chromium silently cannot decode. Each check only acts when something is actually wrong.
const AUDIO_WATCHDOG_MS = 1000;
const AUDIO_SILENT_DECODE_TICKS = 4;
const audioWatchdog = { contextTime: -1, stalledTicks: 0, decodeUrl: '', silentTicks: 0, decodeOk: false };
function audioPlaybackExpected() {
  return hasVideo && !video.paused && !video.ended && !video.seeking && video.readyState >= 3 && !shuttingOff && !switchingTracks
    && (selectedInput === 'tv' || selectedInput === 'video');
}
function checkPlaybackAudio() {
  if (!audioPlaybackExpected()) {
    audioWatchdog.contextTime = -1;
    audioWatchdog.stalledTicks = 0;
    return;
  }
  // Volume and mute live on the dial and masterGain; the element itself must always be unmuted at full level.
  if (video.muted || video.defaultMuted || (masterGain && video.volume !== 1)) setMasterVolume();
  if (levelerGain && !Number.isFinite(levelerGain.gain.value)) {
    levelerGain.gain.cancelScheduledValues(0);
    levelerGain.gain.value = 1;
    levelerPower = null;
  }
  if (masterGain && !Number.isFinite(masterGain.gain.value)) {
    masterGain.gain.cancelScheduledValues(0);
    setMasterVolume();
  }
  if (audioContext) {
    if (audioContext.state !== 'running') {
      audioWatchdog.contextTime = -1;
      audioContext.resume().catch(error => console.warn('Audio watchdog could not resume playback audio', error));
    } else {
      const now = audioContext.currentTime;
      audioWatchdog.stalledTicks = audioWatchdog.contextTime >= 0 && now - audioWatchdog.contextTime < 0.2 ? audioWatchdog.stalledTicks + 1 : 0;
      audioWatchdog.contextTime = now;
      // A frozen audio clock means the output device stopped taking sound: re-route, then fall back to the system default.
      if (audioWatchdog.stalledTicks === 3) {
        console.warn('Playback audio clock stalled; re-routing the output device');
        void setAudioOutputDevice(activeAudioOutputId, false, false);
      } else if (audioWatchdog.stalledTicks === 6) {
        console.warn('Playback audio still stalled; using the system default output');
        void setAudioOutputDevice('default', false, false).then(() => setStatus('AUDIO OUTPUT RESET · SYSTEM DEFAULT'));
      } else if (audioWatchdog.stalledTicks >= 9) {
        audioWatchdog.stalledTicks = 0;
        audioContext.suspend().then(() => audioContext.resume()).catch(error => console.warn('Playback audio restart failed', error));
      }
    }
  }
  const decoded = video.webkitAudioDecodedByteCount;
  if (typeof decoded !== 'number') return;
  if (audioWatchdog.decodeUrl !== activePlaybackUrl) {
    audioWatchdog.decodeUrl = activePlaybackUrl;
    audioWatchdog.silentTicks = 0;
    audioWatchdog.decodeOk = false;
  }
  if (audioWatchdog.decodeOk) return;
  if (decoded > 0) {
    audioWatchdog.decodeOk = true;
    return;
  }
  if (!(video.webkitVideoDecodedByteCount > 0)) return;
  const track = activePlaylist()?.tracks?.[currentIndex];
  if (!track?.path || mediaWithoutAudio.has(track.path) || channelAudioCompatibilityJobs.has(track.path)) return;
  audioWatchdog.silentTicks += 1;
  // Picture decoding but not one byte of sound for several seconds: the file's audio is unplayable here, so convert it.
  if (audioWatchdog.silentTicks >= AUDIO_SILENT_DECODE_TICKS) {
    audioWatchdog.decodeOk = true;
    repairPlaybackAudio(track);
  }
}
window.setInterval(checkPlaybackAudio, AUDIO_WATCHDOG_MS);
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
    const playing = channel.queue?.[currentIndex];
    if (livePlayback && playing?.path === activePlaybackPath) {
      // A live conversion that stopped early (a read error, a damaged stretch) picks up again rather than skipping the rest.
      const end = Math.min((Number(playing.sourceStartSeconds) || 0) + (Number(playing.durationSeconds) || 0),
        Number(playing.mediaDurationSeconds) || Infinity);
      if (playbackSourceTime() < end - 3 && restartChannelPlaybackLive({ forceEncode: livePlayback.mode !== 'encode' })) return;
    }
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
// A file can sit at "no data" forever without raising an error (Chromium waiting on a damaged header), so a channel load
// that has read nothing after 15 seconds is treated as a failure: first the converted copy, then a skip.
function watchChannelLoad(generation) {
  if (selectedInput !== 'tv' || !activePlaybackChannelId) return;
  const url = activePlaybackUrl;
  window.setTimeout(() => {
    if (generation !== playbackGeneration || activePlaybackUrl !== url || !isCurrentChannelPlayback()) return;
    if (video.readyState >= 2 || video.error) return;
    console.warn(`Channel media produced no picture in ${CHANNEL_LOAD_STALL_MS / 1000} s: ${activePlaybackPath}`);
    handlePlaybackFailure();
  }, CHANNEL_LOAD_STALL_MS);
}
function handlePlaybackFailure() {
  if (!isCurrentPlaybackEvent()) return;
  switchingTracks = false;
  if (!hasVideo) return;
  const stopSearchingAfterFailure = () => { if (selectedInput === 'tv') setTVSearching(false); };
  if (selectedInput === 'tv' && isCurrentChannelPlayback()) {
    recordChannelTuneMetric(livePlayback ? 'live-error' : 'source-error');
    const encodeNext = Boolean(livePlayback) && livePlayback.mode !== 'encode';
    if ((!livePlayback || encodeNext) && restartChannelPlaybackLive({ forceEncode: encodeNext })) return;
    if (failCurrentChannelSegment()) return;
    setStatus('VIDEO COULD NOT PLAY');
    stopSearchingAfterFailure();
    return;
  }
  if (fallbackAttempted) {
    if (selectedInput === 'tv') recordChannelTuneMetric('transcode-error');
    if (failCurrentChannelSegment()) return;
    const nativeError = video.error;
    setStatus(nativeError?.code === 4 ? 'UNSUPPORTED OR DAMAGED VIDEO' : 'VIDEO COULD NOT PLAY');
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    stopSearchingAfterFailure();
    return;
  }
  const list = activePlaylist();
  const track = list?.tracks[currentIndex];
  if (!track?.id || !window.tube.transcodeMedia) {
    if (failCurrentChannelSegment()) return;
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
    watchChannelLoad(generation);
  }).catch(error => {
    if (generation !== playbackGeneration) return;
    console.error('Video compatibility conversion failed', error);
    if (selectedInput === 'tv') recordChannelTuneMetric('transcode-error');
    if (failCurrentChannelSegment()) return;
    setStatus(String(error?.message || 'VIDEO COULD NOT PLAY').slice(0, 70));
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    stopSearchingAfterFailure();
  });
}
video.addEventListener('error', handlePlaybackFailure);

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
    if (!livePlayback) {
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : restore.currentTime;
      video.currentTime = Math.min(restore.currentTime, end);
    }
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
  if (mutedVolume !== null && dialValue(videoDial) > 0) { mutedVolume = null; syncMuteOverlay(); }
  showVolumeOverlay();
  // Only the Web Audio path can amplify past 100%; turning the dial is a user gesture, so it may start it.
  if (!audioContext && hasVideo && dialVolumeGain() > 1) ensureAudioGraph();
  setMasterVolume();
  saveControlPreferences();
});
for (const dial of pictureDials) bindRotaryDial(dial, saveControlPreferences);
bindRotaryDial(fxAmountDial, () => applyAudioEffect());
setupSettingsOverlays();
primeSoundEffects();
setFinish(currentFinish, false);
setCabinetSkin(cabinetSkin, false);
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
  setStatus('SAT INPUT UNAVAILABLE');
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
for (const dial of allDials) updateDial(dial);
setMasterVolume();
audioEffectSelect.addEventListener('change', () => setAudioEffect(audioEffectSelect.value));
finishButtons.forEach(button => button.addEventListener('click', () => setFinish(button.dataset.finish)));
inputButton.addEventListener('click', () => {
  const next = { video: 'static', static: 'tv', tv: 'aux', aux: 'video' }[selectedInput] || 'video';
  setInputSource(next);
});
auxLoadButton.addEventListener('click', () => { auxRomFile.value = ''; auxRomFile.click(); });
auxRomFile.addEventListener('change', async () => {
  const file = auxRomFile.files?.[0];
  if (!file) return;
  auxLoadButton.disabled = true;
  auxLoadButton.textContent = 'LOADING GAME…';
  try {
    const game = await window.SaturdayGenesisAux.loadFile(file);
    auxLoadButton.textContent = `LOAD ${game.title.toUpperCase()}…`;
    titleEl.textContent = game.title;
    setStatus(`GENESIS AUX LOADED · ${game.title}`);
    reportRemoteState();
  } catch (error) {
    auxLoadButton.textContent = 'LOAD GENESIS GAME…';
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    auxLoadButton.disabled = false;
    auxRomFile.value = '';
  }
});
channelDownButton.addEventListener('click', () => cycleActiveChannel(-1));
channelUpButton.addEventListener('click', () => cycleActiveChannel(1));
document.querySelector('#volumeDownButton').addEventListener('click', () => adjustMasterVolume(-1));
document.querySelector('#volumeUpButton').addEventListener('click', () => adjustMasterVolume(1));
cabinetSkinSelect.addEventListener('change', () => setCabinetSkin(cabinetSkinSelect.value));
addChannelButton.addEventListener('click', () => { void addChannelFolder(); });
chooseChannelSourceButton.addEventListener('click', () => { void chooseChannelSource(); });
document.querySelector('#tvGuideClose').addEventListener('click', () => tvGuideDialog.close());
tvGuideDialog.addEventListener('close', stopTVGuideRefresh);
document.querySelector('#tvGuidePrevious').addEventListener('click', () => { const count = tvGuideLineup().length; if (count) { tvGuidePageIndex = (tvGuidePageIndex - 1 + count) % count; renderTVGuide(); } });
document.querySelector('#tvGuideNext').addEventListener('click', () => { const count = tvGuideLineup().length; if (count) { tvGuidePageIndex = (tvGuidePageIndex + 1) % count; renderTVGuide(); } });
document.querySelector('#tvGuideAdd').addEventListener('click', () => { stopTVGuideRefresh(); tvGuideDialog.close(); void addChannelFolder().then(openTVGuide); });
document.querySelector('#tvGuideShuffle').addEventListener('click', () => { void shuffleAllChannels(); });
document.querySelector('#tvSettingsButton').addEventListener('click', () => { selectSettingsTab('video'); showScreenDialog(tvSettingsDialog); });
document.querySelector('#tvSettingsClose').addEventListener('click', () => tvSettingsDialog.close());
document.querySelector('#tvSettingsCloseFooter').addEventListener('click', () => tvSettingsDialog.close());
document.querySelector('#audioRcaButton').addEventListener('click', () => { selectSettingsTab('audio'); showScreenDialog(tvSettingsDialog); });
for (const button of document.querySelectorAll('[data-settings-tab]')) button.addEventListener('click', () => selectSettingsTab(button.dataset.settingsTab));
window.addEventListener('resize', () => { updateInterfaceScale(); for (const dialog of [tvGuideDialog, tvSettingsDialog]) setScreenDialogBounds(dialog); });
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
document.querySelector('#screenOnlyButton').addEventListener('click', async () => {
  window.SaturdayScenes.exit();
  if (backdropDim) await setBackdropDim(false);
  await toggleFullscreen(stage);
});
document.querySelector('#dimRoomButton').addEventListener('click', async () => {
  const enable = fullscreenMode() !== 'dim';
  if (enable) {
    window.SaturdayScenes.exit();
    document.body.classList.remove('screen-fill');
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (nativeWindowFullscreen) nativeWindowFullscreen = await window.tube.setWindowFullscreen(false).catch(() => nativeWindowFullscreen);
  }
  await setBackdropDim(enable);
  syncFullscreenButtonState();
});
async function toggleSceneMode() {
  if (fullscreenTransition) return;
  fullscreenTransition = true;
  try {
    if (window.SaturdayScenes.active) await exitFullscreenModes();
    else {
      tvSettingsDialog.close();
      await enterSceneFullscreen();
    }
  } catch (error) { setStatus('SCENE NOT AVAILABLE'); console.error(error); }
  finally { fullscreenTransition = false; syncFullscreenButtonState(); }
}
document.querySelector('#sceneModeButton').addEventListener('click', toggleSceneMode);
document.querySelector('#sceneEnter').addEventListener('click', toggleSceneMode);
window.addEventListener('scene-open-settings', () => {
  selectSettingsTab('scenes');
  showScreenDialog(tvSettingsDialog);
});
window.addEventListener('scene-layout-change', () => {
  setScreenDialogBounds(tvSettingsDialog);
  setScreenDialogBounds(tvGuideDialog);
});
window.addEventListener('scene-image-error', () => setStatus('ROOM IMAGE UNAVAILABLE · SELECT ANOTHER SCENE'));
window.tube.onFullscreenCycleRequest?.(() => { void cycleFullscreen(); });
window.tube.onPictureVisibilityChange?.(visible => {
  pictureVisible = visible;
  if (visible) { lastPictureFrame = -Infinity; scheduleFrameLoop(); }
  else pauseFrameLoop();
});
document.querySelector('#tvFullscreenButton').addEventListener('click', () => toggleNativeWindowFullscreen());
document.addEventListener('fullscreenchange', () => {
  syncFullscreenButtonState();
  canvas.width = 0;
  canvas.height = 0;
});
let channelBreakRefreshTimer = null;
window.tube.onChannelBreaksResolved?.(() => {
  if (channelBreakRefreshTimer) return;
  channelBreakRefreshTimer = window.setTimeout(() => {
    channelBreakRefreshTimer = null;
    for (const channel of channels) void refineChannelBreaks(channel);
  }, 1500);
});
// Cuts move into the look-ahead window as the broadcasts advance.
window.setInterval(() => {
  for (const channel of channels) void refineChannelBreaks(channel);
}, 10 * 60 * 1000);
window.tube.onChannelCommercialsUpdated(commercialsRoot => {
  // Freshly split reels join each channel's ad rotation from the next break; playback position is reconciled, not reset.
  for (const channel of channels) {
    if (!channel.commercialsRoot || channel.commercialsRoot !== commercialsRoot || !channel.scanComplete || channel.scanning) continue;
    void scanChannel(channel);
  }
});
window.tube.onWindowFullscreenChange(isFullscreen => {
  nativeWindowFullscreen = isFullscreen;
  if (!isFullscreen) {
    document.body.classList.remove('screen-fill');
    window.SaturdayScenes.exit();
  }
  syncFullscreenButtonState();
  canvas.width = 0;
  canvas.height = 0;
});
window.tube.getWindowFullscreen().then(isFullscreen => {
  nativeWindowFullscreen = Boolean(isFullscreen);
  return restoreViewMode();
}).catch(error => console.warn('Could not read fullscreen state', error));
pictureBypassToggle.addEventListener('click', () => {
  pictureFiltersEnabled = !pictureFiltersEnabled;
  syncBypassControls();
  saveControlPreferences();
});
tvLevelerToggle.addEventListener('click', () => {
  tvLevelerEnabled = !tvLevelerEnabled;
  syncBypassControls();
  saveControlPreferences();
});
video.addEventListener('loadstart', () => { levelerFastUntil = performance.now() + 2500; });
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
  if (event.key === 'Enter' && tvGuideDialog.open) {
    event.preventDefault();
    tuneGuideChannel();
    return;
  }
  // Esc closes an open menu first (the dialog handles that); otherwise it leaves either fullscreen mode.
  if (event.key === 'Escape' && fullscreenMode() !== 'off' && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    void exitFullscreenModes();
    return;
  }
  if (event.target.matches('input,select,button')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); openLibrary(); }
  else if (event.code === 'Space' && selectedInput === 'tv') event.preventDefault();
  else if (event.code === 'Space' && hasVideo) { event.preventDefault(); video.paused ? startVideoPlayback().catch(() => {}) : video.pause(); }
  else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selectedInput === 'tv') event.preventDefault();
  else if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  else if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
});
// Phone remote: every button maps onto the same cabinet controls a mouse would use.
const REMOTE_DIGIT_TIMEOUT_MS = 3000;
const remoteEnableToggle = document.querySelector('#remoteEnableToggle');
let remoteGamepadReleaseTimer = null;
function acceptRemoteGamepad(value) {
  if (selectedInput !== 'aux') return;
  window.clearTimeout(remoteGamepadReleaseTimer);
  window.SaturdayGenesisAux?.setPhoneInput(Array.isArray(value?.buttons) ? value.buttons : [], value?.axes || {});
  remoteGamepadReleaseTimer = window.setTimeout(() => window.SaturdayGenesisAux?.clearPhoneInput(), 1400);
}
const remoteDialogStack = [];
let remoteEnabled = false;
let remoteDigits = '';
let remoteDigitTimer = null;
let remoteLastState = '';
function channelDialNumber(channel) {
  const numbered = channelFolderOrder(channel?.root);
  return Number.isFinite(numbered) ? numbered : channels.indexOf(channel) + 1;
}
function youtubeStarterDialNumber(starterId) {
  const starters = configuredYoutubeStarters();
  const index = starters.findIndex(item => item.id === starterId);
  const highestLocalNumber = Math.max(0, ...channels.map(channelDialNumber));
  return index < 0 ? null : highestLocalNumber + index + 1;
}
function tuneChannelNumber(number) {
  const channel = channels.find(item => channelDialNumber(item) === number && item.enabled !== false && !item.error);
  if (channel) {
    selectActiveChannel(channel.id);
    if (selectedInput !== 'tv') setInputSource('tv');
    return;
  }
  const starter = configuredYoutubeStarters().find(item => youtubeStarterDialNumber(item.id) === number);
  if (starter) {
    selectYoutubeStarter(starter.id);
    if (selectedInput !== 'tv') setInputSource('tv');
    return;
  }
  showChannelSurfText(`CH ${number} --`, 1200);
}
function commitRemoteDigits() {
  window.clearTimeout(remoteDigitTimer);
  remoteDigitTimer = null;
  const digits = remoteDigits;
  remoteDigits = '';
  if (digits) tuneChannelNumber(Number(digits));
}
function enterRemoteDigit(digit) {
  if (!channelsStartupReady) return;
  remoteDigits = `${remoteDigits}${digit}`;
  window.clearTimeout(remoteDigitTimer);
  // As on a cable box: one digit waits for a second (or ENT); a full-width entry such as 0-9 or 1-2 tunes at once.
  const width = Math.max(2, String(Math.max(0, ...channels.map(channelDialNumber))).length);
  if (remoteDigits.length >= width) {
    showChannelSurfText(remoteDigits.padStart(width, '0'), 900);
    commitRemoteDigits();
    return;
  }
  showChannelSurfText(`${remoteDigits}${'-'.repeat(width - remoteDigits.length)}`, REMOTE_DIGIT_TIMEOUT_MS + 300);
  remoteDigitTimer = window.setTimeout(commitRemoteDigits, REMOTE_DIGIT_TIMEOUT_MS);
}
function remoteScope() {
  for (let index = remoteDialogStack.length - 1; index >= 0; index -= 1) {
    if (remoteDialogStack[index].open) return remoteDialogStack[index];
  }
  return [...document.querySelectorAll('dialog[open]')].at(-1) || null;
}
function remoteFocusable(scope) {
  return [...scope.querySelectorAll('button, select, input:not([type="hidden"]), textarea, [role="slider"], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.disabled && !element.closest('[hidden], [inert]') && element.getClientRects().length
      && getComputedStyle(element).visibility !== 'hidden');
}
let lastRemoteFocusRect = null;
function setRemoteFocus(element) {
  document.querySelectorAll('.remote-focus').forEach(item => item.classList.remove('remote-focus'));
  if (!element) return;
  lastRemoteFocusRect = element.getBoundingClientRect();
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  element.classList.add('remote-focus');
}
function remoteAdjust(element, direction) {
  if (element.classList.contains('dial') || element.getAttribute('role') === 'slider') {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: direction > 0 ? 'ArrowRight' : 'ArrowLeft', bubbles: true, cancelable: true }));
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    const next = element.selectedIndex + direction;
    if (next < 0 || next >= element.options.length) return false;
    element.selectedIndex = next;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLInputElement && (element.type === 'range' || element.type === 'number')) {
    if (direction > 0) element.stepUp(); else element.stepDown();
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}
function remoteNearest(current, items, direction) {
  const from = current.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  let best = null;
  let bestScore = Infinity;
  for (const element of items) {
    if (element === current) continue;
    const rect = element.getBoundingClientRect();
    const gap = { right: rect.left - from.right, left: from.left - rect.right, down: rect.top - from.bottom, up: from.top - rect.bottom }[direction];
    const centreShift = { right: rect.left + rect.width / 2 - (from.left + from.width / 2), left: from.left + from.width / 2 - (rect.left + rect.width / 2),
      down: rect.top + rect.height / 2 - (from.top + from.height / 2), up: from.top + from.height / 2 - (rect.top + rect.height / 2) }[direction];
    if (centreShift <= 1) continue;
    const overlaps = horizontal ? rect.top < from.bottom && rect.bottom > from.top : rect.left < from.right && rect.right > from.left;
    const drift = overlaps ? 0 : horizontal
      ? Math.min(Math.abs(rect.top - from.bottom), Math.abs(from.top - rect.bottom))
      : Math.min(Math.abs(rect.left - from.right), Math.abs(from.left - rect.right));
    const score = Math.max(0, gap) + drift * 2.5;
    if (score < bestScore) { best = element; bestScore = score; }
  }
  return best;
}
function remoteArrow(direction) {
  const scope = remoteScope();
  if (!scope) {
    if (selectedInput === 'tv') {
      if (direction === 'up' || direction === 'down') cycleActiveChannel(direction === 'up' ? 1 : -1);
      else adjustMasterVolume(direction === 'right' ? 1 : -1);
    } else if (direction === 'left' || direction === 'right') remoteSeek(direction === 'right' ? 10 : -10);
    else adjustMasterVolume(direction === 'up' ? 1 : -1);
    return;
  }
  const items = remoteFocusable(scope);
  if (!items.length) return;
  const current = items.includes(document.activeElement) ? document.activeElement : null;
  if (!current) {
    // A re-render (e.g. the guide after a checkbox or page change) can drop focus; resume beside where it was.
    const near = lastRemoteFocusRect && remoteClosestTo(lastRemoteFocusRect, items);
    setRemoteFocus(near || items[0]);
    return;
  }
  if ((direction === 'left' || direction === 'right') && remoteAdjust(current, direction === 'right' ? 1 : -1)) return;
  const next = remoteNearest(current, items, direction);
  if (next) setRemoteFocus(next);
}
function remoteClosestTo(rect, items) {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  let best = null;
  let bestDistance = Infinity;
  for (const element of items) {
    const box = element.getBoundingClientRect();
    const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
    if (distance < bestDistance) { best = element; bestDistance = distance; }
  }
  return best;
}
// PAGE ◀ / ▶ on the phone remote: guide pages, settings tabs, a screenful of the tape shelf.
function remotePage(direction) {
  const scope = remoteScope();
  if (scope === tvGuideDialog) {
    document.querySelector(direction > 0 ? '#tvGuideNext' : '#tvGuidePrevious')?.click();
    return;
  }
  if (scope === tvSettingsDialog) {
    const tabs = [...tvSettingsDialog.querySelectorAll('[data-settings-tab]')].filter(tab => !tab.hidden && tab.getClientRects().length);
    if (!tabs.length) return;
    const index = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-current') === 'page'));
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    next.click();
    setRemoteFocus(next);
    return;
  }
  if (scope === libraryDialog) {
    const scroller = [...libraryDialog.querySelectorAll('*')].find(element => element.scrollHeight > element.clientHeight + 4
      && /auto|scroll/.test(getComputedStyle(element).overflowY));
    scroller?.scrollBy({ top: direction * scroller.clientHeight * 0.85, behavior: 'smooth' });
    return;
  }
  if (!scope && selectedInput === 'tv') cycleActiveChannel(direction);
}
function remoteSeek(seconds) {
  if (selectedInput === 'tv' && activeYoutubeStarter()) {
    window.SaturdayTubeYouTubePlayer?.seekBy(seconds);
    return;
  }
  if (selectedInput !== 'video' || !hasVideo) return;
  video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
}
function remoteOk() {
  if (remoteDigits) { commitRemoteDigits(); return; }
  const scope = remoteScope();
  if (!scope) {
    if (selectedInput === 'tv' && activeYoutubeStarter()) window.SaturdayTubeYouTubePlayer?.togglePlayback();
    else if (selectedInput === 'tv') showChannelSurfText(activeYoutubeStarter()?.name || activeChannel()?.name || 'NO CHANNEL');
    else playButton.click();
    return;
  }
  const element = remoteFocusable(scope).includes(document.activeElement) ? document.activeElement : null;
  if (!element) { remoteArrow('down'); return; }
  if (element instanceof HTMLSelectElement) {
    element.selectedIndex = (element.selectedIndex + 1) % Math.max(1, element.options.length);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (!(element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'radio') && !(element instanceof HTMLTextAreaElement)) {
    element.click();
  }
}
function remoteBack() {
  if (remoteDigits) {
    window.clearTimeout(remoteDigitTimer);
    remoteDigits = '';
    showChannelSurfText('--', 500);
    return;
  }
  const scope = remoteScope();
  if (!scope) return;
  if (scope === libraryDialog && libraryView && libraryView.current !== libraryView.root && !libraryUpButton.disabled) {
    libraryUpButton.click();
    return;
  }
  scope.close();
}
function remoteToggleSelectedTape() {
  if (!libraryDialog.open) return;
  const card = document.activeElement?.closest?.('.library-tape[data-tape-path]');
  const play = card?.querySelector('.library-tape-play');
  play?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
}
function waitForTVInput(timeoutMs = 3000) {
  const startedAt = performance.now();
  return new Promise(resolve => {
    const check = () => {
      if (selectedInput === 'tv' && tvSet.dataset.input === 'tv') resolve(true);
      else if (performance.now() - startedAt > timeoutMs) resolve(false);
      else window.setTimeout(check, 80);
    };
    check();
  });
}
async function remoteGuide() {
  if (tvGuideDialog.open) { tvGuideDialog.close(); return; }
  if (selectedInput !== 'tv') setInputSource('tv');
  if (await waitForTVInput()) openTVGuide();
}
function handleRemoteCommand(command) {
  if (command?.action === 'gamepad') {
    if (window.SaturdayIntermission?.active) {
      window.clearTimeout(remoteGamepadReleaseTimer);
      window.SaturdayGenesisAux?.clearPhoneInput();
      return;
    }
    acceptRemoteGamepad(command.value);
    return;
  }
  if (command?.action === 'trackpad') {
    showTrackpadCursor(command.value);
    if (command.value.type === 'zoom' && !window.SaturdayIntermission?.active) window.SaturdayScenes?.zoomBy(command.value.factor);
    return;
  }
  if (window.SaturdayIntermission?.active) {
    if (['enter', 'ok', 'back'].includes(command?.action)) void window.SaturdayIntermission.end();
    return;
  }
  const action = command?.action;
  if (action !== 'digit' && action !== 'enter' && action !== 'ok' && action !== 'back' && remoteDigits) commitRemoteDigits();
  switch (action) {
    case 'digit': enterRemoteDigit(command.value); break;
    case 'enter': if (tvGuideDialog.open) tuneGuideChannel(); else if (remoteDigits) commitRemoteDigits(); else remoteOk(); break;
    case 'ch-up': cycleActiveChannel(1); break;
    case 'ch-down': cycleActiveChannel(-1); break;
    case 'ch-last': {
      if (previousChannelId?.startsWith('youtube:')) selectYoutubeStarter(previousChannelId.slice('youtube:'.length));
      else {
        const id = previousChannelId?.replace(/^local:/, '');
        if (id && channels.some(item => item.id === id)) {
          selectActiveChannel(id);
          if (selectedInput !== 'tv') setInputSource('tv');
        }
      }
      break;
    }
    // The phone remote steps one notch at a time; holding the key repeats.
    case 'vol-up': adjustMasterVolume(1, 1); break;
    case 'vol-down': adjustMasterVolume(-1, 1); break;
    case 'mute': toggleMute(); break;
    case 'play': if (!playButton.disabled) playButton.click(); break;
    case 'rew': remoteSeek(-10); break;
    case 'ff': remoteSeek(10); break;
    case 'prev': case 'next': {
      const button = document.querySelector(action === 'prev' ? '#previousButton' : '#nextButton');
      if (button && !button.disabled) button.click();
      break;
    }
    case 'track-up': adjustTracking(1); break;
    case 'track-down': adjustTracking(-1); break;
    case 'input-tv': setInputSource('tv'); break;
    case 'input-vcr': setInputSource('video'); break;
    case 'input-cycle': inputButton.click(); break;
    case 'fullscreen': void cycleFullscreen(); break;
    case 'scene-next': void changeRoom(); break;
    case 'up': case 'down': case 'left': case 'right': remoteArrow(action); break;
    case 'page-prev': remotePage(-1); break;
    case 'page-next': remotePage(1); break;
    case 'ok': remoteOk(); break;
    case 'back': remoteBack(); break;
    case 'menu':
      if (tvSettingsDialog.open) tvSettingsDialog.close();
      else { selectSettingsTab('video'); showScreenDialog(tvSettingsDialog); }
      break;
    case 'guide': void remoteGuide(); break;
    case 'shelf': if (libraryDialog.open) libraryDialog.close(); else void openLibrary(); break;
    case 'info': if (selectedInput === 'tv') showChannelSurfText(activeYoutubeStarter()?.name || (activeChannel() ? `${channelSurfAbbreviation(activeChannel())} ${channelDialNumber(activeChannel())}` : 'NO CHANNEL')); else setStatus(activePlaylist()?.tracks?.[currentIndex]?.title || 'NO TAPE'); break;
    case 'add': remoteToggleSelectedTape(); break;
    case 'queue': if (libraryDialog.open && !libraryAddButton.disabled) libraryAddButton.click(); break;
    case 'video-fx': pictureBypassToggle.click(); break;
    case 'audio-fx': audioBypassToggle.click(); break;
    case 'screen-type': setRemotePanelControl('display-mode', displayMode === 'rear' ? 'crt' : 'rear'); break;
    case 'color-filter': {
      const modes = ['color', 'lowstim', 'bw'];
      setRemotePanelControl('picture-mode', modes[(modes.indexOf(selectedPictureMode) + 1) % modes.length]);
      break;
    }
    case 'skin-random': setCabinetTint(randomCabinetTint()); break;
    case 'set': setRemotePanelControl(command.value?.id, command.value?.value); break;
    default: return;
  }
  window.setTimeout(reportRemoteState, 60);
}
function remoteFocusLabel() {
  const scope = remoteScope();
  const element = scope && scope.contains(document.activeElement) ? document.activeElement : null;
  if (!element) return '';
  const tape = element.closest('.library-tape[data-tape-path]');
  const label = tape
    ? tape.dataset.tapePath.split('/').pop().replace(/\.[^.]+$/, '')
    : element.getAttribute('aria-label') || element.textContent || element.value || '';
  return label.replace(/\s+/g, ' ').trim().slice(0, 48);
}
// A random but tasteful cabinet colour: any hue, moderate saturation, never too dark or washed out.
function randomCabinetTint() {
  const hue = Math.random() * 360;
  const saturation = 0.35 + Math.random() * 0.45;
  const lightness = 0.32 + Math.random() * 0.3;
  const channel = n => {
    const k = (n + hue / 30) % 12;
    const value = lightness - saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
// The controls on the back of the phone remote. Each one drives the same TV setting as the settings menu, through the
// same element and event, so changes apply and save exactly as they would from the menu.
const remoteDial = (id, label, group, dial) => ({ id, label, group, kind: 'knob', dial });
const remoteInput = (id, label, group, selector, extra = {}) => ({ id, label, group, selector, ...extra });
const remoteToggle = (id, label, group, get, toggle) => ({ id, label, group, kind: 'switch', get, toggle });
const REMOTE_PANEL_CONTROLS = [
  remoteToggle('picture-fx', 'PICTURE FX', 'video', () => pictureFiltersEnabled, () => pictureBypassToggle.click()),
  remoteInput('picture-mode', 'COLOR', 'video', '#pictureMode', { kind: 'selector' }),
  remoteInput('display-mode', 'SCREEN', 'video', '#displayMode', { kind: 'selector' }),
  remoteDial('scanlines', 'SCANLINES', 'video', scanlineDial),
  remoteDial('curve', 'CURVE', 'video', curveDial),
  remoteDial('edge-blur', 'EDGE BLUR', 'video', edgeBlurDial),
  remoteDial('hue', 'HUE', 'video', hueDial),
  remoteDial('vhs-scan', 'TRACKING', 'video', vhsScanDial),
  remoteDial('glitch', 'GLITCH', 'video', glitchDial),
  remoteDial('broken-tape', 'BROKEN TAPE', 'video', brokenTapeDial),
  remoteDial('glow', 'GLOW', 'video', glowDial),
  remoteDial('brightness', 'BRIGHTNESS', 'video', brightnessDial),
  remoteInput('cabinet-skin', 'CABINET', 'video', '#cabinetSkin', { kind: 'selector' }),
  remoteToggle('audio-fx', 'AUDIO FX', 'audio', () => audioFiltersEnabled, () => audioBypassToggle.click()),
  remoteInput('audio-effect', 'EFFECT', 'audio', '#audioEffectSelect', { kind: 'selector' }),
  remoteDial('fx-amount', 'FX MIX', 'audio', fxAmountDial),
  remoteToggle('tv-leveler', 'LEVELER', 'audio', () => tvLevelerEnabled, () => tvLevelerToggle.click()),
  remoteToggle('sound-fx', 'CLICKS', 'audio', () => soundEffectsEnabled, () => soundEffectsToggle.click()),
  remoteInput('sound-fx-volume', 'CLICK VOL', 'audio', '#soundEffectsVolume', { kind: 'knob', event: 'input' }),
  remoteInput('scene', 'ROOM', 'scene', '#sceneSelect', { kind: 'selector' }),
  remoteInput('scene-light', 'ROOM LIGHT', 'scene', '#sceneLight', { kind: 'knob', event: 'input' }),
  remoteInput('scene-zoom', 'ZOOM', 'scene', '#sceneZoom', { kind: 'knob', event: 'input', scale: 'log' }),
  remoteInput('scene-auto-zoom', 'AUTO ZOOM', 'scene', '#sceneAutoZoomEnabled', { kind: 'switch' }),
  remoteInput('scene-auto-zoom-mode', 'MOTION', 'scene', '#sceneAutoZoomMode', { kind: 'selector' }),
  remoteInput('scene-auto-zoom-rate', 'ZOOM SPEED', 'scene', '#sceneAutoZoomRate', { kind: 'knob', event: 'input' }),
  remoteInput('intermission', 'BREAKS', 'intermission', '#intermissionEnabled', { kind: 'switch' }),
  remoteInput('intermission-interval', 'EVERY (MIN)', 'intermission', '#intermissionInterval', { kind: 'knob', max: 240 }),
  remoteInput('intermission-duration', 'LENGTH (MIN)', 'intermission', '#intermissionDuration', { kind: 'knob', max: 60 }),
  { id: 'intermission-start', label: 'START BREAK', group: 'intermission', kind: 'button', press: () => document.querySelector('#intermissionStart')?.click() }
];
const remotePanelById = new Map(REMOTE_PANEL_CONTROLS.map(control => [control.id, control]));
function remotePanelElement(control) {
  return control.dial || (control.selector ? document.querySelector(control.selector) : null);
}
function remotePanelSnapshot() {
  const controls = [];
  for (const control of REMOTE_PANEL_CONTROLS) {
    const element = remotePanelElement(control);
    const item = { id: control.id, label: control.label, group: control.group, kind: control.kind };
    if (control.kind === 'button') { controls.push(item); continue; }
    if (control.get) item.value = control.get();
    else if (!element) continue;
    else if (control.dial) {
      Object.assign(item, { min: Number(element.getAttribute('aria-valuemin')), max: Number(element.getAttribute('aria-valuemax')), step: 1, value: dialValue(element) });
    } else if (element.type === 'checkbox') item.value = element.checked;
    else if (element.tagName === 'SELECT') {
      item.value = element.value;
      item.options = [...element.options].filter(option => !option.disabled).map(option => ({ value: option.value, label: option.textContent.trim().slice(0, 32) }));
    } else {
      const min = Number(element.min);
      Object.assign(item, { min, max: control.max ?? Number(element.max), step: Number(element.step) || 1, value: Number(element.value) });
      if (control.scale) item.scale = control.scale;
    }
    if (element?.disabled) item.disabled = true;
    controls.push(item);
  }
  return controls;
}
function setRemotePanelControl(id, value) {
  const control = typeof id === 'string' ? remotePanelById.get(id) : null;
  if (!control) return;
  if (control.kind === 'button') { control.press(); return; }
  if (control.toggle) {
    if (typeof value === 'boolean' && value !== control.get()) control.toggle();
    return;
  }
  const element = remotePanelElement(control);
  if (!element || element.disabled) return;
  if (control.dial) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const before = dialValue(element);
    setDialValue(element, value);
    if (dialValue(element) !== before) dialChangeHandlers.get(element)?.();
    return;
  }
  if (element.type === 'checkbox') {
    if (typeof value !== 'boolean' || element.checked === value) return;
    element.checked = value;
  } else if (element.tagName === 'SELECT') {
    if (![...element.options].some(option => option.value === value && !option.disabled) || element.value === value) return;
    element.value = value;
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const step = Number(element.step) || 1;
    const max = control.max ?? Number(element.max);
    const next = Math.max(Number(element.min), Math.min(max, Math.round(value / step) * step));
    if (Number(element.value) === next) return;
    element.value = String(Number(next.toFixed(4)));
  }
  element.dispatchEvent(new Event(control.event || 'change', { bubbles: true }));
}
function remoteStateSnapshot() {
  const channel = activeChannel();
  const streaming = activeYoutubeStarter();
  const segment = selectedInput === 'tv' && !streaming && channel ? locateChannelSegment(channel, broadcastElapsed(channel))?.segment : null;
  const track = selectedInput === 'tv' ? segment : activePlaylist()?.tracks?.[currentIndex];
  const youtubeData = streaming ? window.SaturdayTubeYouTubePlayer?.getPlayer()?.getVideoData?.() : null;
  return {
    input: selectedInput,
    auxGame: window.SaturdayGenesisAux?.hasGame() === true,
    channel: streaming ? { number: youtubeStarterDialNumber(streaming.id), abbreviation: streaming.name.slice(0, 20), name: streaming.name } : channel ? { number: channelDialNumber(channel), abbreviation: channelSurfAbbreviation(channel), name: channel.name || '' } : null,
    title: selectedInput === 'aux' ? (window.SaturdayGenesisAux?.gameTitle() || 'NO CARTRIDGE') : youtubeData?.title || track?.title || '',
    volume: Math.round(dialValue(videoDial)),
    muted: mutedVolume !== null,
    playing: selectedInput === 'aux' ? window.SaturdayGenesisAux?.hasGame() === true : streaming ? window.SaturdayTubeYouTubePlayer?.isPlaying() === true : hasVideo && !video.paused && !video.seeking && video.readyState >= 2,
    loading: selectedInput === 'tv' && tvSearching ? channelLoadingStatus() : '',
    channelProgress: channelPreparationStatus(),
    intermission: window.SaturdayIntermission?.active === true,
    digits: remoteDigits,
    menu: tvSettingsDialog.open,
    guide: tvGuideDialog.open,
    shelf: libraryDialog.open,
    selection: librarySelection.size,
    focus: remoteFocusLabel(),
    fullscreen: fullscreenMode(),
    room: window.SaturdayScenes.name,
    videoFx: pictureFiltersEnabled,
    audioFx: audioFiltersEnabled,
    displayMode,
    pictureMode: selectedPictureMode,
    skinColor: cabinetTint,
    panel: remotePanelSnapshot()
  };
}
function reportRemoteState() {
  if (!remoteEnabled) return;
  const state = JSON.stringify(remoteStateSnapshot());
  if (state === remoteLastState) return;
  remoteLastState = state;
  window.tube.reportRemoteState(JSON.parse(state));
}
function renderRemotePairing(pairing = {}) {
  remoteEnabled = pairing.enabled === true && pairing.running === true;
  remoteEnableToggle.classList.toggle('on', pairing.enabled === true);
  remoteEnableToggle.setAttribute('aria-pressed', String(pairing.enabled === true));
  const qr = document.querySelector('#remoteQr');
  const hint = document.querySelector('#remoteHint');
  const openOnMac = document.querySelector('#remoteOpenButton');
  qr.hidden = !(remoteEnabled && pairing.svg);
  openOnMac.hidden = !remoteEnabled;
  document.querySelector('#remoteMirrorButton').hidden = !remoteEnabled;
  document.querySelector('#remoteResetButton').hidden = !remoteEnabled;
  if (remoteEnabled && pairing.svg) {
    document.querySelector('#remoteQrImage').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.svg)}`;
    document.querySelector('#remoteUrl').textContent = pairing.displayUrl || '';
    hint.textContent = "Open the remote on this Mac without scanning. To pair a phone, scan the QR code; both devices must be on the same Wi-Fi.";
  } else if (pairing.error) {
    hint.textContent = pairing.error;
  } else if (remoteEnabled) {
    hint.textContent = 'Phone QR pairing needs Wi-Fi; open the remote on this Mac without scanning.';
  } else {
    hint.textContent = 'Turn on the remote to open it on this Mac or pair a phone with the QR code.';
  }
  remoteLastState = '';
  reportRemoteState();
}
const remoteDialogObserver = new MutationObserver(records => {
  for (const { target } of records) {
    const index = remoteDialogStack.indexOf(target);
    if (index >= 0) remoteDialogStack.splice(index, 1);
    if (target.open) remoteDialogStack.push(target);
    else document.querySelectorAll('.remote-focus').forEach(item => { if (target.contains(item)) item.classList.remove('remote-focus'); });
  }
});
for (const dialog of document.querySelectorAll('dialog')) remoteDialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
document.addEventListener('pointerdown', () => document.querySelectorAll('.remote-focus').forEach(item => item.classList.remove('remote-focus')), { passive: true });
remoteEnableToggle.addEventListener('click', async () => {
  remoteEnableToggle.disabled = true;
  try { renderRemotePairing(await window.tube.setRemoteEnabled(!remoteEnableToggle.classList.contains('on'))); }
  finally { remoteEnableToggle.disabled = false; }
});
async function openRemotePage(button, open, opened, failed) {
  const hint = document.querySelector('#remoteHint');
  button.disabled = true;
  try {
    const result = await open();
    hint.textContent = result?.ok ? opened : result?.error || failed;
  } catch {
    hint.textContent = failed;
  } finally {
    button.disabled = false;
  }
}
document.querySelector('#remoteOpenButton').addEventListener('click', event => openRemotePage(event.currentTarget, () => window.tube.openRemoteOnThisMac(),
  'The paired remote opened in this Mac’s browser.', 'The paired remote could not be opened in your browser.'));
document.querySelector('#remoteMirrorButton').addEventListener('click', event => openRemotePage(event.currentTarget, () => window.tube.openRemoteMirror(),
  'The screen mirror opened in this Mac’s browser. It follows the paired phone’s keys, backlight and display.', 'The screen mirror could not be opened in your browser.'));
document.querySelector('#remoteResetButton').addEventListener('click', async () => renderRemotePairing(await window.tube.resetRemoteKey()));
document.querySelector('[data-settings-tab="remote"]').addEventListener('click', async () => renderRemotePairing(await window.tube.getRemotePairing()));
window.tube.onRemoteCommand(handleRemoteCommand);
window.tube.getRemotePairing().then(renderRemotePairing).catch(error => console.warn('Phone remote status unavailable', error));
window.setInterval(reportRemoteState, 700);
restoreMetadataCache();
restoreMetadataOverrides();
shelfRestorePromise = restoreShelfRoot();
loadPlaylists().catch(error => { console.error(error); renderPlaylist(); });
loadChannels().catch(error => { console.error('TV channel setup could not be restored', error); renderChannels(); });
window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(VIEW_MODE_KEY, fullscreenMode()); }
  catch (error) { console.warn('View mode could not be saved on exit', error); }
  saveControlPreferences();
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
});
showPlaybackCursor();
let intermissionPlayback = null;
window.SaturdayIntermission.init({
  pause(now) {
    const channel = selectedInput === 'tv' ? activeChannel() : null;
    const snapshot = channel && channelPlaybackSnapshot(channel, now, true);
    if (snapshot && channel.broadcast) {
      channel.broadcast.initialOffsetSeconds = snapshot.elapsedSeconds;
      channel.broadcast.startedAtMs = now;
    }
    const wasPlaying = hasVideo && ((!video.paused && !video.ended) || pendingPlaybackRestore?.wasPlaying === true);
    intermissionPlayback = {
      wasPlaying,
      staticWasPlaying: !staticPicture.paused,
      live: livePlayback ? {
        index: currentIndex,
        track: activePlaylist()?.tracks[currentIndex],
        options: { ...livePlayback.options, forceLive: true, forceEncode: true },
        restore: {
          trackPath: activePlaybackPath,
          currentTime: video.readyState >= 1 ? playbackSourceTime() : Number(pendingPlaybackRestore?.currentTime) || livePlayback.baseSeconds,
          wasPlaying,
          input: selectedInput
        }
      } : null
    };
    video.pause();
    staticPicture.pause();
    window.SaturdayGenesisAux?.setActive(false);
    window.SaturdayGenesisAux?.clearPhoneInput();
    window.clearTimeout(remoteGamepadReleaseTimer);
    for (const key of soundEffectAudio.keys()) stopSoundEffect(key);
    if (intermissionPlayback.live) {
      switchingTracks = true;
      playbackGeneration += 1;
      activePlaybackUrl = '';
      video.removeAttribute('src');
      video.load();
      switchingTracks = false;
    }
    intermissionPlayback.stopped = window.tube.setIntermissionActive(true).catch(error => {
      console.error('Intermission could not stop live streaming', error);
      setStatus('INTERMISSION STREAM STOP FAILED');
    });
    syncLoopingSoundEffects();
    saveChannelPlaybackState();
    reportRemoteState();
  },
  keepPaused() {
    if (!video.paused) video.pause();
    if (!staticPicture.paused) staticPicture.pause();
    window.SaturdayGenesisAux?.setActive(false);
    window.SaturdayGenesisAux?.clearPhoneInput();
  },
  shiftClocks(startedAt, now, resumeStart) {
    for (const channel of channels) {
      if (channel.broadcast) channel.broadcast.startedAtMs = resumeStart(channel.broadcast.startedAtMs, startedAt, now);
    }
  },
  async prepareResume() {
    await intermissionPlayback?.stopped;
    await window.tube.setIntermissionActive(false);
  },
  async resume() {
    const state = intermissionPlayback;
    intermissionPlayback = null;
    if (state?.deferredSource && state.deferredSource.generation === playbackGeneration) {
      attachPlaybackUrl(state.deferredSource.url, state.deferredSource.generation);
    } else if (state?.live) {
      beginTrackPlayback(state.live.index, state.live.restore, state.live.track, state.live.options);
    } else if (state?.wasPlaying) await startVideoPlayback();
    if (state?.staticWasPlaying) await staticPicture.play();
    window.SaturdayGenesisAux?.setActive(selectedInput === 'aux');
    syncLoopingSoundEffects();
    saveChannelPlaybackState();
    reportRemoteState();
  },
  error() { setStatus('COULD NOT RESUME AFTER BREAK · PRESS PLAY'); }
});
scheduleFrameLoop();
function finishRendererStartup() {
  try {
    startStartupSequence();
  } catch (error) {
    console.error('TV startup sequence failed', error);
  } finally {
    // This runs on load while the window is intentionally hidden. Do not gate the ready IPC on RAF;
    // Chromium may throttle hidden-window animation frames, preventing main from ever showing the TV.
    document.body.classList.remove('starting');
    window.tube.notifyRendererReady();
  }
}
window.addEventListener('load', finishRendererStartup, { once: true });
