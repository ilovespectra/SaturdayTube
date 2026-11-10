import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('application metadata and documentation use the canonical project URLs', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.homepage, 'https://st.kolektivkrog.si/');
  assert.equal(pkg.repository.url, 'https://github.com/ilovespectra/SaturdayTube.git');

  const readme = read('README.md');
  assert.match(readme, /https:\/\/st\.kolektivkrog\.si\//);
  assert.match(readme, /https:\/\/github\.com\/ilovespectra\/SaturdayTube\/releases/);
  assert.doesNotMatch(readme, /saturday-tube-2/);
});

test('landing page canonical, release, and counter URLs target the current site and repo', () => {
  const site = read('saturday-tube-site/index.html');
  assert.match(site, /<link rel="canonical" href="https:\/\/st\.kolektivkrog\.si\/">/);
  assert.match(site, /https:\/\/github\.com\/ilovespectra\/SaturdayTube\/releases/);
  assert.match(site, /const repository = 'ilovespectra\/SaturdayTube'/);
  assert.doesNotMatch(site, /saturday-tube-2/);
});
