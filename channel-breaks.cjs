const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BREAK_ANALYSIS_VERSION = 2;
// A break may land a little early on a clean fade to black, but otherwise waits for the next lull.
const BREAK_SEARCH_BEFORE_SECONDS = 60;
const BREAK_SEARCH_AFTER_SECONDS = 150;
const MIN_BREAK_SEGMENT_SECONDS = 120;
const BREAK_ANALYSIS_TIMEOUT_MS = 180_000;
const MAX_BREAK_CACHE_ENTRIES = 20_000;
const LEVEL_SAMPLE_RATE = 8000;
const LEVEL_FRAME_SECONDS = 0.02;
const SILENCE_DB = -42;
const QUIET_BELOW_MEDIAN_DB = 14;
// One dB of loudness is worth about six seconds of distance from the planned cut.
const DB_PER_SECOND_AWAY = 1 / 6;
const EARLY_CUT_PENALTY_DB = 2;
const BLACK_BONUS_DB = 18;

function breakCacheKey(entry) {
  return [
    entry.path,
    Math.round(Number(entry.size) || 0),
    Math.round(Number(entry.modified) || 0),
    (Number(entry.targetSeconds) || 0).toFixed(1),
    (Number(entry.minSeconds) || 0).toFixed(1),
    Number.isFinite(Number(entry.maxSeconds)) ? Number(entry.maxSeconds).toFixed(1) : ''
  ].join('|');
}

function pcmLevels(buffer, sampleRate = LEVEL_SAMPLE_RATE, frameSeconds = LEVEL_FRAME_SECONDS) {
  const samples = Math.floor((buffer?.length || 0) / 2);
  const frameSamples = Math.max(1, Math.round(sampleRate * frameSeconds));
  const levels = [];
  for (let start = 0; start + frameSamples <= samples; start += frameSamples) {
    let power = 0;
    for (let index = start; index < start + frameSamples; index += 1) {
      const value = buffer.readInt16LE(index * 2) / 32768;
      power += value * value;
    }
    levels.push(power / frameSamples);
  }
  return levels;
}

function toDb(power) {
  return 10 * Math.log10(Math.max(power, 1e-10));
}

// Mean loudness over a span centred on each frame; a pause between sentences reads far quieter than any gap inside a word.
function smoothedLevelsDb(levels, spanFrames) {
  const prefix = [0];
  for (const value of levels) prefix.push(prefix[prefix.length - 1] + value);
  const half = Math.floor(spanFrames / 2);
  return levels.map((_, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(levels.length, index + half + 1);
    return toDb((prefix[to] - prefix[from]) / Math.max(1, to - from));
  });
}

function breakAnalysisWindow(targetSeconds, mediaDurationSeconds) {
  const media = Math.max(0, Number(mediaDurationSeconds) || 0);
  const start = Math.max(0, Number(targetSeconds) - BREAK_SEARCH_BEFORE_SECONDS);
  const end = Math.min(media || Infinity, Number(targetSeconds) + BREAK_SEARCH_AFTER_SECONDS);
  return { start, durationSeconds: Math.max(0, end - start) };
}

function parseBreakAnalysis(stderr, windowStart = 0, windowDuration = Infinity) {
  const offset = Number(windowStart) || 0;
  const blacks = [];
  const silences = [];
  const openSilence = new Map();
  for (const line of String(stderr || '').split(/\r?\n/)) {
    const black = line.match(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/);
    if (black) {
      blacks.push({ start: offset + Number(black[1]), end: offset + Number(black[2]) });
      continue;
    }
    const silence = line.match(/Parsed_silencedetect_(\d+)[^\]]*\]\s*silence_(start|end):\s*(-?[\d.]+)/);
    if (!silence) continue;
    const tier = Number(silence[1]) === 0 ? 0 : 1;
    const seconds = Math.max(0, Number(silence[3]));
    if (silence[2] === 'start') openSilence.set(tier, seconds);
    else if (openSilence.has(tier)) {
      silences.push({ start: offset + openSilence.get(tier), end: offset + seconds, tier });
      openSilence.delete(tier);
    }
  }
  for (const [tier, start] of openSilence) {
    if (Number.isFinite(windowDuration)) silences.push({ start: offset + start, end: offset + windowDuration, tier });
  }
  return { blacks, silences };
}

// Picks the quietest real pause near the planned cut, strongly preferring a fade to black. Distance from the plan and
// cutting early cost a little; loudness costs far more, so a break never lands on speech when a pause exists nearby.
function chooseBreakPoint({ targetSeconds, minSeconds = 0, maxSeconds = Infinity, blacks = [], levels = [], levelsStartSeconds = 0, frameSeconds = LEVEL_FRAME_SECONDS }) {
  const target = Number(targetSeconds);
  const lower = Math.max(0, Number(minSeconds) || 0);
  const upper = Number.isFinite(Number(maxSeconds)) ? Number(maxSeconds) : Infinity;
  const nominal = { seconds: Math.min(Math.max(target, lower), upper), kind: 'nominal' };
  const short = levels.length ? smoothedLevelsDb(levels, Math.round(0.5 / frameSeconds)) : [];
  const long = levels.length ? smoothedLevelsDb(levels, Math.round(1.2 / frameSeconds)) : [];
  const sorted = [...short].sort((left, right) => left - right);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const loudnessAt = seconds => {
    if (!short.length) return null;
    const index = Math.round((seconds - levelsStartSeconds) / frameSeconds);
    if (index < 0 || index >= short.length) return null;
    return (short[index] * 2 + long[index]) / 3;
  };
  const distanceCost = seconds => Math.abs(seconds - target) * DB_PER_SECOND_AWAY + (seconds < target ? EARLY_CUT_PENALTY_DB : 0);
  let best = null;
  const consider = (seconds, kind, score) => {
    if (!Number.isFinite(seconds) || seconds < lower || seconds > upper) return;
    if (!best || score < best.score) best = { seconds, kind, score };
  };
  for (const black of blacks) {
    const duration = Number(black.end) - Number(black.start);
    if (!(duration > 0)) continue;
    const seconds = Number(black.start) + duration / 2;
    const loudness = loudnessAt(seconds);
    consider(seconds, 'black', (loudness ?? median) - BLACK_BONUS_DB - Math.min(duration, 2) * 2 + distanceCost(seconds));
  }
  for (let index = 0; index < short.length; index += 1) {
    const seconds = levelsStartSeconds + index * frameSeconds;
    const loudness = (short[index] * 2 + long[index]) / 3;
    const kind = loudness <= SILENCE_DB || loudness <= median - QUIET_BELOW_MEDIAN_DB ? 'silence' : 'lull';
    consider(seconds, kind, loudness + distanceCost(seconds));
  }
  if (!best) return nominal;
  return { seconds: Math.round(best.seconds * 1000) / 1000, kind: best.kind };
}

function runAnalysis(executable, args, timeoutMs = BREAK_ANALYSIS_TIMEOUT_MS, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], signal, killSignal: 'SIGKILL' });
    try { os.setPriority(child.pid, 15); } catch {}
    let stderr = '';
    const stdout = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr, stdout: Buffer.concat(stdout) });
      else reject(new Error(`FFmpeg break analysis exited with ${code}`));
    });
  });
}

class ChannelBreakFinder {
  constructor({ cachePath, getExecutable, onResolved = () => {}, isAllowedPath = () => true, platform = process.platform, run = runAnalysis }) {
    this.cachePath = cachePath;
    this.getExecutable = getExecutable;
    this.onResolved = onResolved;
    this.isAllowedPath = isAllowedPath;
    this.platform = platform;
    this.run = run;
    this.cache = new Map();
    this.pending = new Map();
    this.working = false;
    this.paused = false;
    this.analysisController = null;
    this.loadPromise = null;
    this.saveTimer = null;
    this.saveChain = Promise.resolve();
  }

  setPaused(paused) {
    this.paused = paused === true;
    if (this.paused) this.analysisController?.abort();
    else void this.work();
  }

  load() {
    if (!this.loadPromise) {
      this.loadPromise = fs.promises.readFile(this.cachePath, 'utf8').then(text => {
        const parsed = JSON.parse(text);
        if (parsed?.version !== BREAK_ANALYSIS_VERSION || !parsed.entries || typeof parsed.entries !== 'object') return;
        for (const [key, value] of Object.entries(parsed.entries)) {
          if (Number.isFinite(Number(value?.seconds)) && typeof value?.kind === 'string') this.cache.set(key, { seconds: Number(value.seconds), kind: value.kind });
        }
      }).catch(() => {});
    }
    return this.loadPromise;
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const entries = Object.fromEntries([...this.cache].slice(-MAX_BREAK_CACHE_ENTRIES));
      const snapshot = JSON.stringify({ version: BREAK_ANALYSIS_VERSION, entries });
      this.saveChain = this.saveChain.then(async () => {
        const temporary = `${this.cachePath}.${process.pid}.tmp`;
        await fs.promises.mkdir(path.dirname(this.cachePath), { recursive: true });
        await fs.promises.writeFile(temporary, snapshot, { mode: 0o600 });
        await fs.promises.rename(temporary, this.cachePath);
      }).catch(error => console.warn('Channel break cache could not be saved', error?.message || error));
    }, 2000);
    this.saveTimer.unref?.();
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      const entries = Object.fromEntries([...this.cache].slice(-MAX_BREAK_CACHE_ENTRIES));
      const snapshot = JSON.stringify({ version: BREAK_ANALYSIS_VERSION, entries });
      this.saveChain = this.saveChain.then(() => fs.promises.writeFile(this.cachePath, snapshot, { mode: 0o600 })).catch(() => {});
    }
    return this.saveChain;
  }

  // Answers cached cuts immediately; uncached ones are queued and analysed earliest-due first.
  async resolve(entries, now = Date.now()) {
    await this.load();
    const results = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry?.path !== 'string' || !(Number(entry.targetSeconds) > 0) || !this.isAllowedPath(entry.path)) {
        results.push(null);
        continue;
      }
      const key = breakCacheKey(entry);
      const cached = this.cache.get(key);
      if (cached) {
        results.push(cached);
        continue;
      }
      results.push(null);
      const dueAtMs = now + Math.max(0, Number(entry.secondsUntil) || 0) * 1000 - (entry.priority ? 600_000 : 0);
      const existing = this.pending.get(key);
      if (!existing || dueAtMs < existing.dueAtMs) this.pending.set(key, { ...entry, key, dueAtMs, deadlineMs: now + Math.max(0, Number(entry.secondsUntil) || 0) * 1000 });
    }
    void this.work();
    return results;
  }

  async work() {
    if (this.working || this.paused) return;
    this.working = true;
    try {
      while (this.pending.size && !this.paused) {
        const now = Date.now();
        let next = null;
        for (const job of this.pending.values()) {
          // A cut that is about to air can no longer move, so its analysis would be wasted.
          if (job.deadlineMs < now + 15_000) { this.pending.delete(job.key); continue; }
          if (!next || job.dueAtMs < next.dueAtMs) next = job;
        }
        if (!next) break;
        this.pending.delete(next.key);
        const controller = new AbortController();
        this.analysisController = controller;
        const result = await this.analyze(next, controller.signal).catch(error => {
          if (controller.signal.aborted) return null;
          console.warn('Channel break analysis fell back to the planned cut', path.basename(next.path), error?.message || error);
          return { seconds: Number(next.targetSeconds), kind: 'nominal' };
        });
        this.analysisController = null;
        if (controller.signal.aborted) {
          if (!this.pending.has(next.key)) this.pending.set(next.key, next);
          continue;
        }
        this.cache.delete(next.key);
        this.cache.set(next.key, result);
        this.scheduleSave();
        this.onResolved(next.path, result);
      }
    } finally {
      this.working = false;
    }
  }

  async analyze(entry, signal) {
    const executable = await this.getExecutable();
    signal?.throwIfAborted();
    const target = Number(entry.targetSeconds);
    const window = breakAnalysisWindow(target, entry.mediaDurationSeconds);
    if (!executable || !(window.durationSeconds > 1)) return { seconds: target, kind: 'nominal' };
    const input = ['-nostdin', '-hide_banner', '-nostats', '-loglevel', 'info', '-ss', window.start.toFixed(3), '-t', window.durationSeconds.toFixed(3)];
    const videoArgs = [...input];
    if (this.platform === 'darwin') videoArgs.push('-hwaccel', 'videotoolbox');
    videoArgs.push('-i', entry.path, '-map', '0:v:0', '-an', '-vf', 'fps=10,scale=160:-2,blackdetect=d=0.2:pix_th=0.10:pic_th=0.94', '-f', 'null', '-');
    const audioArgs = [...input, '-i', entry.path, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(LEVEL_SAMPLE_RATE), '-f', 's16le', 'pipe:1'];
    const [video, audio] = await Promise.all([
      this.run(executable, videoArgs, BREAK_ANALYSIS_TIMEOUT_MS, signal).catch(() => null),
      this.run(executable, audioArgs, BREAK_ANALYSIS_TIMEOUT_MS, signal).catch(() => null)
    ]);
    if (!video && !audio) throw new Error('FFmpeg could not read the programme around its break.');
    const { blacks } = parseBreakAnalysis(video?.stderr || '', window.start, window.durationSeconds);
    return chooseBreakPoint({
      targetSeconds: target,
      minSeconds: Number(entry.minSeconds) || 0,
      maxSeconds: Number.isFinite(Number(entry.maxSeconds)) ? Number(entry.maxSeconds) : Infinity,
      blacks,
      levels: audio?.stdout?.length ? pcmLevels(audio.stdout) : [],
      levelsStartSeconds: window.start
    });
  }
}

module.exports = {
  BREAK_ANALYSIS_VERSION,
  BREAK_SEARCH_BEFORE_SECONDS,
  BREAK_SEARCH_AFTER_SECONDS,
  MIN_BREAK_SEGMENT_SECONDS,
  ChannelBreakFinder,
  breakAnalysisWindow,
  breakCacheKey,
  chooseBreakPoint,
  parseBreakAnalysis,
  pcmLevels
};
