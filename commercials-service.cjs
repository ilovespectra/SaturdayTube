const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const DATABASE_VERSION = 1;
const AD_SECONDS_PER_PROGRAM_SECOND = 11 / 49;
const BREAK_AD_RATIO = AD_SECONDS_PER_PROGRAM_SECOND;
const MIN_MIDROLL_SECONDS = 15 * 60;
const MIN_CLIP_SECONDS = 2.5;
const MAX_CLIP_SECONDS = 180;
// A fade to black over continuing sound is a scene change inside one spot; it is only kept as a split if the spot would
// otherwise run longer than any real commercial.
const MAX_REJOINED_SPOT_SECONDS = 62;
const SPOT_GAP_PADDING_SECONDS = 0.25;
const WATCHED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm']);
const WATCHED_FILE_STABILITY_MS = 90_000;
const WATCH_SCAN_INTERVAL_MS = 15_000;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function parseClock(value) {
  const match = String(value || '').match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : NaN;
}

function parseBlackIntervals(text) {
  const intervals = [];
  const pattern = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g;
  for (const match of String(text || '').matchAll(pattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    const duration = Number(match[3]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && duration > 0) {
      intervals.push({ start, end, duration });
    }
  }
  return intervals;
}

function parseSilenceIntervals(text, durationSeconds = Infinity) {
  const silences = [];
  let open = null;
  for (const match of String(text || '').matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const seconds = Math.max(0, Number(match[2]));
    if (match[1] === 'start') open = seconds;
    else if (open !== null) {
      silences.push({ start: open, end: seconds });
      open = null;
    }
  }
  if (open !== null && Number.isFinite(durationSeconds)) silences.push({ start: open, end: durationSeconds });
  return silences;
}

// Marks each black interval as quiet or loud; without an audio stream the marks are left off and every black can split.
function markQuietBlacks(blacks, silences) {
  if (!Array.isArray(silences)) return blacks;
  return blacks.map(black => ({
    ...black,
    quiet: silences.some(silence => silence.start <= black.end + SPOT_GAP_PADDING_SECONDS && silence.end >= black.start - SPOT_GAP_PADDING_SECONDS)
  }));
}

function mergedQuiet(left, right) {
  if (left === true || right === true) return true;
  if (left === false || right === false) return false;
  return undefined;
}

function mergeBlackIntervals(intervals, joinGap = 0.18) {
  const sorted = (Array.isArray(intervals) ? intervals : [])
    .filter(item => Number.isFinite(item?.start) && Number.isFinite(item?.end) && item.end > item.start)
    .map(item => ({ start: Number(item.start), end: Number(item.end), quiet: typeof item.quiet === 'boolean' ? item.quiet : undefined }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of sorted) {
    const previous = merged.at(-1);
    if (previous && item.start - previous.end <= joinGap) {
      previous.end = Math.max(previous.end, item.end);
      previous.duration = previous.end - previous.start;
      previous.merged = true;
      previous.quiet = mergedQuiet(previous.quiet, item.quiet);
    } else {
      merged.push({ ...item, duration: item.end - item.start, merged: false });
    }
  }
  return merged;
}

function confidenceForBlack(interval) {
  return Number(clamp(0.70 + Math.min(interval.duration, 2) * 0.15 - (interval.merged ? 0.03 : 0), 0.5, 0.97).toFixed(2));
}

function targetCommercialSeconds(programSeconds) {
  const duration = Number(programSeconds);
  return Number.isFinite(duration) && duration > 0 ? Number((duration * AD_SECONDS_PER_PROGRAM_SECOND).toFixed(1)) : 0;
}

function shouldUseBoundaryBreak(programSeconds, hasNextVideo) {
  const duration = Number(programSeconds);
  return Boolean(hasNextVideo) && Number.isFinite(duration) && duration > 0 && duration < MIN_MIDROLL_SECONDS;
}

function chooseProgramBreaks(durationSeconds, blackIntervals) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration < MIN_MIDROLL_SECONDS) {
    return { durationSeconds: Number.isFinite(duration) ? duration : 0, adRatio: AD_SECONDS_PER_PROGRAM_SECOND, targetAdSeconds: 0, breaks: [], candidateCount: 0 };
  }
  const edgeGuard = Math.min(45, duration * 0.05);
  const candidates = mergeBlackIntervals(blackIntervals)
    .filter(item => item.duration >= 0.10 && item.duration <= 4 && item.start > edgeGuard && item.end < duration - edgeGuard)
    .map(item => ({
      at: Number(((item.start + item.end) / 2).toFixed(3)),
      blackStart: Number(item.start.toFixed(3)),
      blackEnd: Number(item.end.toFixed(3)),
      blackDuration: Number(item.duration.toFixed(3)),
      confidence: confidenceForBlack(item),
      reviewNeeded: confidenceForBlack(item) < 0.79
    }));
  const count = clamp(Math.round(duration / 850), 1, 8);
  const maxDrift = Math.max(150, Math.min(300, duration * 0.18));
  const minSpacing = Math.max(120, duration / (count + 1) * 0.48);
  const chosen = [];
  for (let slot = 1; slot <= count; slot += 1) {
    const ideal = duration * slot / (count + 1);
    const available = candidates.filter(candidate => !chosen.some(item => Math.abs(item.at - candidate.at) < minSpacing));
    const ranked = available.map(candidate => {
      const drift = Math.abs(candidate.at - ideal);
      return { candidate, score: drift / maxDrift * 0.68 + (1 - candidate.confidence) * 0.68 };
    }).filter(item => Math.abs(item.candidate.at - ideal) <= maxDrift)
      .sort((a, b) => a.score - b.score || b.candidate.confidence - a.candidate.confidence);
    if (ranked.length) chosen.push(ranked[0].candidate);
  }
  chosen.sort((a, b) => a.at - b.at);
  return {
    durationSeconds: duration,
    adRatio: AD_SECONDS_PER_PROGRAM_SECOND,
    targetAdSeconds: targetCommercialSeconds(duration),
    candidateCount: candidates.length,
    breaks: chosen.map((item, index) => ({ ...item, id: `fade-${index + 1}` }))
  };
}

function createCommercialSegments(durationSeconds, blackIntervals) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= MIN_CLIP_SECONDS) return [];
  const edgeGuard = 0.12;
  const boundaries = mergeBlackIntervals(blackIntervals)
    .filter(item => item.duration >= 0.10 && item.duration <= 4 && item.start > edgeGuard && item.end < duration - edgeGuard)
    .map(item => ({
      start: Number(item.start.toFixed(3)),
      end: Number(item.end.toFixed(3)),
      at: Number(((item.start + item.end) / 2).toFixed(3)),
      duration: Number(item.duration.toFixed(3)),
      confidence: confidenceForBlack(item),
      merged: Boolean(item.merged),
      quiet: item.quiet
    }));

  // Very close black flashes are a single edit; genuine short bumpers remain separate.
  const selected = [];
  for (const boundary of boundaries) {
    const previous = selected.at(-1);
    if (!previous || boundary.at - previous.at >= MIN_CLIP_SECONDS) {
      selected.push(boundary);
    } else if (boundary.confidence > previous.confidence) {
      selected[selected.length - 1] = boundary;
    }
  }
  // Spots are separated by black and a pause in the sound together; black over speech or music stays inside the spot.
  const between = [];
  let clipStart = 0;
  for (const [index, boundary] of selected.entries()) {
    const nextStart = selected[index + 1]?.start ?? duration;
    if (boundary.quiet === false && nextStart - clipStart <= MAX_REJOINED_SPOT_SECONDS) continue;
    between.push(boundary);
    clipStart = boundary.end;
  }
  const result = [];
  let previous = { start: 0, end: 0, confidence: 1 };
  let serial = 1;
  const splitBoundaries = [...between, { start: duration, end: duration, at: duration, confidence: 1 }];
  for (const [boundaryIndex, boundary] of splitBoundaries.entries()) {
    const start = previous.end;
    const end = boundary.start;
    const seconds = end - start;
    if (seconds >= MIN_CLIP_SECONDS) {
      const confidence = Math.min(previous.confidence, boundary.confidence);
      const edgeClip = result.length === 0 || boundaryIndex === splitBoundaries.length - 1;
      result.push({
        ordinal: serial++,
        sourceStart: Number(start.toFixed(3)),
        sourceEnd: Number(end.toFixed(3)),
        durationSeconds: Number(seconds.toFixed(3)),
        boundaryConfidence: Number(confidence.toFixed(2)),
        needsReview: edgeClip || confidence < 0.79 || seconds < 8 || seconds > 90,
        enabled: true,
        reviewed: !edgeClip && confidence >= 0.79 && seconds >= 8 && seconds <= 90
      });
    }
    previous = boundary;
  }
  return result;
}

// Sources split before versioning are recognised by their recorded black-frame scan.
function sourceSplitVersion(source) {
  if (Number(source?.splitVersion) > 0) return Number(source.splitVersion);
  return Number.isFinite(Number(source?.blackTransitionCount)) && source?.blackTransitionCount !== undefined ? 1 : 0;
}

const PROBE_TIMEOUT_MS = 20_000;

function runCapture(executable, args, { limit = 2_000_000, timeoutMs = 0, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], signal, killSignal: 'SIGKILL' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // Some damaged files make ffprobe spin forever; a probe that never answers must not stall a whole channel scan.
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs) : null;
    const append = (current, chunk) => (current + chunk.toString()).slice(-limit);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.once('error', error => { if (timer) clearTimeout(timer); reject(error); });
    child.once('close', code => {
      if (timer) clearTimeout(timer);
      if (timedOut) reject(Object.assign(new Error(`${path.basename(executable)} timed out reading the file.`), { code: 'ETIMEDOUT' }));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().slice(-900) || `${path.basename(executable)} exited with code ${code}`));
    });
  });
}

function findExecutable(name, envPath = process.env.PATH || '') {
  const conventional = process.platform === 'darwin'
    ? [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]
    : [`/usr/bin/${name}`, `/usr/local/bin/${name}`];
  const candidates = [...conventional, ...envPath.split(path.delimiter).filter(Boolean).map(directory => path.join(directory, name))];
  return candidates.find(candidate => {
    try { return fs.statSync(candidate).isFile() && (process.platform === 'win32' || (fs.statSync(candidate).mode & 0o111) !== 0); }
    catch { return false; }
  }) || null;
}

function safeBaseName(name) {
  return path.basename(String(name || 'commercial')).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 90) || 'commercial';
}

function containedPath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid commercial-library file reference.');
  const candidate = path.resolve(root, relative);
  const inside = path.relative(root, candidate);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Commercial-library files must stay inside the local library.');
  return candidate;
}

class CommercialsService {
  constructor(root, { ffmpegPath = null, ffprobePath = null, stabilityMs = WATCHED_FILE_STABILITY_MS } = {}) {
    this.root = path.resolve(root);
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
    this.stabilityMs = Math.max(0, Number(stabilityMs) || 0);
    this.capabilities = null;
    this.databasePath = path.join(this.root, 'commercial-library.json');
    this.database = null;
    this.readyPromise = null;
    this.savePromise = Promise.resolve();
    this.watchedRoot = null;
    this.watchedStability = new Map();
    this.watchTimer = null;
    this.watchScanPromise = null;
  }

  async ready() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      await fs.promises.mkdir(path.join(this.root, 'sources'), { recursive: true });
      await fs.promises.mkdir(path.join(this.root, 'clips'), { recursive: true });
      try {
        const parsed = JSON.parse(await fs.promises.readFile(this.databasePath, 'utf8'));
        if (!parsed || parsed.version !== DATABASE_VERSION || !Array.isArray(parsed.sources) || !Array.isArray(parsed.clips)) {
          throw new Error('Commercial library index has an unsupported format.');
        }
        parsed.programBreaks ||= {};
        this.database = parsed;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.database = { version: DATABASE_VERSION, createdAt: new Date().toISOString(), sources: [], clips: [], programBreaks: {} };
        await this.save();
      }
      return this.database;
    })();
    return this.readyPromise;
  }

  async save() {
    const snapshot = `${JSON.stringify(this.database, null, 2)}\n`;
    const write = this.savePromise.catch(() => {}).then(async () => {
      await fs.promises.mkdir(this.root, { recursive: true });
      const temporary = `${this.databasePath}.${process.pid}.${crypto.randomUUID()}.partial`;
      await fs.promises.writeFile(temporary, snapshot, { mode: 0o600 });
      await fs.promises.rename(temporary, this.databasePath);
    });
    this.savePromise = write;
    return write;
  }

  async getFFmpegCapabilities() {
    if (this.capabilities) return this.capabilities;
    const executable = this.ffmpegPath || findExecutable('ffmpeg');
    if (!executable) throw new Error('Commercial analysis needs FFmpeg with blackdetect; install FFmpeg and try again. Your source is unchanged.');
    const { stdout, stderr } = await runCapture(executable, ['-hide_banner', '-filters']);
    const listing = `${stdout}\n${stderr}`;
    if (!/\bblackdetect\b/.test(listing)) throw new Error('This FFmpeg build has no blackdetect filter. Install the full FFmpeg package and retry. Your source is unchanged.');
    const encoders = await runCapture(executable, ['-hide_banner', '-encoders']);
    const encoderText = `${encoders.stdout}\n${encoders.stderr}`;
    const videoEncoder = /\bh264_videotoolbox\b/.test(encoderText)
      ? ['-c:v', 'h264_videotoolbox', '-b:v', '1300k', '-profile:v', 'main']
      : /\blibx264\b/.test(encoderText)
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22']
        : null;
    if (!videoEncoder) throw new Error('FFmpeg needs an H.264 encoder to save playable commercial clips. Your source is unchanged.');
    this.capabilities = { executable, videoEncoder };
    return this.capabilities;
  }

  async probeDuration(filePath) {
    const executable = this.ffprobePath || findExecutable('ffprobe');
    if (executable) {
      const { stdout } = await runCapture(executable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { timeoutMs: PROBE_TIMEOUT_MS });
      const duration = Number(stdout.trim().split(/\s+/)[0]);
      if (Number.isFinite(duration) && duration > 0) return duration;
    }
    const ffmpeg = (await this.getFFmpegCapabilities()).executable;
    const { stderr } = await runCapture(ffmpeg, ['-hide_banner', '-loglevel', 'info', '-i', filePath, '-frames:v', '1', '-f', 'null', '-'], { timeoutMs: PROBE_TIMEOUT_MS });
    const match = stderr.match(/Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/);
    const duration = match ? parseClock(match[1]) : NaN;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('FFmpeg could not read the video duration.');
    return duration;
  }

  async probeAudioCodec(filePath) {
    const executable = this.ffprobePath || findExecutable('ffprobe');
    if (!executable) return '';
    const { stdout } = await runCapture(executable, [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], { timeoutMs: PROBE_TIMEOUT_MS });
    return String(stdout).trim().toLowerCase();
  }

  async probeVideoCodec(filePath) {
    const executable = this.ffprobePath || findExecutable('ffprobe');
    if (!executable) return '';
    const { stdout } = await runCapture(executable, [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], { timeoutMs: PROBE_TIMEOUT_MS });
    return String(stdout).trim().toLowerCase();
  }

  // One quick look at what a file holds: first video and audio codecs and the container's start time.
  async probeStreams(filePath, { signal } = {}) {
    const executable = this.ffprobePath || findExecutable('ffprobe');
    if (!executable) return null;
    const { stdout } = await runCapture(executable, [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=start_time', '-of', 'json', filePath
    ], { timeoutMs: PROBE_TIMEOUT_MS, signal });
    const parsed = JSON.parse(stdout || '{}');
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const first = type => String(streams.find(stream => stream.codec_type === type)?.codec_name || '').toLowerCase();
    return { video: first('video'), audio: first('audio') || 'none', startTime: Number(parsed.format?.start_time) || 0 };
  }

  // Time of the last keyframe at or before `seconds` (container time), or null when none can be read quickly.
  async probeKeyframeBefore(filePath, seconds, { signal } = {}) {
    const executable = this.ffprobePath || findExecutable('ffprobe');
    if (!executable) return null;
    const { stdout } = await runCapture(executable, [
      '-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-read_intervals', `${Math.max(0, seconds)}%+#1`,
      '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', filePath
    ], { timeoutMs: 8000, signal });
    const time = Number(String(stdout).trim().split(/[\s,]+/)[0]);
    return Number.isFinite(time) ? time : null;
  }

  async detectBlackIntervals(filePath, onProgress = () => {}) {
    const { executable } = await this.getFFmpegCapabilities();
    onProgress({ phase: 'scanning' });
    const { stderr } = await runCapture(executable, [
      '-hide_banner', '-nostats', '-loglevel', 'info', '-i', filePath,
      '-vf', 'scale=320:-2,blackdetect=d=0.09:pix_th=0.06:pic_th=0.98',
      '-af', 'silencedetect=n=-40dB:d=0.06',
      '-f', 'null', '-'
    ], { limit: 8_000_000 });
    const hasAudio = /Stream #\d+:\d+[^\n]*: Audio:/.test(stderr);
    return markQuietBlacks(parseBlackIntervals(stderr), hasAudio ? parseSilenceIntervals(stderr) : null);
  }

  async encodeClip(sourcePath, start, end, outputPath) {
    const { executable, videoEncoder } = await this.getFFmpegCapabilities();
    const duration = end - start;
    const temporary = `${outputPath}.${process.pid}.${crypto.randomUUID()}.partial.mp4`;
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, start)),
      '-i', sourcePath, '-t', String(duration), '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      ...videoEncoder, '-pix_fmt', 'yuv420p', '-tag:v', 'avc1', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', temporary
    ];
    try {
      await runCapture(executable, args, { limit: 1800 });
      const stat = await fs.promises.stat(temporary);
      if (!stat.isFile() || stat.size < 1000) throw new Error('FFmpeg produced an empty commercial clip.');
      await fs.promises.rename(temporary, outputPath);
      return stat.size;
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.once('error', reject);
      stream.once('end', () => resolve(hash.digest('hex')));
    });
  }

  startWatchingFolder(folderPath, onProgress = () => {}, intervalMs = WATCH_SCAN_INTERVAL_MS) {
    if (this.watchTimer || typeof folderPath !== 'string' || !folderPath.trim()) return false;
    let realRoot;
    try {
      realRoot = fs.realpathSync(folderPath);
      if (!fs.statSync(realRoot).isDirectory()
        || path.basename(realRoot).trim().toLocaleLowerCase('en-US') !== 'commercials') return false;
    } catch { return false; }
    this.watchedRoot = realRoot;
    const scan = () => this.scanWatchedFolder(this.watchedRoot, onProgress)
      .catch(error => onProgress({ phase: 'watch-folder-error', message: error.message || String(error) }));
    void scan();
    this.watchTimer = setInterval(scan, Math.max(1000, Number(intervalMs) || WATCH_SCAN_INTERVAL_MS));
    this.watchTimer.unref?.();
    return true;
  }

  stopWatchingFolder() {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
  }

  async scanWatchedFolder(folderPath = this.watchedRoot, onProgress = () => {}, { now = Date.now() } = {}) {
    if (!folderPath) return { imported: 0, duplicates: 0, pending: 0, skipped: 0 };
    if (this.watchScanPromise) return this.watchScanPromise;
    this.watchScanPromise = this.scanWatchedFolderOnce(folderPath, onProgress, now)
      .finally(() => { this.watchScanPromise = null; });
    return this.watchScanPromise;
  }

  async scanWatchedFolderOnce(folderPath, onProgress, now) {
    await this.ready();
    let root;
    try { root = await fs.promises.realpath(folderPath); }
    catch (error) {
      onProgress({ phase: 'watch-folder-unavailable', message: error.message || String(error) });
      return { imported: 0, duplicates: 0, pending: 0, skipped: 0 };
    }
    const candidates = [];
    const walk = async directory => {
      let entries;
      try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
        if (!entry.name || entry.name.startsWith('.')) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(fullPath); continue; }
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (!WATCHED_VIDEO_EXTENSIONS.has(extension) || /\.(?:f\d+|temp|partial|part|download|crdownload)\.[^.]+$/i.test(entry.name)) continue;
        candidates.push(fullPath);
      }
    };
    await walk(root);
    candidates.sort((a, b) => a.localeCompare(b));
    const present = new Set(candidates);
    for (const watchedPath of this.watchedStability.keys()) if (!present.has(watchedPath)) this.watchedStability.delete(watchedPath);

    const result = { imported: 0, duplicates: 0, pending: 0, skipped: 0 };
    for (const filePath of candidates) {
      let stat;
      try { stat = await fs.promises.stat(filePath); }
      catch { result.skipped += 1; continue; }
      if (!stat.isFile() || stat.size < 64 * 1024) { result.skipped += 1; continue; }
      const signature = `${stat.size}:${stat.mtimeMs}`;
      let state = this.watchedStability.get(filePath);
      if (!state || state.signature !== signature) {
        state = { signature, stableSince: Math.min(now, stat.mtimeMs), checked: false };
        this.watchedStability.set(filePath, state);
      }
      if (state.checked) continue;
      if (now - state.stableSince < this.stabilityMs) { result.pending += 1; continue; }
      const knownPath = this.database.sources.find(source => source.status === 'complete'
        && source.watchedFolder && source.originalPath === filePath
        && Number(source.sizeBytes) === stat.size && Math.abs(Number(source.mtimeMs) - stat.mtimeMs) < 1);
      if (knownPath) { state.checked = true; continue; }

      try {
        const imported = await this.importWatchedFile(root, filePath, stat);
        state.checked = true;
        if (imported.duplicate) result.duplicates += 1;
        else if (imported.imported) {
          result.imported += 1;
          onProgress({ phase: 'watch-import-complete', title: imported.title, importedCount: result.imported });
        } else result.skipped += 1;
      } catch (error) {
        state.checked = true;
        result.skipped += 1;
        onProgress({ phase: 'watch-file-skipped', name: path.basename(filePath), message: error.message || String(error) });
      }
    }
    result.total = candidates.length;
    onProgress({ phase: 'watch-scan-complete', ...result });
    return result;
  }

  async importWatchedFile(root, filePath, initialStat) {
    const realPath = await fs.promises.realpath(filePath);
    const relative = path.relative(root, realPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Commercial source escaped its watched folder.');
    const ffprobe = this.ffprobePath || findExecutable('ffprobe');
    const ffmpeg = this.ffmpegPath || findExecutable('ffmpeg');
    if (!ffprobe || !ffmpeg) throw new Error('Watching commercials needs FFmpeg and ffprobe on this Mac.');
    const probe = await runCapture(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', realPath
    ]);
    const details = JSON.parse(probe.stdout || '{}');
    const duration = Number(details.format?.duration);
    if (!details.streams?.some(stream => stream.codec_type === 'video') || !Number.isFinite(duration)
      || duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) {
      throw new Error(`Not a complete ${MIN_CLIP_SECONDS.toFixed(1)}–${MAX_CLIP_SECONDS}s commercial video.`);
    }
    await runCapture(ffmpeg, [
      '-nostdin', '-v', 'error', '-xerror', '-i', realPath, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'
    ], { limit: 6000 });
    const verifiedStat = await fs.promises.stat(realPath);
    if (verifiedStat.size !== initialStat.size || verifiedStat.mtimeMs !== initialStat.mtimeMs) {
      throw new Error('File changed during completeness check; it will be checked again after it settles.');
    }
    const sha256 = await this.hashFile(realPath);
    const duplicate = this.database.sources.find(source => source.sha256 === sha256 && source.status === 'complete');
    if (duplicate) return { duplicate: true, sourceId: duplicate.id };

    const sourceId = crypto.randomUUID();
    const clipId = crypto.randomUUID();
    const file = `sources/${sourceId}-${safeBaseName(path.basename(realPath))}`;
    const destination = containedPath(this.root, file);
    const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.partial`;
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.promises.copyFile(realPath, temporary, fs.constants.COPYFILE_EXCL);
      const afterCopy = await fs.promises.stat(realPath);
      const copyStat = await fs.promises.stat(temporary);
      if (afterCopy.size !== initialStat.size || afterCopy.mtimeMs !== initialStat.mtimeMs
        || copyStat.size !== initialStat.size || await this.hashFile(temporary) !== sha256) {
        throw new Error('File changed while being copied; the original was left untouched.');
      }
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
    const title = path.basename(realPath, path.extname(realPath)).replace(/^\d+\s*-\s*/, '').trim().slice(0, 80) || 'Commercial';
    const sourceRecord = {
      id: sourceId,
      name: path.basename(realPath),
      file,
      sha256,
      sizeBytes: initialStat.size,
      mtimeMs: initialStat.mtimeMs,
      originalPath: realPath,
      watchedFolder: root,
      importedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: Number(duration.toFixed(3)),
      clipCount: 1,
      reviewCount: 0,
      status: 'complete'
    };
    this.database.sources.push(sourceRecord);
    this.database.clips.push({
      id: clipId,
      sourceId,
      ordinal: 1,
      title,
      file,
      sourceStart: 0,
      sourceEnd: Number(duration.toFixed(3)),
      durationSeconds: Number(duration.toFixed(3)),
      boundaryConfidence: 1,
      needsReview: false,
      reviewed: true,
      enabled: true,
      sha256,
      sizeBytes: initialStat.size,
      createdAt: new Date().toISOString()
    });
    await this.save();
    return { imported: true, sourceId, clipId, title };
  }

  async importCompilation(sourcePath, onProgress = () => {}, { resplit = false, splitVersion = 1 } = {}) {
    await this.ready();
    const source = await fs.promises.realpath(sourcePath);
    const sourceStat = await fs.promises.stat(source);
    if (!sourceStat.isFile() || sourceStat.size < 64 * 1024) throw new Error('Choose a complete video file to add to the commercial library.');
    if (/\.(?:part|partial|download|crdownload|temp)$/i.test(source) || Date.now() - sourceStat.mtimeMs < this.stabilityMs) {
      throw new Error('This video is still settling; wait until the file stops changing before splitting it.');
    }
    const sourceHash = await this.hashFile(source);
    const existing = this.database.sources.find(item => item.sha256 === sourceHash && item.status === 'complete');
    // A re-split upgrades a reel that was once stored whole; finished splits are still reused as duplicates.
    if (existing && (!resplit || sourceSplitVersion(existing) >= splitVersion)) return { sourceId: existing.id, clipCount: this.database.clips.filter(clip => clip.sourceId === existing.id).length, duplicate: true };
    const initialStat = sourceStat;
    const { executable } = await this.getFFmpegCapabilities();
    await runCapture(executable, ['-nostdin', '-v', 'error', '-xerror', '-i', source, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'], { limit: 6000 });
    const verifiedStat = await fs.promises.stat(source);
    if (verifiedStat.size !== initialStat.size || verifiedStat.mtimeMs !== initialStat.mtimeMs) {
      throw new Error('The source changed during completeness checking; no clips were accepted.');
    }

    const prior = this.database.sources.find(item => item.sha256 === sourceHash);
    const sourceId = prior?.id || crypto.randomUUID();
    const sourceRelativePath = prior?.file || `sources/${sourceId}-${safeBaseName(path.basename(source))}`;
    const storedSource = containedPath(this.root, sourceRelativePath);
    if (!fs.existsSync(storedSource)) {
      onProgress({ phase: 'copying-source', name: path.basename(source) });
      await fs.promises.copyFile(source, storedSource, fs.constants.COPYFILE_EXCL);
    }
    const sourceRecord = prior || {
      id: sourceId,
      name: path.basename(source),
      file: sourceRelativePath,
      sha256: sourceHash,
      sizeBytes: sourceStat.size,
      importedAt: new Date().toISOString(),
      status: 'processing'
    };
    sourceRecord.status = 'processing';
    sourceRecord.file = sourceRelativePath;
    sourceRecord.name = path.basename(source);
    sourceRecord.originalPath = source;
    sourceRecord.sizeBytes = sourceStat.size;
    sourceRecord.mtimeMs = sourceStat.mtimeMs;
    if (!prior) this.database.sources.push(sourceRecord);
    await this.save();

    const duration = await this.probeDuration(storedSource);
    const intervals = await this.detectBlackIntervals(storedSource, onProgress);
    const segments = createCommercialSegments(duration, intervals);
    if (!segments.length) throw new Error('No separate commercial-sized clips were found. The copied source is preserved for review.');
    sourceRecord.durationSeconds = Number(duration.toFixed(3));
    sourceRecord.blackTransitionCount = mergeBlackIntervals(intervals).length;
    const priorClips = this.database.clips.filter(clip => clip.sourceId === sourceId);
    const completed = [];
    for (const [index, segment] of segments.entries()) {
      const reusable = priorClips.find(clip => clip.ordinal === segment.ordinal
        && Math.abs(clip.sourceStart - segment.sourceStart) < 0.01
        && Math.abs(clip.sourceEnd - segment.sourceEnd) < 0.01
        && fs.existsSync(containedPath(this.root, clip.file)));
      let clip = reusable;
      if (!clip) {
        const id = crypto.randomUUID();
        const relativeFile = `clips/${id}.mp4`;
        const output = containedPath(this.root, relativeFile);
        onProgress({ phase: 'splitting', current: index + 1, total: segments.length, durationSeconds: segment.durationSeconds });
        const sizeBytes = await this.encodeClip(storedSource, segment.sourceStart, segment.sourceEnd, output);
        clip = {
          id,
          sourceId,
          ordinal: segment.ordinal,
          title: `Commercial ${String(segment.ordinal).padStart(2, '0')}`,
          file: relativeFile,
          sourceStart: segment.sourceStart,
          sourceEnd: segment.sourceEnd,
          durationSeconds: segment.durationSeconds,
          boundaryConfidence: segment.boundaryConfidence,
          needsReview: segment.needsReview,
          reviewed: segment.reviewed,
          enabled: segment.enabled,
          sizeBytes,
          createdAt: new Date().toISOString()
        };
        this.database.clips.push(clip);
        await this.save();
      }
      completed.push(clip);
      onProgress({ phase: 'clip-complete', current: index + 1, total: segments.length, title: clip.title, needsReview: clip.needsReview });
    }
    const kept = new Set(completed.map(clip => clip.id));
    const stale = priorClips.filter(clip => !kept.has(clip.id));
    if (stale.length) {
      this.database.clips = this.database.clips.filter(clip => !stale.includes(clip));
      for (const clip of stale) {
        // Whole-file imports point at the stored source itself; only generated clip files are removed.
        if (typeof clip.file === 'string' && clip.file.startsWith('clips/') && clip.file !== sourceRelativePath) {
          await fs.promises.unlink(containedPath(this.root, clip.file)).catch(() => {});
        }
      }
    }
    sourceRecord.splitVersion = Math.max(sourceSplitVersion(sourceRecord), Number(splitVersion) || 1);
    sourceRecord.status = 'complete';
    sourceRecord.clipCount = completed.length;
    sourceRecord.reviewCount = completed.filter(clip => clip.needsReview && !clip.reviewed).length;
    sourceRecord.completedAt = new Date().toISOString();
    await this.save();
    return { sourceId, clipCount: completed.length, reviewCount: sourceRecord.reviewCount, duplicate: false };
  }

  // A source whose folder was renamed or moved is recognised by its size, name and content, so its clips are not split again.
  async relinkMovedSource(sourcePath, stat) {
    await this.ready();
    const name = path.basename(sourcePath);
    const candidates = this.database.sources.filter(source => source.status === 'complete' && typeof source.originalPath === 'string'
      && source.originalPath !== sourcePath && Number(source.sizeBytes) === Number(stat?.size) && path.basename(source.originalPath) === name
      && !fs.existsSync(source.originalPath));
    if (!candidates.length) return false;
    const sha256 = await this.hashFile(sourcePath).catch(() => '');
    const source = sha256 && candidates.find(item => item.sha256 === sha256);
    if (!source) return false;
    source.originalPath = sourcePath;
    source.mtimeMs = stat.mtimeMs;
    await this.save();
    return true;
  }

  async listChannelSources() {
    await this.ready();
    return this.database.sources
      .filter(source => source.status === 'complete' && typeof source.originalPath === 'string')
      .map(source => ({
        id: source.id, status: source.status, originalPath: source.originalPath, sizeBytes: source.sizeBytes, mtimeMs: source.mtimeMs,
        clipCount: source.clipCount, splitVersion: sourceSplitVersion(source)
      }));
  }

  async listLibrary() {
    await this.ready();
    const clips = [];
    for (const item of this.database.clips) {
      try {
        const filePath = containedPath(this.root, item.file);
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) continue;
        clips.push({ ...item, sizeBytes: stat.size });
      } catch { /* Keep missing files out of playback until a source is restored. */ }
    }
    clips.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.ordinal - b.ordinal);
    const watchedSources = this.database.sources.filter(source => source.watchedFolder && source.status === 'complete');
    const sources = this.database.sources
      .filter(source => !source.watchedFolder)
      .map(({ id, name, durationSeconds, status, clipCount, reviewCount, importedAt }) => ({ id, name, durationSeconds, status, clipCount, reviewCount, importedAt }));
    if (watchedSources.length) sources.push({
      id: 'watched-commercials-folder',
      name: 'Commercials folder',
      clipCount: watchedSources.reduce((total, source) => total + (Number(source.clipCount) || 0), 0),
      status: 'watching'
    });
    return {
      root: this.root,
      sources,
      clips,
      reviewCount: clips.filter(clip => clip.needsReview && !clip.reviewed).length
    };
  }

  async getClipSource(id) {
    await this.ready();
    const clip = this.database.clips.find(item => item.id === id);
    if (!clip) return null;
    const source = this.database.sources.find(item => item.id === clip.sourceId);
    return source ? { clip: { ...clip }, source: { id: source.id, originalPath: source.originalPath || '', status: source.status } } : null;
  }

  async clipPath(id) {
    await this.ready();
    const clip = this.database.clips.find(item => item.id === id);
    if (!clip) throw new Error('That commercial is no longer in the library.');
    const filePath = containedPath(this.root, clip.file);
    const realRoot = await fs.promises.realpath(this.root);
    const realFile = await fs.promises.realpath(filePath);
    const relative = path.relative(realRoot, realFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Commercial file escaped its local library.');
    return realFile;
  }

  async updateClip(id, patch = {}) {
    await this.ready();
    const clip = this.database.clips.find(item => item.id === id);
    if (!clip) throw new Error('That commercial is no longer in the library.');
    if (typeof patch.enabled === 'boolean') clip.enabled = patch.enabled;
    if (typeof patch.reviewed === 'boolean') {
      clip.reviewed = patch.reviewed;
      clip.needsReview = !patch.reviewed;
    }
    if (typeof patch.title === 'string') clip.title = patch.title.trim().slice(0, 80) || `Commercial ${String(clip.ordinal).padStart(2, '0')}`;
    await this.save();
    return { ...clip };
  }

  async retimeClip(id, startSeconds, endSeconds) {
    await this.ready();
    const clip = this.database.clips.find(item => item.id === id);
    if (!clip) throw new Error('That commercial is no longer in the library.');
    const source = this.database.sources.find(item => item.id === clip.sourceId);
    if (!source) throw new Error('The compilation source for this commercial is missing.');
    const sourcePath = containedPath(this.root, source.file);
    const start = Number(startSeconds);
    const end = Number(endSeconds);
    const duration = end - start;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > Number(source.durationSeconds) + 0.01
      || duration < MIN_CLIP_SECONDS || duration > MAX_CLIP_SECONDS) {
      throw new Error(`Choose a cut from ${MIN_CLIP_SECONDS.toFixed(1)} to ${MAX_CLIP_SECONDS} seconds within the source.`);
    }
    const output = containedPath(this.root, clip.file);
    await this.encodeClip(sourcePath, start, end, output);
    clip.sourceStart = Number(start.toFixed(3));
    clip.sourceEnd = Number(end.toFixed(3));
    clip.durationSeconds = Number(duration.toFixed(3));
    clip.needsReview = false;
    clip.reviewed = true;
    clip.updatedAt = new Date().toISOString();
    await this.save();
    return { ...clip };
  }

  async analyzeProgram(filePath, durationSeconds, onProgress = () => {}) {
    await this.ready();
    const realPath = await fs.promises.realpath(filePath);
    const stat = await fs.promises.stat(realPath);
    if (!stat.isFile()) throw new Error('Choose an available video tape.');
    const duration = Number(durationSeconds);
    const key = crypto.createHash('sha256').update(`${realPath}\0${stat.size}\0${stat.mtimeMs}\0${duration.toFixed(3)}`).digest('hex');
    const cached = this.database.programBreaks[key];
    if (cached) return { ...cached, cached: true };
    const intervals = await this.detectBlackIntervals(realPath, onProgress);
    const plan = chooseProgramBreaks(duration, intervals);
    const result = { ...plan, analyzedAt: new Date().toISOString(), cached: false };
    this.database.programBreaks[key] = result;
    const keys = Object.keys(this.database.programBreaks);
    if (keys.length > 500) {
      for (const oldKey of keys.slice(0, keys.length - 500)) delete this.database.programBreaks[oldKey];
    }
    await this.save();
    return result;
  }
}

module.exports = {
  BREAK_AD_RATIO,
  AD_SECONDS_PER_PROGRAM_SECOND,
  MIN_MIDROLL_SECONDS,
  WATCHED_FILE_STABILITY_MS,
  MIN_CLIP_SECONDS,
  MAX_CLIP_SECONDS,
  CommercialsService,
  parseBlackIntervals,
  parseSilenceIntervals,
  markQuietBlacks,
  mergeBlackIntervals,
  chooseProgramBreaks,
  createCommercialSegments,
  targetCommercialSeconds,
  shouldUseBoundaryBreak,
  findExecutable
};
