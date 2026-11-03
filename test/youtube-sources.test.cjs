const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_STARTERS, parseYouTubeSource, normalizeStarterConfigurations, serializeStarterConfigurations } = require('../youtube-sources.js');

test('first-run starters use the supplied playlists and original display labels', () => {
  const starters = normalizeStarterConfigurations([]);
  assert.deepEqual(starters.map(({ id, name, program, commercials }) => ({ id, name, program, commercials })), [
    { id: 'vh1', name: 'Mixtape Rewind', program: { kind: 'playlist', id: 'PLiy0XOfUv4hFH2HbflPOARBXA6qN90mHt' }, commercials: { kind: 'video', id: 'L0CQEEtaoY0' } },
    { id: 'mtv', name: 'Jam Sessions', program: { kind: 'playlist', id: 'PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i' }, commercials: { kind: 'playlist', id: 'PLLVo3pOp9VjWrqo6pL8iH4QyZ-HklpCoP' } },
    { id: 'pbs-kids', name: 'Storytime Garden', program: { kind: 'playlist', id: 'PLRM5fZauTNuA' }, commercials: { kind: 'playlist', id: 'PLn5YyF5x2FFvPkw40Q07AD5b-dN9W5LC4' } },
    { id: 'nick', name: 'Bubble Bay', program: { kind: 'playlist', id: 'PLpsOhwH8agOW5fwcWufaifhMs8j4X5rmi' }, commercials: { kind: 'playlist', id: 'PLWHVjbPtMDwZjCm3pZqMgPCNJ1dt0_gWA' } }
  ]);
  assert.equal(DEFAULT_STARTERS.length, 4);
});

test('accepts public video, playlist, and legacy Arthur show URLs', () => {
  assert.deepEqual(parseYouTubeSource('https://youtu.be/abcdefghijk'), { kind: 'video', id: 'abcdefghijk' });
  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/watch?v=abcdefghijk'), { kind: 'video', id: 'abcdefghijk' });
  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/watch?v=abcdefghijk&list=PL1234567890'), { kind: 'playlist', id: 'PL1234567890' });
  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/playlist?list=PL1234567890', { playlistOnly: true }), { kind: 'playlist', id: 'PL1234567890' });
  assert.deepEqual(parseYouTubeSource('https://www.youtube.com/show/VLPLRM5fZauTNuA?sbp=KgtBZGVCd0l5NDkwRUAB'), { kind: 'playlist', id: 'PLRM5fZauTNuA' });
  assert.equal(parseYouTubeSource('https://www.youtube.com/show/VLPLRM5fZauTNuA').kind, 'playlist');
});

test('rejects non-YouTube URLs, unsafe schemes, malformed IDs, and video-only ad sources', () => {
  for (const value of ['https://example.com/watch?v=abcdefghijk', 'javascript:alert(1)', 'https://youtu.be/short', 'not a URL']) {
    assert.equal(parseYouTubeSource(value), null, value);
  }
  assert.equal(parseYouTubeSource('https://youtu.be/abcdefghijk', { playlistOnly: true }), null);
});

test('persists recognized program and video-break sources while discarding unknown starter keys', () => {
  const rows = normalizeStarterConfigurations([
    { id: 'vh1', programUrl: 'https://www.youtube.com/playlist?list=PL1234567890', commercialsUrl: 'https://youtu.be/abcdefghijk' },
    { id: 'custom', programUrl: 'https://youtu.be/abcdefghijk' }
  ]);
  const vh1 = rows.find(row => row.id === 'vh1');
  assert.equal(vh1.program.kind, 'playlist');
  assert.deepEqual(vh1.commercials, { kind: 'video', id: 'abcdefghijk' });
  assert.equal(rows.some(row => row.id === 'custom'), false);
  assert.deepEqual(serializeStarterConfigurations(rows).find(row => row.id === 'vh1'), {
    id: 'vh1',
    programUrl: 'https://www.youtube.com/playlist?list=PL1234567890',
    commercialsUrl: 'https://www.youtube.com/watch?v=abcdefghijk'
  });
});
