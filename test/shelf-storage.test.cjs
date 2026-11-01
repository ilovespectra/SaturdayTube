const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { copyFileIntoShelf, removeFileFromShelf } = require('../shelf-storage.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saturday-tube-shelf-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const shelf = path.join(root, 'Shelf');
  const sourceDir = path.join(root, 'Source');
  await Promise.all([fs.mkdir(shelf), fs.mkdir(sourceDir)]);
  return { root, shelf, sourceDir };
}

test('imports make a local copy without changing the source', async t => {
  const { shelf, sourceDir } = await fixture(t);
  const source = path.join(sourceDir, 'Saturday.mp4');
  await fs.writeFile(source, Buffer.from('original video bytes'));
  const result = await copyFileIntoShelf(source, shelf);
  assert.deepEqual(result, { path: path.join(await fs.realpath(shelf), 'Saturday.mp4'), copied: true });
  assert.equal(await fs.readFile(source, 'utf8'), 'original video bytes');
  assert.equal(await fs.readFile(result.path, 'utf8'), 'original video bytes');
});

test('name collisions get a new filename and never overwrite shelf media', async t => {
  const { shelf, sourceDir } = await fixture(t);
  const source = path.join(sourceDir, 'Movie.mkv');
  await Promise.all([
    fs.writeFile(source, 'new source'),
    fs.writeFile(path.join(shelf, 'Movie.mkv'), 'existing shelf copy')
  ]);
  const result = await copyFileIntoShelf(source, shelf);
  assert.deepEqual(result, { path: path.join(await fs.realpath(shelf), 'Movie (2).mkv'), copied: true });
  assert.equal(await fs.readFile(path.join(shelf, 'Movie.mkv'), 'utf8'), 'existing shelf copy');
  assert.equal(await fs.readFile(result.path, 'utf8'), 'new source');
  assert.equal(await fs.readFile(source, 'utf8'), 'new source');
});

test('a tape already inside the shelf is reused without another copy', async t => {
  const { shelf } = await fixture(t);
  const source = path.join(shelf, 'Already here.mp4');
  await fs.writeFile(source, 'local bytes');
  const result = await copyFileIntoShelf(source, shelf);
  assert.deepEqual(result, { path: await fs.realpath(source), copied: false });
  assert.equal(await fs.readFile(source, 'utf8'), 'local bytes');
});

test('copy reports per-tape byte progress and preserves the exact media bytes', async t => {
  const { shelf, sourceDir } = await fixture(t);
  const source = path.join(sourceDir, 'Progress.mp4');
  const bytes = Buffer.alloc(512 * 1024, 0x5a);
  const reports = [];
  await fs.writeFile(source, bytes);
  const result = await copyFileIntoShelf(source, shelf, { onProgress: report => reports.push(report) });
  assert.equal(result.copied, true);
  assert.ok(reports.length > 0);
  assert.deepEqual(reports.at(-1), { copiedBytes: bytes.length, totalBytes: bytes.length });
  assert.deepEqual(await fs.readFile(result.path), bytes);
});

test('non-files and non-folder destinations are rejected', async t => {
  const { shelf, sourceDir } = await fixture(t);
  await assert.rejects(copyFileIntoShelf(sourceDir, shelf), /not a file/);
  const source = path.join(sourceDir, 'Movie.mp4');
  await fs.writeFile(source, 'bytes');
  await assert.rejects(copyFileIntoShelf(source, source), /not a folder/);
});

test('eject removes only a regular tape inside the managed shelf', async t => {
  const { shelf, sourceDir } = await fixture(t);
  const original = path.join(sourceDir, 'Original.mp4');
  const managed = path.join(shelf, 'Original.mp4');
  await Promise.all([fs.writeFile(original, 'original bytes'), fs.writeFile(managed, 'local bytes')]);
  const managedRealPath = await fs.realpath(managed);
  assert.deepEqual(await removeFileFromShelf(managed, shelf), { path: managedRealPath, removed: true });
  await assert.rejects(fs.access(managed), { code: 'ENOENT' });
  assert.equal(await fs.readFile(original, 'utf8'), 'original bytes');
});

test('eject refuses files outside the managed shelf and symlinks', async t => {
  const { shelf, sourceDir } = await fixture(t);
  const outside = path.join(sourceDir, 'Keep.mp4');
  const linked = path.join(shelf, 'Linked.mp4');
  await fs.writeFile(outside, 'must stay');
  await fs.symlink(outside, linked);
  await assert.rejects(removeFileFromShelf(outside, shelf), /outside the managed shelf/);
  await assert.rejects(removeFileFromShelf(linked, shelf), /regular managed tape files/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'must stay');
  assert.equal((await fs.lstat(linked)).isSymbolicLink(), true);
});
