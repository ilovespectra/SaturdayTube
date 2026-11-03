const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseMetadataFilename } = require('../metadata-service.cjs');

const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const fn = source.match(/function groupLibraryTapes\(files\) \{[\s\S]*?\n\}/)[0];
const group = vm.runInNewContext(`${fn}; groupLibraryTapes`, {
  window: { tube: { parseMetadataFilename } }
});

test('obvious episode names become one show with naturally ordered episodes', () => {
  const files = ['Friends.S01E10.mkv', 'Friends.S01E02.mkv', 'Friends.S02E01.mkv',
    'Movie.1991.mp4', 'Other.Show.S01E01.mkv'].map(name => ({ name, path: `/tapes/${name}` }));
  const result = group(files);
  assert.equal(result.collections.length, 1);
  assert.equal(result.collections[0].name, 'Friends');
  assert.deepEqual(Array.from(result.collections[0].items, item => item.name),
    ['Friends.S01E02.mkv', 'Friends.S01E10.mkv', 'Friends.S02E01.mkv']);
  assert.equal(result.singles.length, 2);
  assert.equal(files[0].name, 'Friends.S01E10.mkv', 'grouping never reorders the source listing');
});

test('ambiguous filenames remain individual tapes and different shows never merge', () => {
  const files = ['Holiday 1.mp4', 'Holiday 2.mp4', 'Friends.S01E01.mkv', 'Frasier.S01E01.mkv']
    .map(name => ({ name, path: name }));
  const result = group(files);
  assert.equal(result.collections.length, 0);
  assert.equal(result.singles.length, files.length);
});
