const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { copyFileIntoShelf } = require('../shelf-storage.cjs');

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

test('non-files and non-folder destinations are rejected', async t => {
  const { shelf, sourceDir } = await fixture(t);
  await assert.rejects(copyFileIntoShelf(sourceDir, shelf), /not a file/);
  const source = path.join(sourceDir, 'Movie.mp4');
  await fs.writeFile(source, 'bytes');
  await assert.rejects(copyFileIntoShelf(source, source), /not a folder/);
});
