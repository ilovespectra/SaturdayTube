const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

function insideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function copyFileIntoShelf(sourcePath, shelfPath) {
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
      await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
      return { path: destination, copied: true };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`Could not choose a unique shelf filename for ${filename}.`);
}

module.exports = { copyFileIntoShelf };
