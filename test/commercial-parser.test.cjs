const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCommercialFolder, parseLabelReply, needsSplit, ruleLabel, MANIFEST_NAME } = require('../commercial-parser.cjs');

test('reel detection and labels', () => {
  assert.equal(needsSplit('Lunchables.mp4', 30), false);
  assert.equal(needsSplit('90s commercials 1996.mp4', 600), true);
  assert.equal(needsSplit('ad break.mp4', 50), true);
  assert.equal(ruleLabel(5), 'bumper');
  assert.equal(ruleLabel(30), 'ad');
  assert.deepEqual(parseLabelReply('{"kind":"Intro","title":"Rugrats"}'), { kind: 'intro', title: 'Rugrats' });
  assert.equal(parseLabelReply('no idea'), null);
});

test('splits a reel, drops credits, trashes original, and catches up only once', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-'));
  fs.writeFileSync(path.join(folder, 'commercials 1995.mp4'), 'reel');
  fs.writeFileSync(path.join(folder, 'Single spot.mp4'), 'one');
  let encodes = 0;
  const removed = [];
  const service = {
    getFFmpegCapabilities: async () => ({ executable: '/bin/false' }),
    probeDuration: async file => file.endsWith('Single spot.mp4') ? 30 : file.includes('commercials 1995') ? 90 : 30,
    detectBlackIntervals: async () => [{ start: 29.9, end: 30.1, duration: 0.2, quiet: true }, { start: 59.9, end: 60.1, duration: 0.2, quiet: true }],
    encodeClip: async (source, start, end, out) => { encodes += 1; fs.writeFileSync(out, 'clip'); }
  };
  let calls = 0;
  const labeler = async () => (++calls === 3 ? { kind: 'credits', title: '' } : { kind: 'ad', title: 'Toy' });
  const result = await parseCommercialFolder(folder, { service, labeler, frames: async () => ['x'], remove: async file => { removed.push(file); fs.unlinkSync(file); } });
  assert.equal(result.split, 1);
  assert.equal(result.clips, 2);
  assert.equal(removed.length, 1);
  const files = fs.readdirSync(folder).filter(name => !name.startsWith('.')).sort();
  assert.deepEqual(files, ['Single spot.mp4', 'ad - Toy - commercials 1995 #01.mp4', 'ad - Toy - commercials 1995 #02.mp4']);
  assert.ok(fs.existsSync(path.join(folder, MANIFEST_NAME)));
  const again = await parseCommercialFolder(folder, { service, labeler, remove: async () => assert.fail('nothing to remove') });
  assert.equal(again.split, 0);
  assert.equal(encodes, 3);
});
