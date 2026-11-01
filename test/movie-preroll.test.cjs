const test = require('node:test');
const assert = require('node:assert/strict');
const { isFeatureMovie, selectMovieTrailers } = require('../movie-preroll.cjs');

test('movie cutoff is strictly longer than 59 minutes', () => {
  assert.equal(isFeatureMovie(59 * 60), false);
  assert.equal(isFeatureMovie(59 * 60 + 1), true);
});

test('trailer selection chooses 4–7 unique clips and gracefully uses a smaller pool', () => {
  const trailers = Array.from({ length: 9 }, (_, i) => ({ path: `/trailers/${i}.mp4`, url: `local:${i}` }));
  const selected = selectMovieTrailers(trailers, () => 0.5, '/movie.mp4');
  assert.ok(selected.length >= 4 && selected.length <= 7);
  assert.equal(new Set(selected.map(item => item.path)).size, selected.length);
  assert.deepEqual(selectMovieTrailers(trailers.slice(0, 3), () => 0, '/movie.mp4').length, 3);
  assert.equal(selectMovieTrailers([{ path: '/movie.mp4', url: 'self' }], () => 0, '/movie.mp4').length, 0);
});
