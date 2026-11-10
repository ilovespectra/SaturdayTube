import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerReleaseTarget, parseGitHubRemote, selectOwnerVersion } from '../tools/release-draft-policy.mjs';

test('parses canonical HTTPS and SSH GitHub origin URLs', () => {
  assert.deepEqual(parseGitHubRemote('https://github.com/ilovespectra/SaturdayTube.git'), { owner: 'ilovespectra', repo: 'SaturdayTube' });
  assert.deepEqual(parseGitHubRemote('git@github.com:ilovespectra/SaturdayTube.git'), { owner: 'ilovespectra', repo: 'SaturdayTube' });
  assert.equal(parseGitHubRemote('https://example.com/ilovespectra/SaturdayTube'), null);
});

test('only the authenticated owner of the canonical repository enters draft mode', () => {
  const remote = 'https://github.com/ilovespectra/SaturdayTube.git';
  assert.deepEqual(ownerReleaseTarget('ilovespectra', remote), { owner: 'ilovespectra', repo: 'SaturdayTube' });
  assert.deepEqual(ownerReleaseTarget('ILOVESPECTRA', remote), { owner: 'ilovespectra', repo: 'SaturdayTube' });
  assert.equal(ownerReleaseTarget('collaborator', remote), null);
  assert.equal(ownerReleaseTarget('ilovespectra', 'https://github.com/ilovespectra/saturday-tube-2.git'), null);
  assert.equal(ownerReleaseTarget('ilovespectra', 'https://github.com/ilovespectra/other-project'), null);
});

test('preserves an existing release and resumes a version without a release tag', () => {
  assert.equal(selectOwnerVersion('0.8.9', ['v0.8.9']), '0.9.0');
  assert.equal(selectOwnerVersion('0.9.0', ['v0.8.9']), '0.9.0');
});
