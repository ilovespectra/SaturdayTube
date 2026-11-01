const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');

function insideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function reportProgress(onProgress, copiedBytes, totalBytes) {
  try { onProgress?.({ copiedBytes, totalBytes }); } catch { /* Progress UI must never interrupt a safe file copy. */ }
}

async function copyFileWithProgress(source, destination, totalBytes, onProgress) {
  const input = createReadStream(source, { highWaterMark: 1024 * 1024 });
  const output = createWriteStream(destination, { flags: 'wx', highWaterMark: 1024 * 1024 });
  let destinationCreated = false;
  let copiedBytes = 0;
  let lastReportedAt = 0;
  output.once('open', () => { destinationCreated = true; });
  input.on('data', chunk => {
    copiedBytes += chunk.length;
    const now = Date.now();
    if (now - lastReportedAt >= 120) {
      lastReportedAt = now;
      reportProgress(onProgress, copiedBytes, totalBytes);
    }
  });
  try {
    await pipeline(input, output);
    reportProgress(onProgress, copiedBytes, totalBytes);
  } catch (error) {
    if (destinationCreated) await fs.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
}

async function copyFileIntoShelf(sourcePath, shelfPath, { onProgress } = {}) {
  const [source, shelf] = await Promise.all([
    fs.realpath(sourcePath),
    fs.realpath(shelfPath)
  ]);
  const [sourceStat, shelfStat] = await Promise.all([fs.stat(source), fs.stat(shelf)]);
  if (!sourceStat.isFile()) throw new Error('The selected item is not a file.');
  if (!shelfStat.isDirectory()) throw new Error('The selected shelf destination is not a folder.');
  if (insideDirectory(shelf, source)) return { path: source, copied: false };

  const filename = path.basename(source);
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length);
  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const candidateName = suffix === 0 ? filename : `${stem} (${suffix + 1})${extension}`;
    const destination = path.join(shelf, candidateName);
    try {
      await copyFileWithProgress(source, destination, sourceStat.size, onProgress);
      return { path: destination, copied: true };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`Could not choose a unique shelf filename for ${filename}.`);
}

async function removeFileFromShelf(filePath, shelfPath) {
  const fileStat = await fs.lstat(filePath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error('Only regular managed tape files can be ejected.');
  const [shelf, requested] = await Promise.all([
    fs.realpath(shelfPath),
    fs.realpath(filePath)
  ]);
  const shelfStat = await fs.stat(shelf);
  if (!shelfStat.isDirectory()) throw new Error('The managed shelf is not a folder.');
  if (!insideDirectory(shelf, requested) || requested === shelf) throw new Error('That file is outside the managed shelf.');
  await fs.unlink(requested);
  return { path: requested, removed: true };
}

module.exports = { copyFileIntoShelf, removeFileFromShelf };
