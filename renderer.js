const video = document.querySelector('#video');
const canvas = document.querySelector('#picture');
const stage = document.querySelector('#stage');
const extensionBadge = document.querySelector('#fileExtensionBadge');
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
const audioSelect = document.querySelector('#audioTracks');
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
const videoBypassToggle = document.querySelector('#videoBypassToggle');
const audioBypassToggle = document.querySelector('#audioBypassToggle');
const pictureDials = [scanlineDial, curveDial, edgeBlurDial, hueDial, vhsScanDial, glitchDial, brokenTapeDial, glowDial, glareDial];
const allDials = [videoDial, ...pictureDials, fxAmountDial];
const playlistSelect = document.querySelector('#playlistSelect');
const playlistName = document.querySelector('#playlistName');
const playlistItemsEl = document.querySelector('#playlistItems');
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
const PLAYLISTS_KEY = 'saturdayTube.playlists.v1';
const CONTROLS_KEY = 'saturdayTube.controls.v1';
const METADATA_KEY = 'saturdayTube.metadata.v1';
const METADATA_TTL = 30 * 24 * 60 * 60 * 1000;
const libraryDialog = document.querySelector('#libraryDialog');
const libraryShelves = document.querySelector('#libraryShelves');
const librarySearch = document.querySelector('#librarySearch');
const libraryBreadcrumbs = document.querySelector('#libraryBreadcrumbs');
const libraryUpButton = document.querySelector('#libraryUpButton');
const libraryAddButton = document.querySelector('#libraryAddButton');
const audioEffectButtons = Array.from(document.querySelectorAll('[data-audio-effect]'));
const finishButtons = Array.from(document.querySelectorAll('[data-finish]'));
let libraryView = null;
let librarySelection = new Set();
let metadataLookupsThisFolder = 0;
const metadataCache = new Map();
const metadataRequests = new Map();
let currentSubtitleTrack = null;
let externalTrackCount = 0;
let hasVideo = false;
let glProgram = null;
let texture = null;
let textureWidth = 0;
let textureHeight = 0;
let lastUploadedTime = -1;
let glContextLost = false;
let pictureFallback = false;
let tvFiltersEnabled = true;
let videoFiltersEnabled = true;
let audioFiltersEnabled = true;
let selectedPictureMode = 'color';
let displayMode = 'crt';
let selectedAudioEffect = 'clean';
let audioContext = null;
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
let isMuted = false;
let currentFinish = 'wood';
let playlists = [];
let activePlaylistId = '';
let currentIndex = -1;
let lastCompositePaused = null;
let currentTrackStarted = false;
let fallbackAttempted = false;
let playbackGeneration = 0;
let extensionTimer = null;
let shuttingOff = false;

const vertexSource = `attribute vec2 p; varying vec2 uv; void main(){ uv=(p+1.0)*0.5; gl_Position=vec4(p,0.0,1.0); }`;
const fragmentSource = `precision mediump float;
varying vec2 uv; uniform sampler2D frame; uniform vec2 resolution; uniform float time; uniform float strength; uniform float scan; uniform float edgeBlur; uniform float hueShift; uniform float vhsScan; uniform float glitch; uniform float broken; uniform float glow; uniform float glare; uniform float pictureMode; uniform float rearProjection;
float hash(float n){return fract(sin(n)*43758.5453);}
mat3 hueTurn(float a){float c=cos(a),s=sin(a);return mat3(0.213+0.787*c-0.213*s,0.213-0.213*c+0.143*s,0.213-0.213*c-0.787*s,0.715-0.715*c-0.715*s,0.715+0.285*c+0.140*s,0.715-0.715*c+0.715*s,0.072-0.072*c+0.928*s,0.072-0.072*c-0.283*s,0.072+0.928*c+0.072*s);}
vec3 softSample(vec2 p,float radius){vec2 d=vec2(radius)/resolution;return (texture2D(frame,p).rgb*0.40+texture2D(frame,p+vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p-vec2(d.x,0.0)).rgb*0.15+texture2D(frame,p+vec2(0.0,d.y)).rgb*0.15+texture2D(frame,p-vec2(0.0,d.y)).rgb*0.15);}
void main(){vec2 q=uv*2.0-1.0;float r2=dot(q,q);if(rearProjection<0.5)q*=1.0+strength*r2;vec2 t=q*0.5+0.5;t.y=1.0-t.y;if(t.x<0.0||t.x>1.0||t.y<0.0||t.y>1.0){gl_FragColor=vec4(0.025,0.03,0.025,1.0);return;}
float row=floor(t.y*resolution.y/7.0);float twitch=(hash(row+floor(time*19.0))-0.5)*0.006*glitch;float tear=step(0.992,hash(floor(time*14.0)+floor(t.y*23.0)))*glitch*0.012;float tracking=sin(t.y*resolution.y*0.018-time*2.6)*0.001+sin(t.y*resolution.y*0.003-time*0.18)*0.002; t.x=clamp(t.x+twitch+tear+tracking*vhsScan,0.0,1.0);
float edge=smoothstep(0.15,1.15,r2);float blurRadius=edge*edgeBlur*1.2+rearProjection*0.65;float split=0.00015+vhsScan*0.0008+glitch*0.001;vec3 col=softSample(t,blurRadius);col.r=softSample(clamp(t+vec2(split,0.0),0.0,1.0),blurRadius).r;col.b=softSample(clamp(t-vec2(split,0.0),0.0,1.0),blurRadius).b;
col=hueTurn((hueShift-0.5)*6.28318)*col;float luma=dot(col,vec3(0.299,0.587,0.114));if(pictureMode>1.5)col=vec3(luma);else if(pictureMode>0.5){vec3 warm=vec3(luma*1.04,luma*1.01,luma*0.94);col=mix(col,warm,0.68);col=clamp((col-0.5)*0.82+0.5,0.0,1.0);}float lines=0.985+0.015*sin(t.y*resolution.y*3.14159);col*=mix(1.0,lines,scan);float dropout=step(0.995,hash(floor(t.y*resolution.y/3.0)+floor(time*8.0)))*broken*0.14;float snow=hash(floor(t.x*resolution.x/2.0)+floor(t.y*resolution.y/2.0)+floor(time*35.0))-0.5;col*=1.0-dropout;col+=snow*broken*0.012;vec3 bloom=max(softSample(t,2.0+glow*5.0)-vec3(0.68),vec3(0.0));col+=bloom*glow*0.12;float corner=1.0-0.12*r2;col*=corner;float grille=0.99+0.01*cos(t.x*resolution.x*3.14159);col*=mix(1.0,grille,scan*0.22);if(rearProjection>0.5){col=col*0.88+vec3(0.035,0.03,0.024);col=pow(max(col,vec3(0.0)),vec3(0.96));}float reflection=exp(-length((uv-vec2(0.21,0.18))*vec2(1.15,1.0))*10.0)*glare*0.11;col+=vec3(0.82,0.91,1.0)*reflection;gl_FragColor=vec4(col,1.0);}`;

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
const AUDIO_EFFECTS = {
  clean: { label: 'CLEAN', highpass: 18, lowpass: 22000, peak: 0, peakHz: 1800, drive: 0, delay: 0, wow: 0, hum: 0, noise: 0, mix: 0 },
  vhs: { label: 'VHS', highpass: 48, lowpass: 9200, peak: -2.5, peakHz: 2600, drive: 0.12, delay: 0.004, wow: 0.00035, hum: 0, noise: 0.0015, mix: 0.86 },
  hum: { label: 'CATHODE HUM', highpass: 22, lowpass: 11000, peak: 1.5, peakHz: 120, drive: 0, delay: 0, wow: 0, hum: 0.026, noise: 0, mix: 0.72 },
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
function setMasterVolume() {
  const volume = dialValue(videoDial) / 100;
  if (masterGain) {
    video.volume = 1;
    video.muted = false;
    smoothAudioParam(masterGain.gain, isMuted ? 0 : volume);
  } else {
    video.volume = volume;
    video.muted = isMuted;
  }
}
function ensureAudioGraph() {
  if (audioContext) return true;
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
    video.volume = 1;
    video.muted = false;
    applyAudioEffect(false);
    setMasterVolume();
    return true;
  } catch (error) {
    console.error('Audio effect chain could not start', error);
    setStatus('AUDIO FX UNAVAILABLE · CLEAN PLAYBACK REMAINS');
    return false;
  }
}
function applyAudioEffect(save = true) {
  const preset = AUDIO_EFFECTS[selectedAudioEffect] || AUDIO_EFFECTS.clean;
  const mix = !audioFiltersEnabled || selectedAudioEffect === 'clean' ? 0 : dialValue(fxAmountDial) / 100 * preset.mix;
  audioEffectButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.audioEffect === selectedAudioEffect)));
  document.querySelector('#audioEffectSummary').textContent = preset.label;
  if (effectHighpass) {
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
  if (save) saveControlPreferences();
}
function setAudioEffect(name, save = true) {
  selectedAudioEffect = Object.hasOwn(AUDIO_EFFECTS, name) ? name : 'clean';
  applyAudioEffect(save);
}
function setFinish(name, save = true) {
  if (!['wood', 'grey', 'black', 'clear', 'yellow', 'red', 'green', 'blue'].includes(name)) return;
  currentFinish = name;
  document.body.dataset.finish = name;
  tvSet.dataset.finish = name;
  finishButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.finish === name)));
  if (save) saveControlPreferences();
}
function saveControlPreferences() {
  try {
    localStorage.setItem(CONTROLS_KEY, JSON.stringify({
      dials: Object.fromEntries(allDials.map(dial => [dial.id, dialValue(dial)])),
      effect: selectedAudioEffect,
      finish: currentFinish,
      tvFiltersEnabled,
      videoFiltersEnabled,
      audioFiltersEnabled,
      pictureMode: selectedPictureMode,
      displayMode,
      activePlaylistId
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
    if (typeof saved.finish === 'string') setFinish(saved.finish, false);
    if (typeof saved.effect === 'string') setAudioEffect(saved.effect, false);
    if (typeof saved.tvFiltersEnabled === 'boolean') tvFiltersEnabled = saved.tvFiltersEnabled;
    if (typeof saved.videoFiltersEnabled === 'boolean') videoFiltersEnabled = saved.videoFiltersEnabled;
    if (typeof saved.audioFiltersEnabled === 'boolean') audioFiltersEnabled = saved.audioFiltersEnabled;
    if (['color', 'lowstim', 'bw'].includes(saved.pictureMode)) selectedPictureMode = saved.pictureMode;
    if (['crt', 'rear'].includes(saved.displayMode)) displayMode = saved.displayMode;
    pictureModeSelect.value = selectedPictureMode;
    displayModeSelect.value = displayMode;
    syncBypassControls();
  } catch (error) { console.warn('Control preferences could not be restored', error); }
}
function syncBypassControls() {
  videoBypassToggle.classList.toggle('on', !videoFiltersEnabled);
  videoBypassToggle.setAttribute('aria-pressed', String(!videoFiltersEnabled));
  audioBypassToggle.classList.toggle('on', !audioFiltersEnabled);
  audioBypassToggle.setAttribute('aria-pressed', String(!audioFiltersEnabled));
  const tvToggle = document.querySelector('#crtToggle');
  tvToggle.classList.toggle('on', tvFiltersEnabled);
  tvToggle.setAttribute('aria-pressed', String(tvFiltersEnabled));
  const modeLabel = { color: 'COLOR', lowstim: 'LOWSTIM', bw: 'B&W' }[selectedPictureMode] || 'COLOR';
  document.querySelector('#displayBadge').textContent = `${modeLabel} ${displayMode === 'rear' ? 'REAR PROJECTION' : 'CRT'}`;
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}
function metadataKey(filename) {
  return String(filename || '').replace(/\\.[^.]+$/, '').replace(/[_ .]+/g, ' ').replace(/\b(?:2160p|1440p|1080p|720p|480p|4k|8k|uhd|hdr|web[- ]?dl|bluray|brrip|hdtv|dvdrip|x26[45]|h26[45]|hevc|av1)\b.*$/i, '').trim().toLocaleLowerCase();
}
function saveMetadataCache() {
  try {
    const entries = Array.from(metadataCache.entries()).slice(-500);
    localStorage.setItem(METADATA_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (error) { console.warn('Local metadata cache could not be saved', error); }
}
function restoreMetadataCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(METADATA_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return;
    for (const [key, entry] of Object.entries(saved)) {
      if (entry && Number.isFinite(entry.at) && Date.now() - entry.at < METADATA_TTL && (entry.value === null || typeof entry.value === 'object')) metadataCache.set(key, entry);
    }
  } catch (error) { console.warn('Local metadata cache could not be read', error); }
}
function renderMetadata(note, metadata, fallback = '') {
  if (metadata) {
    note.textContent = [metadata.title, metadata.year].filter(Boolean).join(' · ');
    note.title = [metadata.detail, metadata.source].filter(Boolean).join(' — ');
  } else {
    note.textContent = fallback;
  }
}
function lookupLibraryMetadata(item, note) {
  const key = metadataKey(item.name);
  if (!key || key.length < 2) return;
  const cached = metadataCache.get(key);
  if (cached && Date.now() - cached.at < METADATA_TTL) {
    renderMetadata(note, cached.value, cached.value ? '' : 'NO MATCH · FILE NAME RETAINED');
    return;
  }
  if (metadataRequests.has(key)) {
    metadataRequests.get(key).then(metadata => { if (note.isConnected) renderMetadata(note, metadata, metadata ? '' : 'NO MATCH · FILE NAME RETAINED'); });
    return;
  }
  if (metadataLookupsThisFolder >= 24) {
    note.textContent = 'FILE NAME RETAINED';
    return;
  }
  metadataLookupsThisFolder += 1;
  const request = window.tube.lookupMetadata(item.name).catch(error => {
    console.warn('Internet metadata lookup failed', error);
    return null;
  }).then(metadata => {
    metadataCache.set(key, { at: Date.now(), value: metadata });
    if (metadataCache.size > 500) metadataCache.delete(metadataCache.keys().next().value);
    saveMetadataCache();
    if (note.isConnected) renderMetadata(note, metadata, metadata ? '' : 'NO MATCH · FILE NAME RETAINED');
    return metadata;
  }).finally(() => metadataRequests.delete(key));
  metadataRequests.set(key, request);
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
  libraryShelves.querySelectorAll('[data-tape-path]').forEach(card => {
    const selected = librarySelection.has(card.dataset.tapePath);
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
}
function makeLibraryCard(item, folder = false) {
  const card = document.createElement('button');
  card.type = 'button';
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
  const cassette = document.createElement('span');
  cassette.className = 'library-cassette';
  cassette.setAttribute('aria-hidden', 'true');
  const reels = document.createElement('i');
  const reelsRight = document.createElement('i');
  const cassetteLabel = document.createElement('b');
  cassetteLabel.textContent = 'VHS VIDEO';
  cassette.append(reels, reelsRight, cassetteLabel);
  const name = document.createElement('strong');
  name.className = 'library-tape-name';
  name.textContent = item.name;
  const note = document.createElement('small');
  note.textContent = `${item.extension} · ${formatBytes(item.size)}`;
  const metadata = document.createElement('span');
  metadata.className = 'library-metadata';
  metadata.textContent = 'LOOKING UP TITLE…';
  card.append(cassette, name, note, metadata);
  card.setAttribute('aria-pressed', String(librarySelection.has(item.path)));
  card.addEventListener('click', event => {
    if (event.shiftKey) {
      if (librarySelection.has(item.path)) librarySelection.delete(item.path);
      else librarySelection.add(item.path);
      updateLibrarySelection();
      return;
    }
    playLibraryTape(item);
  });
  lookupLibraryMetadata(item, metadata);
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
  metadataLookupsThisFolder = 0;
  drawLibraryBreadcrumbs();
  if (!libraryView) {
    document.querySelector('#libraryCount').textContent = 'SHELVES EMPTY';
    libraryEmpty('THE SHELVES ARE WAITING', 'Choose a folder on this Mac. Saturday Tube will display playable videos as VHS tapes on your shelves.');
    updateLibrarySelection();
    return;
  }
  const query = librarySearch.value.trim().toLocaleLowerCase();
  const directories = libraryView.directories.filter(item => item.name.toLocaleLowerCase().includes(query));
  const files = libraryView.files.filter(item => item.name.toLocaleLowerCase().includes(query));
  const omitted = libraryView.omitted ? ` · ${libraryView.omitted} MORE IN THIS FOLDER` : '';
  document.querySelector('#libraryCount').textContent = `${files.length} TAPE${files.length === 1 ? '' : 'S'}${omitted}`;
  libraryShelves.replaceChildren();
  addLibraryShelf('FOLDERS · OPEN A SHELF', directories, true);
  addLibraryShelf('TAPES · SELECT ONE OR MORE', files);
  if (!directories.length && !files.length) {
    libraryEmpty(query ? 'NO MATCHING TAPES' : 'NO PLAYABLE TAPES ON THIS SHELF', query ? 'Try another title or clear the search.' : 'Choose another folder, or add a video with the deck slot.');
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
    librarySelection.clear();
    librarySearch.value = '';
    await loadLibraryFolder(root);
  } catch (error) {
    console.error('Tape shelf folder could not be chosen', error);
    libraryEmpty('FOLDER ACCESS FAILED', error.message || 'Try choosing the folder again.');
  }
}
function openLibrary() {
  if (!libraryDialog.open) libraryDialog.showModal();
  renderLibrary();
  librarySearch.focus();
}
async function playLibraryTape(item) {
  try {
    const selected = await window.tube.openLibraryFiles([item.path]);
    if (!selected.length) {
      setStatus('TAPE MOVED OR NO LONGER AVAILABLE');
      return;
    }
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
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  if (!hasVideo || video.readyState < 2) return;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight || !compositeContext) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outputCanvas = pictureFallback || glContextLost || !gl || !glProgram ? compositeCanvas : canvas;
  const width = Math.max(1, Math.floor(outputCanvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(outputCanvas.clientHeight * dpr));
  const paused = video.paused && !video.ended && !shuttingOff;
  const dimensionsChanged = compositeCanvas.width !== width || compositeCanvas.height !== height;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  if (dimensionsChanged) { compositeCanvas.width = width; compositeCanvas.height = height; }
  const frameChanged = video.currentTime !== lastUploadedTime || paused !== lastCompositePaused || dimensionsChanged;
  if (frameChanged) {
    compositeContext.fillStyle = '#070908';
    compositeContext.fillRect(0, 0, width, height);
    const mediaAspect = sourceWidth / sourceHeight;
    const viewAspect = width / height;
    let x = 0, y = 0, viewWidth = width, viewHeight = height;
    if (mediaAspect > viewAspect) { viewHeight = Math.round(width / mediaAspect); y = Math.floor((height - viewHeight) / 2); }
    else { viewWidth = Math.round(height * mediaAspect); x = Math.floor((width - viewWidth) / 2); }
    compositeContext.drawImage(video, x, y, viewWidth, viewHeight);
    if (paused) {
      compositeContext.save();
      const fontSize = Math.max(18, Math.round(height * 0.055));
      const textX = Math.round(width * 0.085);
      const textY = Math.round(height * 0.075);
      compositeContext.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      compositeContext.textBaseline = 'top';
      compositeContext.shadowColor = '#e9f4d8cc';
      compositeContext.shadowBlur = Math.max(2, height * 0.008);
      compositeContext.fillStyle = '#f3f5e8';
      compositeContext.fillText('PAUSE', textX, textY);
      const barsX = textX + compositeContext.measureText('PAUSE').width + Math.round(fontSize * 0.28);
      const barWidth = Math.max(3, Math.round(fontSize * 0.11));
      const barTop = textY + Math.round(fontSize * 0.08);
      const barHeight = Math.round(fontSize * 0.78);
      compositeContext.fillRect(barsX, barTop, barWidth, barHeight);
      compositeContext.fillRect(barsX + barWidth + Math.max(3, Math.round(fontSize * 0.16)), barTop, barWidth, barHeight);
      compositeContext.restore();
    }
    lastUploadedTime = video.currentTime;
    lastCompositePaused = paused;
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
  const isCRT = tvFiltersEnabled && displayMode === 'crt';
  const tvScale = tvFiltersEnabled ? 1 : 0;
  const videoScale = videoFiltersEnabled ? 1 : 0;
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
  gl.uniform1f(gl.getUniformLocation(glProgram, 'rearProjection'), tvFiltersEnabled && displayMode === 'rear' ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function activePlaylist() { return playlists.find(item => item.id === activePlaylistId) || null; }
function persistPlaylists() {
  try {
    const stored = playlists.map(list => ({
      id: list.id,
      name: list.name,
      tracks: list.tracks.map(track => ({ path: track.path, title: track.title }))
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
  renderPlaylistSelect();
  playlistName.value = list?.name || '';
  const tracks = list?.tracks || [];
  document.querySelector('#playlistCount').textContent = `${tracks.length} TAPE${tracks.length === 1 ? '' : 'S'}`;
  playlistItemsEl.replaceChildren();
  if (!tracks.length) {
    const empty = document.createElement('li');
    empty.className = 'playlist-empty';
    empty.textContent = 'EMPTY · CLICK THE SLOT TO ADD TAPES';
    playlistItemsEl.append(empty);
  } else {
    tracks.forEach((track, index) => {
      const row = document.createElement('li');
      row.className = `playlist-row${index === currentIndex ? ' current' : ''}${track.unavailable ? ' unavailable' : ''}`;
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'track-entry';
      play.setAttribute('aria-current', String(index === currentIndex));
      play.disabled = Boolean(track.unavailable);
      play.title = track.unavailable ? 'File is unavailable; reconnect its drive and add it again' : `Play ${track.title}`;
      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'track-title';
      name.textContent = track.title || 'Untitled video';
      play.append(number, name);
      play.addEventListener('click', () => playTrack(index));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-track';
      remove.setAttribute('aria-label', `Remove ${track.title || 'video'} from playlist`);
      remove.title = 'Remove from this playlist';
      remove.textContent = '×';
      remove.addEventListener('click', () => removeTrack(index));
      row.append(play, remove);
      playlistItemsEl.append(row);
    });
  }
}
function hideFileExtension() {
  if (extensionTimer) clearTimeout(extensionTimer);
  extensionTimer = null;
  extensionBadge.hidden = true;
  extensionBadge.textContent = '';
}
function showFileExtension() {
  const track = activePlaylist()?.tracks[currentIndex];
  const fileName = track?.path?.split(/[\\/]/).pop() || track?.title || '';
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName);
  if (!match) { hideFileExtension(); return; }
  if (extensionTimer) clearTimeout(extensionTimer);
  extensionBadge.textContent = match[1].toUpperCase();
  extensionBadge.hidden = false;
  extensionTimer = setTimeout(hideFileExtension, 2300);
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
function shutOffPicture() {
  if (shuttingOff) return;
  shuttingOff = true;
  currentTrackStarted = false;
  hideFileExtension();
  lastCompositePaused = null;
  stage.classList.add('shutting-off');
  setStatus('FINISHED');
  document.querySelector('#deckState').textContent = 'END OF TAPE';
}
function clearPlayback() {
  video.pause();
  shuttingOff = false;
  currentTrackStarted = false;
  hideFileExtension();
  stage.classList.remove('shutting-off');
  lastCompositePaused = null;
  lastUploadedTime = -1;
  video.removeAttribute('src');
  video.load();
  for (const track of Array.from(video.querySelectorAll('track'))) track.remove();
  currentSubtitleTrack = null;
  externalTrackCount = 0;
  caption.textContent = '';
  hasVideo = false;
  currentIndex = -1;
  stage.classList.add('empty');
  document.querySelector('#emptyState').hidden = false;
  titleEl.textContent = 'Saturday morning starts here';
  seek.value = '0';
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playButton.textContent = '▶ PLAY';
  fallbackAttempted = false;
  playbackGeneration += 1;
  document.querySelector('#deckState').textContent = 'TAPE READY';
  refreshAudioTracks();
  refreshSubtitleTracks();
  renderPlaylist();
}
function playTrack(index) {
  const list = activePlaylist();
  const track = list?.tracks[index];
  if (!track || track.unavailable || !track.url) return;
  for (const item of Array.from(video.querySelectorAll('track'))) item.remove();
  currentSubtitleTrack = null;
  externalTrackCount = 0;
  caption.textContent = '';
  video.pause();
  shuttingOff = false;
  currentTrackStarted = false;
  hideFileExtension();
  stage.classList.remove('shutting-off');
  lastCompositePaused = null;
  lastUploadedTime = -1;
  hasVideo = true;
  currentIndex = index;
  fallbackAttempted = false;
  playbackGeneration += 1;
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
function removeTrack(index) {
  const list = activePlaylist();
  if (!list || !list.tracks[index]) return;
  const wasCurrent = index === currentIndex;
  list.tracks.splice(index, 1);
  persistPlaylists();
  if (wasCurrent) {
    if (list.tracks.length) playTrack(Math.min(index, list.tracks.length - 1));
    else clearPlayback();
  } else {
    if (index < currentIndex) currentIndex--;
    renderPlaylist();
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
        tracks: Array.isArray(item.tracks) ? item.tracks.filter(track => track && typeof track.path === 'string').map(track => ({ path: track.path, title: track.title || track.path.split(/[\\/]/).pop(), unavailable: true })) : []
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
async function addVideos() {
  try {
    const selected = await window.tube.openVideos();
    if (!selected || !selected.length) return;
    let list = activePlaylist();
    if (!list) { createPlaylist(); list = activePlaylist(); }
    list.tracks.push(...selected.map(item => ({ ...item, unavailable: false })));
    persistPlaylists();
    renderPlaylist();
    const firstAdded = Math.max(0, list.tracks.length - selected.length);
    if (!hasVideo) playTrack(firstAdded);
    else setStatus(`${selected.length} TAPE${selected.length === 1 ? '' : 'S'} ADDED`);
    if (libraryDialog.open) libraryDialog.close();
  } catch (error) { setStatus('COULD NOT ADD VIDEOS'); console.error(error); }
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
    if (!selected) return;
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
function refreshAudioTracks() {
  const tracks = video.audioTracks;
  audioSelect.replaceChildren();
  if (!tracks || !tracks.length) {
    audioSelect.add(new Option('Automatic (browser)', 'auto'));
    audioSelect.disabled = true;
    return;
  }
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    audioSelect.add(new Option(track.label || track.language || `Audio ${i + 1}`, String(i), false, track.enabled));
  }
  audioSelect.disabled = false;
}
function refreshSubtitleTracks() {
  const tracks = video.textTracks;
  subtitleSelect.replaceChildren(new Option('Off', 'off'));
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    subtitleSelect.add(new Option(track.label || track.language || (track.kind === 'subtitles' ? `Subtitle ${i + 1}` : `Captions ${i + 1}`), String(i), false, track === currentSubtitleTrack));
  }
  subtitleSelect.disabled = tracks.length === 0;
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
  document.querySelector(`#${dial.id}Readout`).textContent = dialReadoutText(dial, clamped);
}
function bindRotaryDial(dial, onChange = () => {}) {
  let drag = null;
  const min = Number(dial.getAttribute('aria-valuemin'));
  const max = Number(dial.getAttribute('aria-valuemax'));
  const span = max - min;

  dial.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    dial.focus({ preventScroll: true });
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
  };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);
  dial.addEventListener('lostpointercapture', () => {
    drag = null;
    dial.classList.remove('is-dragging');
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
    if (dialValue(dial) !== before) onChange();
  });
}
function updateDial(dial) {
  const min = Number(dial.getAttribute('aria-valuemin'));
  const max = Number(dial.getAttribute('aria-valuemax'));
  const value = Math.max(min, Math.min(max, dialValue(dial)));
  dial.style.setProperty('--knob-angle', `${-135 + ((value - min) / (max - min)) * 270}deg`);
  dial.setAttribute('aria-valuetext', dialValueText(dial, value));
  document.querySelector(`#${dial.id}Readout`).textContent = dialReadoutText(dial, value);
}
async function toggleFullscreen(target) {
  try {
    if (document.fullscreenElement === target) await document.exitFullscreen();
    else await target.requestFullscreen();
  } catch (error) { setStatus('FULLSCREEN NOT AVAILABLE'); console.error(error); }
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
document.querySelector('#libraryAddFileButton').addEventListener('click', addVideos);
document.querySelector('#libraryButton').addEventListener('click', openLibrary);
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
playButton.addEventListener('click', () => video.paused ? video.play().catch(() => {}) : video.pause());
document.querySelector('#previousButton').addEventListener('click', () => {
  if (video.currentTime > 3) video.currentTime = 0;
  else stepTrack(-1);
});
document.querySelector('#nextButton').addEventListener('click', () => stepTrack(1));
video.addEventListener('play', () => {
  if (shuttingOff) { shuttingOff = false; stage.classList.remove('shutting-off'); }
  if (!currentTrackStarted) { showFileExtension(); currentTrackStarted = true; }
  lastCompositePaused = null;
  if (audioContext?.state === 'suspended') audioContext.resume().catch(error => console.warn('Audio context resume was deferred', error));
  playButton.textContent = 'Ⅱ PAUSE';
  setStatus('PLAYING');
  document.querySelector('#deckState').textContent = 'PLAYING';
  applyAudioEffect(false);
});
video.addEventListener('pause', () => {
  lastCompositePaused = null;
  playButton.textContent = '▶ PLAY';
  applyAudioEffect(false);
  if (hasVideo && !video.ended && !shuttingOff) { setStatus('PAUSED'); document.querySelector('#deckState').textContent = 'PAUSED'; }
});
video.addEventListener('ended', () => {
  const nextIndex = findNextPlayableTrack(currentIndex + 1);
  if (nextIndex >= 0) playTrack(nextIndex);
  else shutOffPicture();
});
video.addEventListener('error', () => {
  if (!hasVideo) return;
  if (fallbackAttempted) {
    const nativeError = video.error;
    setStatus(nativeError?.code === 4 ? 'UNSUPPORTED OR DAMAGED VIDEO' : 'VIDEO COULD NOT PLAY');
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    return;
  }
  const list = activePlaylist();
  const track = list?.tracks[currentIndex];
  if (!track?.id || !window.tube.transcodeMedia) {
    setStatus('VIDEO COULD NOT PLAY');
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
    return;
  }
  fallbackAttempted = true;
  const generation = playbackGeneration;
  setStatus('DECODING TAPE');
  document.querySelector('#deckState').textContent = 'CONVERTING TAPE';
  window.tube.transcodeMedia(track.id).then(converted => {
    if (generation !== playbackGeneration || !converted?.url) return;
    video.src = converted.url;
    video.load();
    setStatus('TAPE RESTORED');
  }).catch(error => {
    if (generation !== playbackGeneration) return;
    console.error('Video compatibility conversion failed', error);
    setStatus(String(error?.message || 'VIDEO COULD NOT PLAY').slice(0, 70));
    document.querySelector('#deckState').textContent = 'TAPE ERROR';
  });
});
video.addEventListener('loadedmetadata', () => {
  durationEl.textContent = fmt(video.duration);
  refreshAudioTracks(); refreshSubtitleTracks();
  ensureAudioGraph();
  if (audioContext?.state === 'suspended') audioContext.resume().catch(error => console.warn('Audio context resume was deferred', error));
  setMasterVolume();
  applyAudioEffect(false);
  setStatus('READY TO WATCH');
  video.play().catch(() => {});
});
video.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = fmt(video.currentTime);
  if (Number.isFinite(video.duration) && video.duration > 0 && !seek.matches(':active')) seek.value = String(Math.round(video.currentTime / video.duration * 1000));
});
video.addEventListener('addtrack', refreshSubtitleTracks);
video.textTracks.addEventListener?.('addtrack', refreshSubtitleTracks);
video.audioTracks?.addEventListener?.('addtrack', refreshAudioTracks);
seek.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 1000 * video.duration; });
subtitleSelect.addEventListener('change', () => useSubtitleTrack(subtitleSelect.value));
audioSelect.addEventListener('change', () => {
  const tracks = video.audioTracks;
  if (!tracks) return;
  for (let i = 0; i < tracks.length; i++) tracks[i].enabled = String(i) === audioSelect.value;
});
bindRotaryDial(videoDial, () => {
  isMuted = false;
  document.querySelector('#muteButton').setAttribute('aria-pressed', 'false');
  document.querySelector('#muteButton').classList.remove('muted');
  setMasterVolume();
  saveControlPreferences();
});
for (const dial of pictureDials) bindRotaryDial(dial, saveControlPreferences);
bindRotaryDial(fxAmountDial, () => applyAudioEffect());
restoreControlPreferences();
for (const dial of allDials) updateDial(dial);
setMasterVolume();
audioEffectButtons.forEach(button => button.addEventListener('click', () => setAudioEffect(button.dataset.audioEffect)));
finishButtons.forEach(button => button.addEventListener('click', () => setFinish(button.dataset.finish)));
document.querySelector('#muteButton').addEventListener('click', event => {
  isMuted = !isMuted;
  event.currentTarget.setAttribute('aria-pressed', String(isMuted));
  event.currentTarget.classList.toggle('muted', isMuted);
  setMasterVolume();
});
document.querySelector('#screenOnlyButton').addEventListener('click', () => toggleFullscreen(stage));
document.querySelector('#tvFullscreenButton').addEventListener('click', () => toggleFullscreen(tvSet));
document.addEventListener('fullscreenchange', () => {
  const onScreen = document.fullscreenElement === stage;
  const onTv = document.fullscreenElement === tvSet;
  document.querySelector('#screenOnlyButton').setAttribute('aria-pressed', String(onScreen));
  document.querySelector('#tvFullscreenButton').setAttribute('aria-pressed', String(onTv));
  canvas.width = 0;
  canvas.height = 0;
});
document.querySelector('#crtToggle').addEventListener('click', () => {
  tvFiltersEnabled = !tvFiltersEnabled;
  syncBypassControls();
  saveControlPreferences();
});
videoBypassToggle.addEventListener('click', () => {
  videoFiltersEnabled = !videoFiltersEnabled;
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
  saveControlPreferences();
});
displayModeSelect.addEventListener('change', () => {
  displayMode = ['crt', 'rear'].includes(displayModeSelect.value) ? displayModeSelect.value : 'crt';
  saveControlPreferences();
});
document.addEventListener('keydown', event => {
  if (event.target.matches('input,select,button')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); addVideos(); }
  else if (event.code === 'Space' && hasVideo) { event.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); }
  else if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  else if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
});
restoreMetadataCache();
loadPlaylists().catch(error => { console.error(error); renderPlaylist(); });
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
requestAnimationFrame(frameLoop);
