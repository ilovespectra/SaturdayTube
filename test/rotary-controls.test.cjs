const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const renderer = readFileSync(path.join(root, 'renderer.js'), 'utf8');
const css = readFileSync(path.join(root, 'styles.css'), 'utf8');
const main = readFileSync(path.join(root, 'main.cjs'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const preload = readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const shelfStorage = readFileSync(path.join(root, 'shelf-storage.cjs'), 'utf8');
const appIdentity = readFileSync(path.join(root, 'app-identity.cjs'), 'utf8');

test('Picture Lab exposes seven adjustable effects including Glow and Brightness', () => {
  assert.match(html, /<span>PICTURE LAB<\/span><span>7 DIALS<\/span>/);
  for (const dial of ['edgeBlur', 'hue', 'vhsScan', 'glitch', 'brokenTape', 'glow', 'brightness']) {
    assert.match(html, new RegExp(`id="${dial}"`));
    assert.match(renderer, new RegExp(`document\\.querySelector\\('#${dial}'\\)`));
  }
  assert.match(renderer, /const pictureDials = \[scanlineDial, curveDial, edgeBlurDial, hueDial, vhsScanDial, glitchDial, brokenTapeDial, glowDial, brightnessDial\]/);
  assert.match(renderer, /uniform float glow/);
  assert.doesNotMatch(renderer, /glare/i, 'the fake glass glare is gone');
  assert.match(renderer, /col\+=bloom\*glow\*0\.42/);
  assert.match(renderer, /getUniformLocation\(glProgram, 'glow'\)/);
  assert.match(renderer, /Object\.fromEntries\(allDials\.map/);
});

test('all cabinet finishes carry through the television hardware', () => {
  const finishes = ['wood', 'grey', 'black', 'clear'];
  for (const finish of finishes) {
    assert.match(html, new RegExp(`data-finish="${finish}"`));
    assert.match(renderer, new RegExp(`'${finish}'`));
  }
  assert.match(css, /\.tv-set\[data-finish="wood"\][\s\S]*?--cabinet-tint/);
  assert.match(css, /\.tv-set\[data-finish="clear"\][\s\S]*?--cabinet-tint/);
  assert.match(css, /\.tv-set\[data-finish\] \.deck-module/);
  assert.match(html, /CASE MATERIAL/);
  assert.match(html, /id="cabinetTint" type="color"/);
});

test('later redesign-only sections stay absent while TV OSD controls are present', () => {
  for (const removed of ['fullscreenSeek', 'tapeShelf', 'powerButton', 'audioSource', 'rcaSelector', 'fullscreen-pause-indicator', 'transport-label']) {
    assert.doesNotMatch(html, new RegExp(removed, 'i'));
  }
  assert.match(html, /id="audioRcaButton"[\s\S]*?id="tvSettingsDialog"/i);
  assert.doesNotMatch(html, /id="audioSettingsDialog"/i);
  assert.match(renderer, /selectSettingsTab\('audio'\); showScreenDialog\(tvSettingsDialog\)/);
  assert.doesNotMatch(html, /AUX SECTION|STATIC SECTION/i);
  assert.doesNotMatch(html, /screen-corner|fileExtensionBadge/);
  assert.doesNotMatch(html, /NTSC\s*[·.]\s*60\s*HZ/i);
  assert.match(html, /class="playlist-panel"/);
  assert.match(html, /class="deck-module"/);
  assert.match(html, /id="status" class="visually-hidden"/);
  assert.doesNotMatch(html, /<details|class="room-header"|id="libraryButton"/);
  assert.doesNotMatch(css, /\.wear-chip|\.wear-dent|\.wear-scratch|\.cabinet-wear/);
  assert.match(css, /control-panel \{[\s\S]*?overflow:hidden/);
  assert.match(css, /body\.cursor-idle,body\.cursor-idle \*/);
  assert.match(html, /class="transport under-screen"/);
  assert.match(html, /<input id="seek"/);
  assert.match(html, /aria-label="Fast-forward \/ next tape"><svg/);
  assert.doesNotMatch(html, /class="screen-foot"|class="vhs-deck"|class="material-atlas"/);
  assert.match(css, /html \{[^}]*overflow: hidden/);
  assert.match(css, /body \{[^}]*overflow: hidden/);
  assert.match(css, /\.room \{[^}]*height: 100dvh/);
  assert.match(css, /\.tv-set \{[^}]*min-height: 0/);
  assert.match(html, /id="libraryDialog"/);
});

test('playback, captions, saved playlists, and preferences retain the historical interfaces', () => {
  for (const id of ['video', 'playButton', 'previousButton', 'nextButton', 'seek', 'audioOutput', 'subtitleTracks', 'subtitleButton', 'openButton']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /saturdayTube\.playlists\.v1/);
  assert.match(renderer, /saturdayTube\.controls\.v1/);
  assert.doesNotMatch(main, /ipcMain\.handle\('open-videos'/);
  assert.match(main, /ipcMain\.handle\('open-library-files'/);
  assert.match(main, /ipcMain\.handle\('import-library-files'/);
  assert.match(main, /ipcMain\.handle\('restore-library-folder'/);
  assert.match(shelfStorage, /createWriteStream\(destination, \{ flags: 'wx', highWaterMark: 1024 \* 1024 \}\)/);
  assert.match(renderer, /saturdayTube\.shelf\.root\.v1/);
  assert.match(preload, /restoreLibraryFolder/);
  assert.match(preload, /importLibraryFiles/);
  assert.match(main, /ipcMain\.handle\('open-subtitle'/);
  assert.match(main, /ipcMain\.handle\('transcode-media', transcodeMedia\)/);
  assert.match(main, /h264_videotoolbox/);
  assert.doesNotMatch(main, /libx264/);
  assert.doesNotMatch(main, /\/opt\/homebrew\/bin\/ffmpeg|\/usr\/local\/bin\/ffmpeg/);
  assert.match(main, /const appIdentity = configureAppIdentity\(\{ app \}\)/);
  assert.ok(main.indexOf('configureAppIdentity({ app })') < main.indexOf("require('./shelf-storage.cjs')"));
  assert.match(appIdentity, /app\.setName\(displayName\);[\s\S]*?app\.setPath\('userData', userDataPath\)/);
  assert.match(main, /path\.join\(process\.resourcesPath, 'ffmpeg'\)/);
  assert.match(main, /path\.join\(__dirname, 'vendor', 'ffmpeg', 'ffmpeg'\)/);
  assert.match(renderer, /window\.tube\.transcodeMedia\(track\.id\)/);
  assert.match(main, /MAX_TRANSCODE_FILE_BYTES = 8 \* 1024 \*\* 3/);
  assert.match(main, /MAX_TRANSCODE_CACHE_BYTES = 16 \* 1024 \*\* 3/);
  assert.match(main, /MIN_FREE_DISK_BYTES = 8 \* 1024 \*\* 3/);
});

test('release metadata targets the next 0.8 patch and keeps the ARM build path', () => {
  assert.equal(pkg.version, '0.8.6');
  assert.match(pkg.scripts['package:mac'], /build-package/);
  const build = readFileSync(path.join(root, 'build-package.mjs'), 'utf8');
  assert.match(build, /arm64/);
  assert.match(build, /com\.ilovespectra\.saturdaytube\.candidate/);
  assert.match(build, /process\.argv\.includes\('--release'\)/);
  assert.match(build, /releaseBuild \? 'com\.ilovespectra\.saturdaytube' : 'com\.ilovespectra\.saturdaytube\.candidate'/);
});

test('the picture carries no file-extension label now that channels name themselves', () => {
  assert.doesNotMatch(html, /fileExtensionBadge/);
  assert.doesNotMatch(renderer, /visibleFileExtension|showFileExtension|drawFileExtensionOverlay|fileExtensionForTrack/);
  assert.match(renderer, /if \(paused\) drawOsdPause\(osdContext, safe\)/, 'PAUSE is drawn on the shared OSD layer');
  assert.doesNotMatch(renderer, /currentTrackStarted/);
});

test('landing screen, static input, and sound effects are CRT-ready and preloaded', () => {
  assert.match(html, /A little Saturday magic/);
  assert.match(html, /id="staticPicture"[^>]*aria-hidden="true"/);
  assert.match(renderer, /window\.tube\.getStaticInput\(\)\.then\(media => \{[\s\S]*?staticPicture\.src = staticInputUrl/);
  assert.match(main, /staticInputMedia = registerMediaFile\(path\.join\(__dirname, 'assets', 'static', 'tv-static-4k-60fps\.mp4'\)\)/);
  assert.match(html, /class="crt-glass"/);
  assert.match(html, /id="inputButton"/);
  assert.match(html, /id="soundEffectsVolume"/);
  assert.match(html, /id="soundEffectsToggle"/);
  assert.match(renderer, /audio\.preload = 'auto'/);
  assert.match(renderer, /audio\.load\(\)/);
  assert.match(renderer, /playSoundEffect\('powerOn'\)[\s\S]*playSoundEffect\('startup'\)/);
  assert.match(renderer, /function setInputSource\(source, save = true\)/);
  assert.match(renderer, /playSoundEffect\(button\.id === 'openButton' \? 'vhsEject' : 'button'\)/);
  assert.match(renderer, /playSoundEffect\('vhsInsert'\)/);
  assert.match(renderer, /playSoundEffect\('crtCutoff'\)/);
  assert.match(renderer, /soundEffectsVolume/);
  assert.match(renderer, /powerOn: 'quick\/crt-poweronanddegause\.wav'/);
  assert.match(renderer, /crtCutoff: 'quick\/crt-poweroff\.wav'/);
  assert.match(renderer, /knob: 'quick\/clicking\.wav', button: 'quick\/button-click\.wav'/);
  assert.match(renderer, /Math\.min\(4, soundEffectsVolume \/ 100 \* multiplier\)/);
  assert.match(renderer, /soundEffectsVolume = Math\.max\(0, Math\.min\(400, Number\(soundEffectsVolumeControl\.value\)/);
  assert.match(renderer, /limiter\.threshold\.value = -3/);
  assert.match(html, /id="soundEffectsVolume" type="range" min="0" max="400" value="100"/);
  assert.match(css, /\.stage\.empty:not\(\.static-channel\) \.crt-glass/);
  assert.match(css, /@keyframes crt-power-on/);
  assert.match(main, /autoplay-policy', 'no-user-gesture-required'/);
  for (const [asset, mime] of [
    ['assets/audio/crt-poweronanddegause.mp3', 'audio/mpeg'],
    ['assets/audio/crt-poweroff.mp3', 'audio/mpeg'],
    ['assets/audio/button-click.mp3', 'audio/mpeg'],
    ['assets/audio/clicking.mp3', 'audio/mpeg'],
    ['assets/audio/crt-hum-loop.wav', 'audio/wav'],
    ['assets/audio/startup-chiptune.mp3', 'audio/mpeg'],
    ['assets/audio/static.mp3', 'audio/mpeg'],
    ['assets/audio/vhs-eject.mp3', 'audio/mpeg'],
    ['assets/audio/vhs-insert.mp3', 'audio/mpeg'],
    ['assets/static/analog-tv-static-loop.mp4', 'video/mp4'],
    ['assets/static/tv-static-4k-60fps.mp4', 'video/mp4'],
    ...['button-click', 'clicking', 'crt-poweroff', 'crt-poweronanddegause', 'startup-chiptune', 'vhs-eject', 'vhs-insert'].map(name => [`assets/audio/quick/${name}.wav`, 'audio/wav'])
  ]) {
    assert.ok(main.includes(`'${asset}': { file: '${asset}', type: '${mime}' }`), `${asset} is served as ${mime}`);
    assert.ok(existsSync(path.join(root, asset)), `${asset} exists`);
  }
  for (const name of ['crt-cutoff.mp3', 'crt-hum-original.mp3', 'crt-power-on-and-degauss.mp3']) {
    assert.ok(existsSync(path.join(root, 'assets', 'audio', name)), `${name} source copy is retained`);
  }
  const loop = readFileSync(path.join(root, 'assets', 'audio', 'crt-hum-loop.wav'));
  const loopSeconds = loop.readUInt32LE(40) / loop.readUInt32LE(28);
  assert.ok(loopSeconds < 5, `hum loop is shortened (${loopSeconds.toFixed(2)} seconds)`);
  const sourceClick = readFileSync(path.join(root, 'assets', 'audio', 'button-click.mp3'));
  const quickClick = readFileSync(path.join(root, 'assets', 'audio', 'quick', 'button-click.wav'));
  assert.ok(sourceClick.length > 0 && quickClick.length > 44, 'original source and separate trimmed playback copy both remain');
  assert.ok(existsSync(path.join(root, 'assets', 'static', 'tv-static-4k-60fps.mp4')));
});

test('knob click audio stops on release, cancel, and lost pointer capture', () => {
  assert.match(renderer, /dial\.addEventListener\('pointerdown', event => \{[\s\S]*?playSoundEffect\('knob'\)/);
  assert.match(renderer, /const endDrag = event => \{[\s\S]*?stopSoundEffect\('knob'\);[\s\S]*?dial\.addEventListener\('pointerup', endDrag\);[\s\S]*?dial\.addEventListener\('pointercancel', endDrag\);/);
  assert.match(renderer, /dial\.addEventListener\('lostpointercapture', \(\) => \{[\s\S]*?stopSoundEffect\('knob'\);/);
  assert.match(renderer, /const soundEffectPlayTokens = new Map\(\)/);
  assert.match(renderer, /if \(soundEffectPlayTokens\.get\(key\) !== playToken \|\| !soundEffectsEnabled \|\| soundEffectsVolume <= 0\) return/);
  assert.match(renderer, /function stopSoundEffect\(key\) \{[\s\S]*?soundEffectPlayTokens\.set\(key, \(soundEffectPlayTokens\.get\(key\) \|\| 0\) \+ 1\);[\s\S]*?audio\.pause\(\)/);
});

test('shelf modal keeps additive multi-tape selection and queues all selected files', () => {
  assert.match(renderer, /if \(event\.shiftKey\) \{[\s\S]*?librarySelection\.add\(item\.path\)/);
  assert.match(renderer, /window\.tube\.openLibraryFiles\(Array\.from\(librarySelection\)\)/);
  assert.match(renderer, /list\.tracks\.push\(\.\.\.selected\.map\(track => \(\{ \.\.\.track, unavailable: false \}\)\)\)/);
  assert.match(renderer, /librarySelection\.clear\(\);[\s\S]*playTrack\(firstIndex\)/);
});

test('startup preserves the selected input without autoplaying ordinary playlists', () => {
  const loader = renderer.match(/async function loadPlaylists\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(loader, /restorePlaybackSession|playTrack\(/);
  assert.match(renderer, /let selectedInput = 'video';[\s\S]*?resumeVideoAfterStatic = false;\s*resumeTVAfterStatic = false;\s*if \(selectedInput === 'tv'\) \{\s*syncBypassControls\(\);\s*renderPlaylist\(\);\s*\} else \{\s*setInputSource\(selectedInput, false\);\s*\}/);
  assert.match(renderer, /scheduleFrameLoop\(\);\s*function finishRendererStartup\(\) \{\s*try \{\s*startStartupSequence\(\);/);
  const channelLoader = renderer.match(/async function loadChannels\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(channelLoader, /for \(const channel of startupOrder\) \{[\s\S]*?await scanChannel\(channel\);/);
  assert.match(channelLoader, /channelsStartupReady = true;[\s\S]*?void warmChannelsInBackground\(\);/);
  assert.doesNotMatch(channelLoader, /if \(selectedInput !== 'tv'\) return;/);
  assert.match(renderer, /let startupIntroActive = true/);
  assert.match(renderer, /else if \(selectedInput !== 'tv' \|\| startupIntroActive\) \{\s*drawIntroPicture/);
  assert.match(renderer, /function explicitPlaybackRestore\(index\) \{[\s\S]*?saved\.trackPath !== track\?\.path[\s\S]*?wasPlaying: true/);
  assert.match(renderer, /play\.addEventListener\('click', \(\) => playTrack\(index, channelMode \? null : explicitPlaybackRestore\(index\)\)\)/);
  assert.match(renderer, /localStorage\.setItem\(SESSION_KEY, JSON\.stringify\(/);
});

test('tapes are copied locally before playback and persist their managed-copy flag', () => {
  assert.match(main, /path\.join\(userData, 'Managed Tapes'\)/);
  assert.match(main, /async function ensureLocalTape\(event, filePath\)[\s\S]*?copyFileIntoShelf\(source, managedRoot/);
  assert.match(main, /managedLocalCopy: true/);
  assert.match(main, /files\.push\(\{\s*\.\.\.registerMediaFile\(stored\.path\),\s*managedLocalCopy: true/);
  assert.match(renderer, /async function loadPlaylists\(\)[\s\S]*?managedLocalCopy: track\.managedLocalCopy === true/);
  assert.match(renderer, /function ensureLocalTapeOnce\(sourcePath\)/);
  assert.match(renderer, /ensureLocalTapeOnce\(sourcePath\)\.then\(local => \{[\s\S]*?persistPlaylists\(\);[\s\S]*?beginTrackPlayback\(index, restoreSession\)/);
  assert.match(renderer, /managedLocalCopy \? \{ managedLocalCopy: true \}/);
});

test('playlist eject preserves originals and defers deleting shared local copies', () => {
  assert.match(html, /TAP TO PLAY · ⏏ EJECTS TAPE/);
  assert.match(renderer, /eject\.className = 'eject-track'/);
  assert.match(renderer, /function otherPlaylistReferences\(filePath, playlistId, trackIndex\)/);
  assert.match(renderer, /track\.managedLocalCopy === true && sharedReferences === 0/);
  assert.match(renderer, /This deletes only Saturday Tube’s local copy from this Mac/);
  assert.match(renderer, /window\.tube\.ejectManagedTape\(filePath\)/);
  assert.match(main, /async function ejectManagedTape\(event, filePath\)[\s\S]*?removeFileFromShelf\(filePath, managedRoot\)/);
  assert.match(shelfStorage, /async function removeFileFromShelf\(filePath, shelfPath\)[\s\S]*?insideDirectory\(shelf, requested\)[\s\S]*?await fs\.unlink\(requested\)/);
  assert.match(shelfStorage, /fileStat\.isSymbolicLink\(\) \|\| !fileStat\.isFile\(\)/);
});

test('the pause overlay keeps CRT typography and safe areas', () => {
  assert.match(renderer, /const compositeCanvas = document\.createElement\('canvas'\)/);
  assert.match(renderer, /compositeContext\.drawImage\(source, x, y, viewWidth, viewHeight\)/);
  assert.match(renderer, /const OSD_CANVAS_FONT = '"Saturday OSD", ui-monospace/);
  assert.match(renderer, /document\.fonts\?\.load\?\.\(`48px \$\{OSD_CANVAS_FONT\}`\)/);
  assert.match(renderer, /const OSD_INK = '#e6fbff';/);
  assert.match(renderer, /const OSD_GLOW = '#33d6ff';/);
  assert.match(renderer, /drawOsdText\(context, 'PAUSE', x, y, size\)/);
  assert.match(renderer, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, compositeCanvas\)/);
  assert.match(renderer, /paused !== lastCompositePaused/);
  assert.match(css, /\.empty-title \{[^}]*font-family: ui-monospace/);
  assert.match(css, /\.stage\.empty:not\(\.static-channel\) \.empty-title \{[^}]*text-transform:uppercase/);
  assert.match(css, /\.stage\.empty:not\(\.static-channel\) \{[^}]*#010201/);
  assert.match(css, /\.play-key \{[^}]*font-family: ui-monospace/);
});

test('WebGL loss keeps the video visible through the 2D picture fallback', () => {
  assert.match(renderer, /compositeCanvas\.hidden = !active/);
  assert.match(renderer, /canvas\.hidden = active/);
  assert.match(renderer, /const outputCanvas = pictureFallback \|\| glContextLost \|\| !gl \|\| !glProgram \? compositeCanvas : canvas/);
  assert.match(renderer, /webglcontextlost/);
  assert.match(renderer, /setPictureFallback\(true\)/);
  assert.match(renderer, /webglcontextrestored/);
  assert.match(renderer, /setPictureFallback\(false\)/);
});

test('power-on expands the CRT picture and defers shutoff until boot completes', () => {
  assert.match(renderer, /let pendingStartupShutoff = false/);
  assert.match(renderer, /function startStartupSequence\(\) \{[\s\S]*?stage\.classList\.remove\('shutting-off'\);[\s\S]*?stage\.classList\.add\('startup-intro', 'booting'\);[\s\S]*?if \(pendingStartupShutoff\) \{[\s\S]*?shutOffPicture\(\);/);
  assert.match(renderer, /function shutOffPicture\(\) \{\s*if \(shuttingOff\) return;\s*if \(stage\.classList\.contains\('booting'\)\) \{\s*pendingStartupShutoff = true;\s*return;/);
  assert.match(css, /\.stage\.booting canvas \{[^}]*animation:crt-picture-power-on 1\.5s/);
  assert.match(css, /@keyframes crt-picture-power-on \{ 0% \{ transform:scale\(\.03,\.006\)/);
  assert.match(css, /@keyframes crt-picture-power-on[\s\S]*?100% \{ transform:scale\(1,1\)/);
  assert.match(css, /\.stage\.booting::before \{[^}]*animation:crt-power-on/);
});

test('the final playable queued tape shuts off the retained CRT picture', () => {
  assert.match(renderer, /function findNextPlayableTrack\(startIndex\)/);
  assert.match(renderer, /if \(nextIndex >= 0\) playTrack\(nextIndex\);\s*else shutOffPicture\(\);/);
  assert.match(renderer, /stage\.classList\.add\('shutting-off'\)/);
  assert.match(css, /\.stage\.shutting-off:not\(\.booting\) canvas/);
  assert.match(css, /@keyframes crt-picture-shutoff/);
});

test('tape-library browsing pauses CRT redraws and resumes when closed', () => {
  assert.match(renderer, /let frameLoopRequest = null/);
  assert.match(renderer, /function scheduleFrameLoop\(\) \{\s*if \(pictureVisible && frameLoopRequest === null\) frameLoopRequest = requestAnimationFrame\(frameLoop\);\s*\}/);
  assert.match(renderer, /function pauseFrameLoop\(\) \{\s*if \(frameLoopRequest === null\) return;\s*cancelAnimationFrame\(frameLoopRequest\);\s*frameLoopRequest = null;\s*\}/);
  assert.match(renderer, /async function openLibrary\(\) \{\s*if \(selectedInput === 'tv'\) setInputSource\('video'\);\s*if \(!libraryDialog\.open\) \{\s*libraryDialog\.showModal\(\);\s*pauseFrameLoop\(\);/);
  assert.match(renderer, /function frameLoop\(now\) \{\s*frameLoopRequest = null;\s*if \(!pictureVisible \|\| libraryDialog\.open\) return;\s*scheduleFrameLoop\(\);/);
  assert.match(renderer, /libraryDialog\.addEventListener\('close', \(\) => \{\s*scheduleFrameLoop\(\);\s*\}\);/, 'closing shelves remotely must not reveal the mouse cursor');
});

test('the CRT stage fills the bezel interior without a secondary 4:3 inset', () => {
  assert.match(css, /\.stage \{[\s\S]*?width: 100%; max-width: 100%; height: 100%; max-height: 100%; min-width: 0; min-height: 0; aspect-ratio: auto;[\s\S]*?border: 0; border-radius: 7% \/ 10%;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.screen-bezel \{\s*container-type: size; display: flex; align-items: center; justify-content: center/);
  assert.match(renderer, /compositeContext\.drawImage\(source, x, y, viewWidth, viewHeight\)/);
  assert.match(html, /class="deck-module"/);
  assert.doesNotMatch(html, /class="cabinet-foot"|class="vhs-deck"/);
});

test('dials span 0–100 (scanlines, edge blur, glow reach 200) and TV bypasses stay independent', () => {
  const boosted = ['scanlines', 'edgeBlur', 'glow'];
  for (const dial of ['volume', 'scanlines', 'curve', 'edgeBlur', 'hue', 'vhsScan', 'glitch', 'brokenTape', 'glow', 'brightness', 'fxAmount']) {
    const tag = html.match(new RegExp(`<button id="${dial}"[^>]+>`))?.[0];
    assert.ok(tag, `${dial} control exists`);
    assert.match(tag, /aria-valuemin="0"/);
    assert.match(tag, boosted.includes(dial) ? /aria-valuemax="200"/ : /aria-valuemax="100"/);
  }
  assert.match(renderer, /col\*=1\.0-scan\*0\.2\*lineWave;/);
  for (const id of ['pictureBypassToggle', 'audioBypassToggle']) assert.match(html, new RegExp(`id="${id}"`));
  for (const removed of ['videoBypassToggle', 'crtToggle', 'filterToggle']) assert.doesNotMatch(html, new RegExp(`id="${removed}"`));
  assert.match(renderer, /pictureFiltersEnabled = !pictureFiltersEnabled/);
  assert.match(renderer, /audioFiltersEnabled = !audioFiltersEnabled/);
  assert.match(html, /PICTURE FILTER BYPASS/);
});

test('LOWSTIM, true grayscale, and rear projection have separate picture paths', () => {
  assert.match(html, /option value="lowstim">LOWSTIM/);
  assert.match(html, /option value="bw">B&amp;W/);
  assert.match(html, /option value="rear">REAR PROJECTION/);
  assert.match(renderer, /if\(pictureMode>1\.5\)col=vec3\(luma\)/);
  assert.match(renderer, /if\(rearProjection>0\.5\)/);
});

test('shelf opens from the tape slot and a normal tape click starts playback', () => {
  assert.match(renderer, /document\.querySelector\('#openButton'\)\.addEventListener\('click', openLibrary\)/);
  assert.match(renderer, /if \(event\.shiftKey\)[\s\S]*?playLibraryTape\(item\)/);
  assert.match(renderer, /libraryDialog\.close\(\);\s*playTrack\(index\)/);
  assert.match(renderer, /startVideoPlayback\(\)\.catch\(\(\) => \{\}\)/);
});

test('metadata lookup routes by media type and avoids persistent false misses', () => {
  const metadata = readFileSync(path.join(root, 'metadata-service.cjs'), 'utf8');
  assert.match(main, /lookupMediaMetadata\(request, fetchMetadataJson\)/);
  assert.match(metadata, /api\.tvmaze\.com\/search\/shows/);
  assert.match(metadata, /en\.wikipedia\.org\/w\/rest\.php\/v1\/search\/page/);
  assert.match(main, /setTimeout\(\(\) => controller\.abort\(\), 6500\)/);
  assert.match(renderer, /saturdayTube\.metadata\.v2/);
  assert.match(renderer, /METADATA_MISS_TTL = 12 \* 60 \* 60 \* 1000/);
  assert.match(metadata, /findStrictTvMazeMatch/);
  assert.match(metadata, /findStrictWikipediaPage/);
  assert.match(renderer, /lookupUnavailable/);
  assert.match(renderer, /if \(!metadata\?\.lookupUnavailable && job\.cacheResult\)/);
  assert.match(metadata, /image: show\.image\?\.medium/);
  assert.match(metadata, /thumbnail\?\.source/);
  assert.match(metadata, /api\/rest_v1\/page\/summary/);
  assert.match(metadata, /summary\.originalimage\?\.source/);
});

test('maximum tape faults remain deliberately gentle with no fixed glare stripe', () => {
  assert.match(renderer, /0\.006\*glitch/);
  assert.match(renderer, /glitch\*0\.012/);
  assert.match(renderer, /broken\*0\.14/);
  assert.match(renderer, /broken\*0\.012/);
  assert.doesNotMatch(css, /linear-gradient\(110deg, #fff0 34%, #eaffd010 47%, #fff0 58%\)/);
});

test('playlist eject keeps original source files untouched', () => {
  assert.match(html, /id="deletePlaylistButton"/);
  assert.match(renderer, /Delete the playlist .*?video files will stay on disk/);
  assert.match(renderer, /Eject from playlist; keep the original file/);
  assert.match(renderer, /window\.tube\.ejectManagedTape\(filePath\)/);
  assert.match(renderer, /track\.managedLocalCopy === true && sharedReferences === 0/);
});

test('library artwork is portrait, fully visible, and backed by a rotated VHS case', () => {
  assert.doesNotMatch(css, /url\("saturday:\/\/app\/assets\/materials\/(?:philips-chassis|clear-gameboy)\.jpg"\)/);
  assert.match(css, /\.tv-set\[data-finish\] \.dial-face/);
  assert.match(css, /\.tv-set\[data-finish="clear"\] \.control-panel \{ background:radial-gradient/);
  assert.match(css, /\.library-artwork-frame \{[^}]*aspect-ratio: 2 \/ 3/);
  assert.match(css, /\.library-cover \{[^}]*object-fit: contain/);
  assert.match(css, /\.library-cassette \{ position: absolute; top: 50%; left: 50%; display: block; width: 150%; height: 66\.6667%/);
  assert.match(css, /transform: translate\(-50%,-50%\) rotate\(90deg\); \}/);
  assert.match(css, /\.library-cassette i:first-child \{ left: 21%; right: auto; transform: translate\(-50%,-50%\); \}/);
  assert.match(css, /\.library-cassette i:nth-child\(2\) \{ top: 53%; left: 79%; right: auto; transform: translate\(-50%,-50%\); \}/);
  assert.match(css, /\.library-cassette b \{ top: 40%;[^}]*width: 32%; height: 25%/);
  assert.match(css, /linear-gradient\(90deg,#919894 0 5%,#505858 6% 9%,#161a1c 10% 32%/);
  assert.match(renderer, /cassetteWordmark\.textContent = 'VHS VIDEO'/);
  assert.match(css, /\.library-cassette b span \{ display: block; transform: rotate\(180deg\); \}/);
  assert.match(renderer, /className = 'library-tape-play'/);
  assert.match(renderer, /className = 'library-tape-info'/);
  assert.match(renderer, /captionTitle\.textContent = view\.collection\?\.name \|\| title/);
  assert.match(renderer, /captionDetail\.textContent = view\.collection \? [^\n]* : subtitle/);
  assert.doesNotMatch(renderer, /library-artwork-label/);
  assert.match(renderer, /FIND EXACT/);
  assert.match(renderer, /SAVE LABEL/);
  assert.match(renderer, /AUTO LOOKUP/);
});

test('imports expose per-file progress and artwork feedback remains explicit', () => {
  assert.match(html, /id="libraryImportProgress"[^>]*aria-live="polite"/);
  assert.match(preload, /onLibraryImportProgress/);
  assert.match(main, /phase: 'copy-progress'/);
  assert.match(main, /This Mac is low on storage/);
  assert.match(renderer, /COPYING TAPE/);
  assert.match(renderer, /LIBRARY_IMPORT_SUCCESS_DISMISS_MS = 1800/);
  assert.match(renderer, /libraryImportPanel\.dataset\.outcome = Number\(progress\.failed\) > 0 \? 'attention' : 'success'/);
  assert.match(renderer, /if \(Number\(progress\.failed\) <= 0\)/);
  assert.match(renderer, /COVER READY/);
  assert.match(renderer, /COVER UNAVAILABLE · VHS LABEL SHOWN/);
  assert.match(renderer, /OFFLINE · RETRY WHEN ONLINE/);
  assert.match(renderer, /lookupUnavailable/);
  assert.match(renderer, /No reliable match; the original filename is retained/);
});

test('shelf ledges scroll with compact tapes at desktop and phone widths', () => {
  assert.match(css, /\.library-shelves \{[^}]*overflow: auto/);
  assert.match(css, /\.library-shelf-row \{[^}]*align-items: end/);
  assert.match(css, /\.library-tape, \.library-folder-card \{ position: relative; z-index: 0; align-self: end/);
  assert.match(css, /\.library-tape::after, \.library-folder-card::after \{[^}]*bottom: -10px/);
  assert.match(css, /\.library-artwork-label \{ display:none; \}/);
  assert.match(renderer, /captionDetail\.textContent = view\.collection \? [^\n]* : subtitle/);
  assert.match(css, /\.library-artwork-frame \{ width:min\(100%,104px\); aspect-ratio:2 \/ 3; \}/);
  assert.match(css, /@media \(max-width:760px\) \{ \.library-artwork-frame \{ width:min\(100%,100px\); \}/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.library-shelf-row \{ grid-template-columns: repeat\(auto-fill,minmax\(102px,1fr\)/);
  assert.match(css, /\.library-import-progress-items|\.library-import-items/);
});

test('every on-screen display is anchored to the tube and blended through the CRT shader without VHS tracking', () => {
  for (const name of ['drawOsdPause', 'drawOsdChannel', 'drawOsdVolume', 'drawOsdMute', 'drawOsdSearching', 'drawOsdCaption']) {
    assert.match(renderer, new RegExp(`function ${name}\\(context, safe`), `${name} draws on the OSD layer`);
  }
  assert.doesNotMatch(renderer, /osdPictureRect/, 'video framing must not move or resize the OSD');
  assert.match(renderer, /uniform sampler2D osd; uniform float osdOn;/);
  assert.match(renderer, /vec2 screenT=t;float row=/, 'the OSD samples the curved position before VHS jitter');
  assert.match(renderer, /o=osdSample\(screenT,blurRadius\)/, 'the OSD shares the edge blur');
  assert.match(renderer, /col=col\*\(1\.0-o\.a\)\+vec3\(oR\.r,o\.g,oB\.b\);[\s\S]*col=hueTurn/, 'hue, picture mode, scanlines and glow follow the OSD blend');
  assert.match(renderer, /col\*=1\.0-dropout\*\(1\.0-osdAlpha\)/, 'tape dropout and snow stay under the OSD');
  assert.match(renderer, /gl\.pixelStorei\(gl\.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true\)/);
  assert.match(css, /#stage \.channel-surf-overlay,#stage \.volume-overlay,#stage \.mute-overlay,#stage \.searching-indicator,#stage \.caption \{ opacity:0 !important;/);
});

test('OSD position and font scale depend only on screen dimensions, not programme aspect ratio', () => {
  const source = renderer.match(/function osdSafeRect\(width, height\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context = vm.createContext({});
  vm.runInContext(source, context);
  for (const [width, height] of [[1280, 960], [1920, 1080], [800, 600]]) {
    const expected = { x: width * 0.12, y: height * 0.12, width: width * 0.76, height: height * 0.76, unit: height };
    for (const aspect of [4 / 3, 16 / 9, 2.35, 9 / 16]) {
      context.osdPictureRect = { x: 90, y: 120, width: height * aspect, height: height / aspect };
      context.width = width;
      context.height = height;
      const actual = vm.runInContext('osdSafeRect(width, height)', context);
      assert.deepEqual({ ...actual }, expected);
    }
  }
});
