import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { nextVersion } from './version-policy.mjs';
import { ownerReleaseTarget, selectOwnerVersion } from './release-draft-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkgText = fs.readFileSync(pkgPath, 'utf8');
const lockText = fs.readFileSync(lockPath, 'utf8');
const pkg = JSON.parse(pkgText);
const lock = JSON.parse(lockText);
const args = process.argv.slice(2);
const action = (args.find(arg => !arg.startsWith('--')) || 'next').toLowerCase();
const localOnly = args.includes('--local-only') || action === 'current';
const preflight = args.includes('--preflight');
if (!['next', 'patch', 'current'].includes(action)) throw new Error('Use next (or patch), current, or --preflight.');

function command(name, commandArgs, options = {}) {
  const result = spawnSync(name, commandArgs, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: options.timeout || 180000, input: options.input });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} ${commandArgs.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return (result.stdout || '').trim();
}
function run(name, commandArgs, env = process.env) {
  const result = spawnSync(name, commandArgs, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} ${commandArgs.join(' ')} exited ${result.status ?? 'without an exit code'}`);
}
function ownerTarget() {
  if (localOnly) return null;
  try {
    const remote = command('git', ['remote', 'get-url', 'origin']);
    const login = command('gh', ['api', 'user', '--jq', '.login']);
    return ownerReleaseTarget(login, remote);
  } catch {
    return null; // No owner-authenticated GitHub identity: keep the local-only path.
  }
}
function checkCleanMain() {
  const branch = command('git', ['branch', '--show-current']);
  if (branch !== 'main') throw new Error(`Owner release requires main, not ${branch}.`);
  if (command('git', ['status', '--porcelain'])) throw new Error('Owner release requires a clean worktree; pending user changes were left untouched.');
  command('git', ['fetch', 'origin', 'main']);
  if (command('git', ['rev-parse', 'HEAD']) !== command('git', ['rev-parse', 'origin/main'])) throw new Error('Local main differs from origin/main; sync it before an owner release.');
}
function generateNotes(version, tag) {
  const model = process.env.SATURDAY_TUBE_OLLAMA_MODEL || 'qwen2.5:3b';
  let commits = '';
  try { commits = command('git', ['log', '--format=%s', `${tag}..HEAD`]); } catch { /* No usable baseline: fail closed below. */ }
  const noChanges = 'No user-facing changes are listed since the preceding release.';
  const prompt = commits
    ? `Write short factual GitHub release notes for Saturday Tube ${version}, using only these commit subjects. Do not infer or invent features; if subjects are vague, say the changes are summarized by the commits.\n${commits}`
    : `There are no commit subjects after ${tag}. For Saturday Tube ${version}, respond only with this exact factual sentence and do not add changes: ${noChanges}`;
  const summary = command('ollama', ['run', model, prompt], { timeout: 180000 }).replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim();
  if (!summary) throw new Error('Ollama returned empty release notes; no draft was created.');
  if (!commits) {
    if (!/no user-facing changes/i.test(summary) || /\b(added|fixed|improved|introduced|new feature)\b/i.test(summary)) throw new Error('Ollama could not safely describe an empty change range; no draft was created.');
    return noChanges;
  }
  return summary;
}
async function sha256File(file) {
  return await new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => digest.update(chunk));
    stream.on('end', () => resolve(digest.digest('hex')));
  });
}
function verifyDraft(target, tag, zipName, checksumName, hash, checksumHash, zipSize) {
  const release = JSON.parse(command('gh', ['release', 'view', tag, '--repo', `${target.owner}/${target.repo}`, '--json', 'isDraft,tagName,assets,url']));
  if (release.isDraft !== true || release.tagName !== tag) throw new Error('GitHub did not confirm the expected draft release.');
  const zip = release.assets.find(asset => asset.name === zipName);
  const sidecar = release.assets.find(asset => asset.name === checksumName);
  if (!zip || !sidecar || Number(zip.size) !== zipSize) throw new Error('Draft is missing its verified ZIP or SHA-256 sidecar.');
  if (zip.digest !== `sha256:${hash}` || sidecar.digest !== `sha256:${checksumHash}`) throw new Error('GitHub asset digests do not match the local ZIP and checksum files.');
  return release.url;
}

const target = ownerTarget();
if (preflight) {
  if (target) {
    const existing = JSON.parse(command('gh', ['release', 'list', '--repo', `${target.owner}/${target.repo}`, '--limit', '100', '--json', 'tagName']));
    const tags = existing.map(release => release.tagName);
    const next = selectOwnerVersion(pkg.version, tags);
    console.log(`Owner draft mode verified for ${target.owner}/${target.repo}; next eligible version: ${next}. Preflight only; no build, push, or release was made.`);
    if (args.includes('--notes-preview')) console.log(`\nOllama notes preview:\n${generateNotes(next, tags[0] || 'v0.8.9')}`);
  } else console.log(localOnly ? 'Local-only path explicitly selected; no build or changes were made.' : 'No owner-authenticated matching repository; console would build locally only. No changes were made.');
  process.exit(0);
}
const releases = target ? JSON.parse(command('gh', ['release', 'list', '--repo', `${target.owner}/${target.repo}`, '--limit', '100', '--json', 'tagName'])) : [];
const releaseTags = releases.map(release => release.tagName);
const version = target ? selectOwnerVersion(pkg.version, releaseTags) : (action === 'current' ? pkg.version : nextVersion(pkg.version));
const tag = `v${version}`;
const buildRoot = path.resolve(process.env.SATURDAY_TUBE_BUILD_OUTPUT || path.join(root, 'dist', target ? 'releases' : 'candidates', version));
if (fs.existsSync(buildRoot) && fs.readdirSync(buildRoot).length) throw new Error(`Refusing to overwrite non-empty build output: ${buildRoot}`);

console.log(`Saturday Tube Developer Console · ${pkg.version} → ${version}`);
if (target) {
  console.log(`OWNER DRAFT MODE · ${target.owner}/${target.repo}; the console will never publish the release.`);
  checkCleanMain();
  if (releaseTags.includes(tag)) throw new Error(`${tag} already exists; refusing to overwrite the existing GitHub draft/release.`);
} else console.log('LOCAL-ONLY MODE · no GitHub release or upload will be attempted.');

let versionCommitMade = false;
try {
  run('npm', ['test']);
  pkg.version = version;
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  fs.mkdirSync(buildRoot, { recursive: true });

  if (!target) {
    run('npm', ['run', 'package:mac'], { ...process.env, SATURDAY_TUBE_BUILD_OUTPUT: buildRoot });
    console.log(`Local candidate ${version} staged under ${buildRoot}; no GitHub calls were made.`);
    process.exit(0);
  }

  const summary = generateNotes(version, releaseTags[0] || 'v0.8.9');
  run('npm', ['run', 'package:release:mac'], { ...process.env, SATURDAY_TUBE_BUILD_OUTPUT: buildRoot });
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const app = path.join(buildRoot, `Saturday Tube-darwin-${arch}`, 'Saturday Tube.app');
  const info = path.join(app, 'Contents', 'Info.plist');
  const bundleVersion = command('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', info]);
  const bundleId = command('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', info]);
  if (bundleVersion !== version || bundleId !== 'com.ilovespectra.saturdaytube') throw new Error('Packaged app metadata does not match the requested release.');
  const zipName = `Saturday-Tube-${version}-darwin-${arch}.zip`;
  const zipPath = path.join(buildRoot, zipName);
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zipPath]);
  command('unzip', ['-tq', zipPath]);
  const hash = await sha256File(zipPath);
  const checksumName = `${zipName}.sha256`;
  const checksumPath = path.join(buildRoot, checksumName);
  fs.writeFileSync(checksumPath, `${hash}  ${zipName}\n`);
  const checksumHash = await sha256File(checksumPath);
  const zipSize = fs.statSync(zipPath).size;
  const notes = `## Saturday Tube ${version}\n\n${summary}\n\n### Verified package\n- Apple-silicon macOS release ZIP: \`${zipName}\` (${zipSize} bytes)\n- SHA-256: \`${hash}\`\n- Ad-hoc signed; not notarized. macOS may show a security prompt.\n`;
  const notesPath = path.join(buildRoot, 'release-notes.md');
  fs.writeFileSync(notesPath, notes);

  // Keep the GitHub tag's source version aligned with the binary version.
  command('git', ['add', 'package.json', 'package-lock.json']);
  command('git', ['commit', '-m', `Release ${version}`]);
  versionCommitMade = true;
  command('git', ['push', 'origin', 'main']);
  run('gh', ['release', 'create', tag, zipPath, checksumPath, '--draft', '--title', `Saturday Tube ${version}`, '--notes-file', notesPath, '--repo', `${target.owner}/${target.repo}`]);
  const link = verifyDraft(target, tag, zipName, checksumName, hash, checksumHash, zipSize);
  console.log(`Verified GitHub draft ${tag}: ${link}`);
} catch (error) {
  if (!versionCommitMade) {
    fs.writeFileSync(pkgPath, pkgText);
    fs.writeFileSync(lockPath, lockText);
  }
  throw error;
}
