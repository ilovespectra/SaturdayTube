const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'styles.css'), 'utf8');
const renderer = readFileSync(path.join(root, 'renderer.js'), 'utf8');

test('TV is a selectable input and transport keys control YouTube starters only', () => {
  assert.match(html, /class="signal-control input-source-control"[\s\S]*?id="inputButton"/);
  assert.match(html, /aria-label="Cycle input: video, static, TV, AUX"/);
  const modeRules = css.slice(css.lastIndexOf('/* Keep the set fixed'));
  assert.match(modeRules, /\.tv-set\[data-input="tv"\] \.playlist-panel,[\s\S]*?\.tv-set\[data-input="tv"\] \.tape-timeline \{ display:none !important; \}/);
  assert.doesNotMatch(modeRules, /\.tv-set\[data-input="tv"\] \.deck-module \{ display:none/);
  assert.doesNotMatch(modeRules, /\.tv-set:not\(\[data-input="tv"\]\) \.channel-panel/);
  assert.match(html, /class="channel-surf-control"[\s\S]*id="channelDownButton"[\s\S]*id="channelUpButton"/);
  assert.doesNotMatch(html, /id="channelSelect"|<select[^>]*aria-label="Select TV channel"/);
  assert.doesNotMatch(modeRules, /\.tv-set\[data-input="tv"\][^{]*\.transport-key\s*\{[^}]*display:none/);
  assert.match(renderer, /querySelectorAll\('\.under-screen \.transport-key'\)[\s\S]*?button\.disabled = selectedInput === 'aux' \|\| \(selectedInput === 'tv' && !youtubePlaying\)/);
  assert.match(renderer, /if \(selectedInput === 'tv'\) \{\s*if \(activeYoutubeStarter\(\)\) window\.SaturdayTubeYouTubePlayer\?\.togglePlayback\(\);/);
  assert.match(renderer, /if \(selectedInput === 'tv'\) \{\s*if \(activeYoutubeStarter\(\)\) window\.SaturdayTubeYouTubePlayer\?\.previous\(\);/);
  assert.match(renderer, /if \(selectedInput === 'tv'\) \{\s*if \(activeYoutubeStarter\(\)\) window\.SaturdayTubeYouTubePlayer\?\.next\(\);/);
  assert.match(renderer, /selectedInput !== 'tv' && Number\.isFinite\(video\.duration\)/);
  assert.match(renderer, /event\.code === 'Space' && selectedInput === 'tv'\) event\.preventDefault\(\)/);
  assert.match(renderer, /event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'\) && selectedInput === 'tv'\) event\.preventDefault\(\)/);
  assert.match(renderer, /const visibleInput = transitionStatic && transitionInput \? transitionInput : selectedInput;[\s\S]*?tvSet\.dataset\.input = visibleInput/);
  const inputSwitch = renderer.match(/function setInputSource\(source, save = true\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(inputSwitch, /applyInput\(\);/);
  assert.doesNotMatch(inputSwitch, /setTimeout|inputTransitionTimer/);
});

test('TV removes the now-showing title and only preserves picture during brief non-tuning gaps', () => {
  const modeRules = css.slice(css.lastIndexOf('/* Keep the set fixed'));
  assert.match(modeRules, /\.tv-set\[data-input="tv"\] \.picture-heading > div:first-child,[\s\S]*?\.tv-set\[data-input="tv"\] #timeCurrent,[\s\S]*?\.tv-set\[data-input="tv"\] #timeDuration,[\s\S]*?\.tv-set\[data-input="tv"\] \.stage \.empty-state \{ display:none !important; \}/);
  const frameLoop = renderer.match(/function frameLoop\(now\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(frameLoop, 'CRT compositor exists');
  assert.match(frameLoop, /const holdLastTVFrame = selectedInput === 'tv' && !tuning && !source && lastCompositeHasFrame/);
  assert.match(frameLoop, /else if \(tuning\) \{\s*drawChannelLoadingPicture\(width, height, now\)/);
  assert.match(frameLoop, /else if \(selectedInput !== 'tv' \|\| startupIntroActive\) \{\s*drawIntroPicture/);
  assert.match(frameLoop, /lastCompositeHasFrame = hasPicture/);
  assert.match(frameLoop, /const paused = selectedInput === 'video'/);
});

test('TV mode omits the VHS-loader hint from the intro picture', () => {
  const intro = renderer.match(/function drawIntroPicture\(width, height\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(intro, /if \(selectedInput !== 'tv' && tvSet\.dataset\.input !== 'tv'\) \{\s*context\.fillText\('Open the tape shelf from the VHS loader below'/);
  assert.match(renderer, /const sourceKey = source \|\| \(tuning \? 'channel-loading' : `intro-\$\{tvSet\.dataset\.input \|\| selectedInput\}`\)/);
  assert.match(renderer, /const pictureInput = tvSet\.dataset\.input \|\| selectedInput;\s*document\.querySelector\('#emptyState \.empty-copy'\)\.hidden = pictureInput === 'tv';[\s\S]*?pictureInput === 'tv'[\s\S]*?'CRT picture: A little Saturday magic\.'/);
});

test('the TV cabinet and its controls do not scroll', () => {
  const modeRules = css.slice(css.lastIndexOf('/* Keep the set fixed'));
  assert.match(modeRules, /html, body, \.room, \.tv-set, \.control-panel \{ overflow:hidden; overscroll-behavior:none; \}/);
  assert.match(modeRules, /\.control-panel \{ min-height:0; max-height:100%; \}/);
  assert.match(modeRules, /\.control-panel \{ overflow:hidden; \}/);
});

test('channel tuning clears the prior station frame without showing the landing page', () => {
  const switcher = renderer.match(/function selectActiveChannel\(id\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(switcher, 'channel selection handler exists');
  assert.match(switcher, /if \(changed\) clearChannelVideoForInputChange\(\)/);
  assert.match(switcher, /setTVSearching\(true\)/);
  assert.match(switcher, /void startActiveChannel\(\)/);
  const clear = renderer.match(/function clearChannelVideoForInputChange\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(clear, /const showLanding = startupIntroActive && selectedInput !== 'tv'/);
  assert.match(clear, /lastCompositeHasFrame = false/);
  assert.match(clear, /emptyState/);
  const modeRules = css.slice(css.lastIndexOf('/* Keep the set fixed'));
  assert.match(modeRules, /\.tv-set\[data-input="tv"\] \.stage \.empty-state \{ display:none !important; \}/);
});

test('the landing intro is confined to power-on, not later input or playback clears', () => {
  assert.match(renderer, /let startupIntroActive = true/);
  assert.match(renderer, /stage\.classList\.add\('startup-intro', 'booting'\)/);
  assert.match(renderer, /if \(save && startupIntroActive\) \{\s*startupIntroActive = false;\s*stage\.classList\.remove\('startup-intro'\)/);
  assert.match(renderer, /video\.addEventListener\('play', \(\) => \{\s*if \(window\.SaturdayIntermission\?\.active\) \{ video\.pause\(\); return; \}\s*if \(!isCurrentPlaybackEvent\(\)\) return;\s*if \(startupIntroActive\) \{\s*startupIntroActive = false/);
  assert.match(renderer, /video\.addEventListener\('playing', \(\) => \{[\s\S]*?if \(isCurrentChannelPlayback\(\)\) \{\s*setTVSearching\(false\);/);
  const clear = renderer.match(/function clearPlayback\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(clear, /startupIntroActive = false/);
  assert.match(clear, /const showLanding = startupIntroActive && selectedInput !== 'tv'/);
  const channelClear = renderer.match(/function clearChannelVideoForInputChange\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(channelClear, /const showLanding = startupIntroActive && selectedInput !== 'tv'/);
});

test('startup shows welcome first, then a separate dark searching state', () => {
  const startup = renderer.match(/function startStartupSequence\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  const searching = renderer.match(/function setTVSearching\([^\n]*\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(startup, 'startup sequence exists');
  assert.ok(searching, 'TV searching state exists');
  assert.match(startup, /stage\.classList\.add\('startup-intro', 'booting'\)/);
  assert.match(startup, /selectedInput === 'tv' && tvSearching && startupIntroActive[\s\S]*?startupIntroActive = false;[\s\S]*?stage\.classList\.remove\('startup-intro'\)[\s\S]*?setTVSearching\(true\)/);
  assert.match(searching, /const showSearching = tvSearching && !startupIntroActive/);
  assert.match(searching, /indicator\.hidden = !showSearching/);
  assert.match(searching, /stage\.classList\.toggle\('tv-loading', showSearching\)/);
  assert.match(css, /\.stage\.tv-loading \{ background:radial-gradient/);
});
