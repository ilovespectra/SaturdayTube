const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const preload = readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const main = readFileSync(path.join(root, 'main.cjs'), 'utf8');

test('sandboxed preload uses only the Electron bridge and registered IPC', () => {
  assert.doesNotMatch(preload, /require\(['"]\.{1,2}\//);
  assert.match(preload, /sendSync\(['"]parse-metadata-filename['"]/);
  assert.match(preload, /isDeveloperBuild: process\.defaultApp === true \|\| process\.argv\.includes\('--saturday-tube-developer-build'\)/);
  assert.match(main, /additionalArguments: app\.isPackaged \? \[\] : \['--saturday-tube-developer-build'\]/);
  assert.match(main, /ipcMain\.on\(['"]parse-metadata-filename['"]/);
  assert.match(main, /ipcMain\.handle\(['"]choose-library-folder['"]/);
  assert.match(main, /ipcMain\.handle\(['"]import-library-files['"]/);
  assert.match(preload, /invoke\(['"]get-managed-tape-shelf['"]\)/);
  assert.match(preload, /invoke\(['"]ensure-local-tape['"], filePath\)/);
  assert.match(preload, /invoke\(['"]eject-managed-tape['"], filePath\)/);
  assert.match(main, /ipcMain\.handle\(['"]ensure-local-tape['"], ensureLocalTape\)/);
  assert.match(main, /ipcMain\.handle\(['"]eject-managed-tape['"], ejectManagedTape\)/);
});
