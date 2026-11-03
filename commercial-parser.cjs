#!/usr/bin/env node
'use strict';

// Splits long commercial reels in channel Commercials folders into single spots, then trashes the reel.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { CommercialsService, createCommercialSegments, findExecutable } = require('./commercials-service.cjs');

// The bundled player FFmpeg lacks blackdetect, so a full install is preferred for cutting.
function parserFFmpegPaths(bundled) {
  const ffmpeg = [process.env.SATURDAY_TUBE_FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', findExecutable('ffmpeg'), bundled]
    .find(candidate => candidate && fs.existsSync(candidate)) || null;
  const probe = ffmpeg ? path.join(path.dirname(ffmpeg), 'ffprobe') : null;
  return { ffmpegPath: ffmpeg, ffprobePath: probe && fs.existsSync(probe) ? probe : null };
}

const MANIFEST_NAME = '.saturday-commercial-parser.json';
const MANIFEST_VERSION = 1;
const PARSER_VERSION = 'split-v1';
const SINGLE_SPOT_MAX_SECONDS = 75;
const MAX_SPOT_SECONDS = 120;
const REEL_NAME = /(?:^|[^a-z])(?:bumpers|compilation|commercials|ads|promos|spots|commercial break|ad break|reel|blocks?)(?:$|[^a-z])/i;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.wmv', '.flv', '.ts']);
const LABELS = ['ad', 'bumper', 'intro', 'promo', 'credits', 'program'];
const DROPPED_LABELS = new Set(['credits', 'program']);
const VISION_MODEL = /llava|moondream|bakllava|vision|vl\b|vl:|gemma3|minicpm-v|llama4/i;

function fileKey(name, stat) {
  return `${name}|${stat.size}|${Math.round(stat.mtimeMs)}`;
}

function cleanName(value, fallback = 'clip') {
  const text = String(value || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N} '&!.-]+/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  return text || fallback;
}

function ruleLabel(seconds) {
  if (seconds <= 9) return 'bumper';
  if (seconds > MAX_SPOT_SECONDS) return 'program';
  return 'ad';
}

function parseLabelReply(text) {
  const reply = String(text || '').trim();
  let parsed = null;
  try { parsed = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] || reply); } catch {}
  const kind = String(parsed?.kind || reply).toLowerCase().match(new RegExp(LABELS.join('|')))?.[0] || null;
  const title = parsed?.title ? cleanName(parsed.title, '') : '';
  return kind ? { kind, title } : null;
}

function needsSplit(name, seconds) {
  return seconds > SINGLE_SPOT_MAX_SECONDS || (REEL_NAME.test(path.parse(name).name) && seconds > 40);
}

async function readManifest(folder) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(path.join(folder, MANIFEST_NAME), 'utf8'));
    if (parsed?.version === MANIFEST_VERSION && parsed.files) return parsed;
  } catch {}
  return { version: MANIFEST_VERSION, files: {} };
}

async function writeManifest(folder, manifest) {
  const target = path.join(folder, MANIFEST_NAME);
  const temporary = `${target}.${process.pid}.partial`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.promises.rename(temporary, target);
}

function trashFile(filePath) {
  if (process.platform !== 'darwin') return fs.promises.unlink(filePath);
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)', '-e', 'end run', filePath],
      { timeout: 30000 }, error => error ? reject(error) : resolve());
  });
}

async function ollamaJson(host, route, body, timeoutMs = 60000) {
  const response = await fetch(`${host}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Ollama ${route} answered ${response.status}`);
  return response.json();
}

// Looks at a few frames with a local Ollama vision model; without one, labels by length.
async function createOllamaLabeler({ host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434', model = process.env.SATURDAY_TUBE_OLLAMA_MODEL, log = () => {} } = {}) {
  host = host.startsWith('http') ? host : `http://${host}`;
  let chosen = model || null;
  if (!chosen) {
    const tags = await ollamaJson(host, '/api/tags', null, 3000).catch(() => null);
    chosen = tags?.models?.map(item => item.name).find(name => VISION_MODEL.test(name)) || null;
  }
  if (!chosen) {
    log('no Ollama vision model found; labeling by length (try: ollama pull moondream)');
    return null;
  }
  log(`labeling clips with Ollama model ${chosen}`);
  return async ({ frames, seconds, channel }) => {
    const prompt = `These are frames from one ${seconds.toFixed(0)}-second clip cut from a ${channel || 'TV'} commercial break tape. `
      + `Classify it as exactly one of: ad (a product commercial), bumper (short channel ident or "we'll be right back"), intro (a show's opening titles), promo (an advert for a TV show or movie airing), credits (end credits of a show or movie), program (part of an actual show). `
      + 'Reply only with JSON like {"kind":"ad","title":"Lunchables"} where title names the product, show or channel in 1-4 words.';
    const reply = await ollamaJson(host, '/api/generate', { model: chosen, prompt, images: frames, stream: false, format: 'json', options: { temperature: 0 } }, 120000);
    return parseLabelReply(reply?.response);
  };
}

async function grabFrames(executable, filePath, seconds) {
  const frames = [];
  for (const fraction of [0.2, 0.5, 0.85]) {
    const output = path.join(os.tmpdir(), `saturday-frame-${process.pid}-${Date.now()}-${frames.length}.jpg`);
    await new Promise(resolve => execFile(executable, ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(seconds * fraction), '-i', filePath,
      '-frames:v', '1', '-vf', 'scale=512:-2', output], { timeout: 20000 }, () => resolve()));
    const data = await fs.promises.readFile(output).catch(() => null);
    await fs.promises.unlink(output).catch(() => {});
    if (data?.length) frames.push(data.toString('base64'));
  }
  return frames;
}

async function uniquePath(folder, base) {
  for (let index = 1; ; index += 1) {
    const candidate = path.join(folder, `${base}${index > 1 ? ` ${index}` : ''}.mp4`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

async function parseCommercialFolder(folder, { service, labeler = null, log = () => {}, dryRun = false, remove = trashFile, frames: frameGrabber = grabFrames } = {}) {
  const manifest = await readManifest(folder);
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  const channel = path.basename(path.dirname(folder)).replace(/^\d+_\s*/, '');
  const summary = { folder, split: 0, clips: 0, skipped: 0, failed: 0 };
  const executable = (await service.getFFmpegCapabilities()).executable;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const source = path.join(folder, entry.name);
    const stat = await fs.promises.stat(source).catch(() => null);
    if (!stat) continue;
    const key = fileKey(entry.name, stat);
    if (manifest.files[key]?.parser === PARSER_VERSION) { summary.skipped += 1; continue; }
    try {
      const seconds = await service.probeDuration(source);
      if (!needsSplit(entry.name, seconds)) {
        manifest.files[key] = { parser: PARSER_VERSION, status: 'single', seconds };
        summary.skipped += 1;
        continue;
      }
      log(`scanning ${entry.name} (${Math.round(seconds)}s)`);
      const segments = createCommercialSegments(seconds, await service.detectBlackIntervals(source));
      if (segments.length < 2) {
        manifest.files[key] = { parser: PARSER_VERSION, status: 'no-breaks', seconds };
        log(`  no clean breaks found; left as is`);
        continue;
      }
      if (dryRun) { log(`  would cut ${segments.length} clips`); continue; }
      const sourceBase = cleanName(path.parse(entry.name).name, 'commercial');
      const written = [];
      try {
        for (const segment of segments) {
          const temporary = path.join(folder, `.parsing-${process.pid}-${segment.ordinal}.mp4`);
          await service.encodeClip(source, segment.sourceStart, segment.sourceEnd, temporary);
          written.push(temporary);
          const clipSeconds = await service.probeDuration(temporary);
          if (Math.abs(clipSeconds - segment.durationSeconds) > 2.5) throw new Error(`clip ${segment.ordinal} came out ${clipSeconds.toFixed(1)}s, expected ${segment.durationSeconds}s`);
          let label = null;
          if (labeler) {
            const frames = await frameGrabber(executable, temporary, clipSeconds).catch(() => []);
            label = frames.length ? await labeler({ frames, seconds: clipSeconds, channel }).catch(error => { log(`  labeler: ${error.message}`); return null; }) : null;
          }
          label ||= { kind: ruleLabel(clipSeconds), title: '' };
          if (DROPPED_LABELS.has(label.kind)) {
            await fs.promises.unlink(temporary);
            written.pop();
            log(`  dropped clip ${segment.ordinal} (${label.kind})`);
            continue;
          }
          const name = `${label.kind}${label.title ? ` - ${label.title}` : ''} - ${sourceBase} #${String(segment.ordinal).padStart(2, '0')}`;
          const finalPath = await uniquePath(folder, name);
          await fs.promises.rename(temporary, finalPath);
          written[written.length - 1] = finalPath;
          const clipStat = await fs.promises.stat(finalPath);
          manifest.files[fileKey(path.basename(finalPath), clipStat)] = { parser: PARSER_VERSION, status: 'clip', from: entry.name, kind: label.kind };
        }
      } catch (error) {
        await Promise.all(written.map(file => fs.promises.unlink(file).catch(() => {})));
        throw error;
      }
      await remove(source);
      manifest.files[key] = { parser: PARSER_VERSION, status: 'split', seconds, clips: written.length, at: new Date().toISOString() };
      summary.split += 1;
      summary.clips += written.length;
      log(`  cut ${written.length} clips; original moved to Trash`);
    } catch (error) {
      summary.failed += 1;
      log(`  failed ${entry.name}: ${error.message}`);
    } finally {
      if (!dryRun) await writeManifest(folder, manifest).catch(error => log(`  manifest not saved: ${error.message}`));
    }
  }
  return summary;
}

let queue = Promise.resolve();
const queued = new Set();
// Serializes parsing so startup catch-up and new channel scans never encode the same folder twice.
function enqueueCommercialFolders(folders, options) {
  const fresh = [...new Set(folders)].filter(folder => folder && !queued.has(folder));
  fresh.forEach(folder => queued.add(folder));
  queue = queue.then(async () => {
    const labeler = options.labeler === undefined ? await createOllamaLabeler({ log: options.log }).catch(() => null) : options.labeler;
    const results = [];
    for (const folder of fresh) {
      try {
        results.push(await parseCommercialFolder(folder, { ...options, labeler }));
      } catch (error) {
        options.log?.(`commercial parser skipped ${folder}: ${error.message}`);
      } finally {
        queued.delete(folder);
      }
    }
    if (results.some(item => item.split) && options.onChanged) options.onChanged(results);
    return results;
  });
  return queue;
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  let folders = argv.filter(arg => !arg.startsWith('--'));
  if (!folders.length) {
    const { resolveChannelCommercialsRoot } = require('./channels-service.cjs');
    const userData = path.join(os.homedir(), 'Library', 'Application Support', process.env.SATURDAY_TUBE_PROFILE || 'Saturday Tube Dev');
    const catalog = JSON.parse(await fs.promises.readFile(path.join(userData, 'channel-catalog-cache.json'), 'utf8').catch(() => '{}'));
    folders = (await Promise.all(Object.keys(catalog).map(root => resolveChannelCommercialsRoot(root).catch(() => null)))).filter(Boolean);
  }
  folders = [...new Set(folders.map(folder => path.resolve(folder)))];
  if (!folders.length) {
    console.log('No Commercials folders found. Pass folders as arguments, or open channels in Saturday Tube first.');
    return;
  }
  const bundled = path.join(__dirname, 'vendor', 'ffmpeg', 'ffmpeg');
  const service = new CommercialsService(path.join(os.tmpdir(), 'saturday-commercial-parser'), parserFFmpegPaths(bundled));
  const log = message => console.log(message);
  const labeler = await createOllamaLabeler({ log });
  for (const folder of folders) {
    console.log(`\n${folder}`);
    const result = await parseCommercialFolder(folder, { service, labeler, log, dryRun });
    console.log(`  ${result.split} reels split into ${result.clips} clips, ${result.skipped} already single, ${result.failed} failed`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { parserFFmpegPaths, parseCommercialFolder, enqueueCommercialFolders, createOllamaLabeler, parseLabelReply, needsSplit, ruleLabel, MANIFEST_NAME };
