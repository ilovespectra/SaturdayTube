const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const renderer = readFileSync(path.join(root, 'renderer.js'), 'utf8');
const css = readFileSync(path.join(root, 'styles.css'), 'utf8');
const main = readFileSync(path.join(root, 'main.cjs'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Picture Lab exposes seven adjustable effects including Glow and Glare', () => {
  assert.match(html, /PICTURE LAB <span>7 EXTRA DIALS<\/span>/);
  for (const dial of ['edgeBlur', 'hue', 'vhsScan', 'glitch', 'brokenTape', 'glow', 'glare']) {
    assert.match(html, new RegExp(`id="${dial}"`));
    assert.match(renderer, new RegExp(`document\\.querySelector\\('#${dial}'\\)`));
  }
  assert.match(renderer, /const pictureDials = \[scanlineDial, curveDial, edgeBlurDial, hueDial, vhsScanDial, glitchDial, brokenTapeDial, glowDial, glareDial\]/);
  assert.match(renderer, /uniform float glow/);
  assert.match(renderer, /uniform float glare/);
  assert.match(renderer, /col\+=bloom\*glow\*0\.12/);
  assert.match(renderer, /getUniformLocation\(glProgram, 'glow'\)/);
  assert.match(renderer, /Object\.fromEntries\(allDials\.map/);
});

test('all cabinet finishes carry through the television hardware', () => {
  const finishes = ['wood', 'grey', 'black', 'clear', 'yellow', 'red', 'green', 'blue'];
  for (const finish of finishes) {
    assert.match(html, new RegExp(`data-finish="${finish}"`));
    assert.match(renderer, new RegExp(`'${finish}'`));
  }
  for (const finish of ['yellow', 'red', 'green', 'blue']) {
    assert.match(css, new RegExp(`body\\[data-finish="${finish}"\\]`));
    assert.match(css, new RegExp(`\\.tv-set\\[data-finish="${finish}"\\] \\.control-panel`));
    assert.match(css, /\.tv-set\[data-finish\] \.deck-module/);
  }
  assert.match(html, /CASE FINISH/);
});

test('later redesign-only sections and controls are absent', () => {
  for (const removed of ['fullscreenSeek', 'tapeShelf', 'powerButton', 'audioSource', 'rcaSelector', 'fullscreen-pause-indicator', 'transport-label']) {
    assert.doesNotMatch(html, new RegExp(removed, 'i'));
  }
  assert.doesNotMatch(html, /RCA INPUT|AUX|STATIC SECTION/i);
  assert.match(html, /class="screen-corner"/);
  assert.doesNotMatch(html, /NTSC\s*[·.]\s*60\s*HZ/i);
  assert.match(html, /class="playlist-panel"/);
  assert.match(html, /class="deck-module"/);
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
  for (const id of ['video', 'playButton', 'previousButton', 'nextButton', 'seek', 'audioTracks', 'subtitleTracks', 'subtitleButton', 'libraryButton']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /saturdayTube\.playlists\.v1/);
  assert.match(renderer, /saturdayTube\.controls\.v1/);
  assert.match(main, /ipcMain\.handle\('open-videos'/);
  assert.match(main, /ipcMain\.handle\('open-library-files'/);
  assert.match(main, /ipcMain\.handle\('open-subtitle'/);
  assert.match(main, /ipcMain\.handle\('transcode-media', transcodeMedia\)/);
  assert.match(main, /h264_videotoolbox/);
  assert.doesNotMatch(main, /libx264/);
  assert.doesNotMatch(main, /\/opt\/homebrew\/bin\/ffmpeg|\/usr\/local\/bin\/ffmpeg/);
  assert.match(main, /app\.isPackaged \? 'Saturday Tube Candidate' : 'Saturday Tube Dev'/);
  assert.match(main, /path\.join\(process\.resourcesPath, 'ffmpeg'\)/);
  assert.match(main, /path\.join\(__dirname, 'vendor', 'ffmpeg', 'ffmpeg'\)/);
  assert.match(renderer, /window\.tube\.transcodeMedia\(track\.id\)/);
  assert.match(main, /MAX_TRANSCODE_CACHE_BYTES = 3 \* 1024 \*\* 3/);
});

test('release metadata targets the next 0.8 patch and keeps the ARM build path', () => {
  assert.equal(pkg.version, '0.8.5');
  assert.match(pkg.scripts['package:mac'], /build-package/);
  const build = readFileSync(path.join(root, 'build-package.mjs'), 'utf8');
  assert.match(build, /arm64/);
  assert.match(build, /com\.ilovespectra\.saturdaytube\.candidate/);
});

test('briefly shows the current video file extension when playback begins', () => {
  assert.match(html, /id="fileExtensionBadge"[^>]*hidden/);
  assert.match(renderer, /function showFileExtension\(\)/);
  assert.match(renderer, /extensionBadge\.textContent = match\[1\]\.toUpperCase\(\)/);
  assert.match(renderer, /setTimeout\(hideFileExtension, 2300\)/);
  assert.match(renderer, /if \(!currentTrackStarted\) \{ showFileExtension\(\); currentTrackStarted = true; \}/);
});

test('pause OSD is composited into the picture before CRT processing', () => {
  assert.match(renderer, /const compositeCanvas = document\.createElement\('canvas'\)/);
  assert.match(renderer, /compositeContext\.drawImage\(video, x, y, viewWidth, viewHeight\)/);
  assert.match(renderer, /compositeContext\.fillText\('PAUSE'/);
  assert.match(renderer, /compositeContext\.fillRect\(barsX, barTop, barWidth, barHeight\)/);
  assert.match(renderer, /compositeContext\.fillRect\(barsX \+ barWidth/);
  assert.match(renderer, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, compositeCanvas\)/);
  assert.match(renderer, /paused !== lastCompositePaused/);
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

test('the final playable queued tape shuts off the retained CRT picture', () => {
  assert.match(renderer, /function findNextPlayableTrack\(startIndex\)/);
  assert.match(renderer, /if \(nextIndex >= 0\) playTrack\(nextIndex\);\s*else shutOffPicture\(\);/);
  assert.match(renderer, /stage\.classList\.add\('shutting-off'\)/);
  assert.match(css, /\.stage\.shutting-off canvas/);
  assert.match(css, /@keyframes crt-picture-shutoff/);
});

test('the screen fills a centered 4:3 aperture and the deck is built in', () => {
  assert.match(css, /width: 100%; max-width: none; height: auto; max-height: 100%; min-height: 0; aspect-ratio: 4 \/ 3; margin: 0;/);
  assert.match(css, /\.screen-bezel \{\s*display: flex; align-items: center; justify-content: center/);
  assert.match(html, /class="deck-module"/);
  assert.doesNotMatch(html, /class="cabinet-foot"|class="vhs-deck"/);
});

test('all user-adjustable dials span 0–100 and TV bypasses stay independent', () => {
  for (const dial of ['volume', 'scanlines', 'curve', 'edgeBlur', 'hue', 'vhsScan', 'glitch', 'brokenTape', 'glow', 'glare', 'fxAmount']) {
    const tag = html.match(new RegExp(`<button id="${dial}"[^>]+>`))?.[0];
    assert.ok(tag, `${dial} control exists`);
    assert.match(tag, /aria-valuemin="0"/);
    assert.match(tag, /aria-valuemax="100"/);
  }
  for (const id of ['videoBypassToggle', 'audioBypassToggle', 'crtToggle']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(renderer, /videoFiltersEnabled = !videoFiltersEnabled/);
  assert.match(renderer, /audioFiltersEnabled = !audioFiltersEnabled/);
  assert.match(renderer, /tvFiltersEnabled = !tvFiltersEnabled/);
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
  assert.match(renderer, /video\.play\(\)\.catch\(\(\) => \{\}\)/);
});

test('metadata lookup caches results and leaves unmatched titles honest', () => {
  assert.match(main, /api\.tvmaze\.com\/search\/shows/);
  assert.match(main, /en\.wikipedia\.org\/w\/rest\.php\/v1\/search\/page/);
  assert.match(main, /setTimeout\(\(\) => controller\.abort\(\), 6500\)/);
  assert.match(renderer, /saturdayTube\.metadata\.v1/);
  assert.match(renderer, /NO MATCH · FILE NAME RETAINED/);
  assert.match(renderer, /FILE NAME RETAINED/);
});

test('maximum tape faults remain deliberately gentle and Glare has no fixed stripe', () => {
  assert.match(renderer, /0\.006\*glitch/);
  assert.match(renderer, /glitch\*0\.012/);
  assert.match(renderer, /broken\*0\.14/);
  assert.match(renderer, /broken\*0\.012/);
  assert.doesNotMatch(css, /linear-gradient\(110deg, #fff0 34%, #eaffd010 47%, #fff0 58%\)/);
  assert.match(renderer, /uniform float glare/);
});

test('playlist removal never deletes source media', () => {
  assert.match(html, /id="deletePlaylistButton"/);
  assert.match(renderer, /Delete the playlist .*?video files will stay on disk/);
  assert.match(renderer, /Remove from this playlist/);
  assert.doesNotMatch(renderer, /unlink\(|rmSync|fs\.promises\.rm/);
});

test('clear finish is drawn as hardware and library media as VHS shells', () => {
  assert.doesNotMatch(css, /url\("saturday:\/\/app\/assets\/materials\/(?:philips-chassis|clear-gameboy)\.jpg"\)/);
  assert.match(css, /\.tv-set\[data-finish\] \.dial-face/);
  assert.match(css, /\.tv-set\[data-finish="clear"\] \.control-panel \{ background:radial-gradient/);
  assert.match(css, /\.library-cassette \{ width:min\(100%,180px\); height:78px/);
  assert.match(css, /\.library-cassette i \{ top:31px; width:23px; height:23px/);
  assert.match(renderer, /cassetteLabel\.textContent = 'VHS VIDEO'/);
});
