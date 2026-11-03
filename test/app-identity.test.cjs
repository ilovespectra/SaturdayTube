const assert = require('node:assert/strict');
const test = require('node:test');
const { configureAppIdentity } = require('../app-identity.cjs');

function fakeApp({ isPackaged, initialName = 'Saturday Tube', appData = '/Users/test/Library/Application Support' }) {
  const calls = [];
  const paths = { appData, userData: '/default/user-data' };
  const app = {
    isPackaged,
    name: initialName,
    setName(name) { calls.push(['setName', name]); this.name = name; },
    getName() { return this.name; },
    getPath(name) { calls.push(['getPath', name]); return paths[name]; },
    setPath(name, value) { calls.push(['setPath', name, value]); paths[name] = value; }
  };
  return { app, calls, paths };
}

test('packaged Candidate sets a distinct name and userData path before profile access', () => {
  const { app, calls, paths } = fakeApp({ isPackaged: true });
  const configured = configureAppIdentity({
    app,
    executablePath: '/Applications/Saturday Tube Candidate.app/Contents/MacOS/Saturday Tube Candidate',
    env: {}
  });

  assert.equal(configured.isCandidateBuild, true);
  assert.equal(configured.displayName, 'Saturday Tube Candidate');
  assert.equal(configured.userDataPath, '/Users/test/Library/Application Support/Saturday Tube Candidate');
  assert.equal(paths.userData, configured.userDataPath);
  assert.deepEqual(calls.slice(0, 3), [
    ['setName', 'Saturday Tube Candidate'],
    ['getPath', 'appData'],
    ['setPath', 'userData', configured.userDataPath]
  ]);
});

test('Candidate verification can use an explicitly isolated fresh profile', () => {
  const { app, calls, paths } = fakeApp({ isPackaged: true });
  const configured = configureAppIdentity({
    app,
    executablePath: '/build/Saturday Tube Candidate',
    env: { SATURDAY_TUBE_CANDIDATE_PROFILE_DIR: '/tmp/saturday-tube-fresh-profile' }
  });

  assert.equal(configured.userDataPath, '/tmp/saturday-tube-fresh-profile');
  assert.equal(paths.userData, configured.userDataPath);
  assert.equal(calls.some(([operation, name]) => operation === 'getPath' && name === 'userData'), false);
});

test('development and release builds keep their existing profile identities', () => {
  const dev = fakeApp({ isPackaged: false });
  const devConfigured = configureAppIdentity({ app: dev.app, executablePath: '/node_modules/electron/Electron', env: {} });
  assert.equal(devConfigured.displayName, 'Saturday Tube Dev');
  assert.equal(dev.calls.some(([operation]) => operation === 'setPath'), false);

  const release = fakeApp({ isPackaged: true, initialName: 'Saturday Tube' });
  const releaseConfigured = configureAppIdentity({
    app: release.app,
    executablePath: '/Applications/Saturday Tube.app/Contents/MacOS/Saturday Tube',
    env: {}
  });
  assert.equal(releaseConfigured.displayName, 'Saturday Tube');
  assert.equal(releaseConfigured.isCandidateBuild, false);
  assert.equal(release.calls.some(([operation]) => operation === 'setPath'), false);
});
