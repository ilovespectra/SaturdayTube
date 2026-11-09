import test from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion } from '../tools/version-policy.mjs';

test('Saturday Tube version policy rolls digits and normalizes legacy versions upward', () => {
  assert.equal(nextVersion('1.0.8'), '1.0.9');
  assert.equal(nextVersion('1.0.9'), '1.1.0');
  assert.equal(nextVersion('1.9.9'), '2.0.0');
  assert.equal(nextVersion('1.0.13'), '1.1.0');
});

test('Saturday Tube version policy rejects malformed inputs', () => {
  assert.throws(() => nextVersion('1.0'), /stable x.y.z/);
});
