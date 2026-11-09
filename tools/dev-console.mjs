import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nextVersion } from './version-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkgText = fs.readFileSync(pkgPath, 'utf8');
const lockText = fs.readFileSync(lockPath, 'utf8');
const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);
const action = (process.argv[2] || 'next').toLowerCase();
if (!['next', 'patch', 'current'].includes(action)) throw new Error('Use next (or legacy patch alias) or current for an isolated local candidate.');
const version = action === 'current' ? pkg.version : nextVersion(pkg.version);
const out = path.resolve(process.env.SATURDAY_TUBE_BUILD_OUTPUT || path.join(root, 'dist', 'candidates', version));
if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`Refusing to overwrite non-empty candidate output: ${out}`);

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'without an exit code'}`);
}

console.log(`Saturday Tube 2 Developer Console · ${pkg.version} → ${version}`);
console.log('LOCAL CANDIDATE ONLY — no install, GitHub upload, website deploy, or update-feed change.');
try {
  run('npm', ['test']);
  pkg.version = version;
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  fs.mkdirSync(out, { recursive: true });
  run('npm', ['run', 'package:mac'], { ...process.env, SATURDAY_TUBE_BUILD_OUTPUT: out });
  console.log(`Candidate ${version} staged under ${out}; launch it only with a separate test profile.`);
  console.log('Official publishing and in-app updates are not configured by this console.');
} catch (error) {
  fs.writeFileSync(pkgPath, pkgText);
  fs.writeFileSync(lockPath, lockText);
  throw error;
}
