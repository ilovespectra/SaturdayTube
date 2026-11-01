const path = require('node:path');

const RELEASE_TAG = /\b(?:2160p|1440p|1080p|720p|480p|4k|8k|uhd|hdr|web[- ]?dl|web[- ]?rip|bluray|blu[- ]?ray|brrip|hdtv|dvdrip|x26[45]|h26[45]|hevc|av1|aac|dts|proper|repack|extended|remastered|multi|dubbed|subbed|galaxytv|yify|eztv)\b.*$/i;
const YEAR_PATTERN = /\b((?:19|20)\d{2})\b/;
// This shelf's Bluey files belong to the modern animated series; its episode guide
// includes The Sign, unlike the unrelated 1976 Bluey Hills listing.
const SERIES_PREMIERE_HINTS = new Map([['bluey', '2018']]);

function cleanTitle(value) {
  return String(value || '')
    .replace(RELEASE_TAG, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .replace(/[._]+/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/^\s*\d{1,3}[\s.-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .trim();
}

function parseMetadataFilename(filename) {
  const original = path.basename(String(filename || ''));
  const basename = original.replace(/\.[^.]+$/, '');
  const year = (basename.match(YEAR_PATTERN) || [])[1] || '';
  const withoutRelease = basename.replace(RELEASE_TAG, ' ');
  const seasonEpisode = /^(.*?)\bS(\d{1,2})[ ._-]*E(\d{1,2})([A-Z])?\b([\s\S]*)$/i.exec(withoutRelease);
  const numericEpisode = seasonEpisode ? null : /^(.*?)\b(\d{1,2})x(\d{2})([A-Z])?\b([\s\S]*)$/i.exec(withoutRelease);
  const simpleEpisode = seasonEpisode || numericEpisode;
  if (simpleEpisode) {
    const series = cleanTitle(simpleEpisode[1]);
    const season = seasonEpisode ? Number(simpleEpisode[2]) : Number(simpleEpisode[2]);
    const episode = seasonEpisode ? Number(simpleEpisode[3]) : Number(simpleEpisode[3]);
    const part = (seasonEpisode ? simpleEpisode[4] : simpleEpisode[4]) || '';
    const episodeTitle = cleanTitle(simpleEpisode[5]);
    const episodeCode = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}${part.toUpperCase()}`;
    const query = series || episodeTitle || cleanTitle(withoutRelease.replace(/\bS\d{1,2}[ ._-]*E\d{1,2}[A-Z]?\b|\b\d{1,2}x\d{2}[A-Z]?\b/i, ' '));
    return { filename: original, basename, query, displayTitle: series || query, year, seriesYear: SERIES_PREMIERE_HINTS.get(normalizeMetadataTitle(series)) || '', mode: series ? 'series' : 'title', series, episodeCode, episodeTitle };
  }
  const simpleEpisodeMatch = /^(.*?)\bEP\s*0*(\d+)([A-Z])?\b([\s\S]*)$/i.exec(withoutRelease);
  if (simpleEpisodeMatch) {
    const series = cleanTitle(simpleEpisodeMatch[1]);
    const episodeTitle = cleanTitle(simpleEpisodeMatch[4]);
    const episodeCode = `EP${String(Number(simpleEpisodeMatch[2])).padStart(2, '0')}${(simpleEpisodeMatch[3] || '').toUpperCase()}`;
    const query = series || episodeTitle || cleanTitle(withoutRelease.replace(/\bEP\s*0*\d+[A-Z]?\b/i, ' '));
    return { filename: original, basename, query, displayTitle: series || query, year, seriesYear: SERIES_PREMIERE_HINTS.get(normalizeMetadataTitle(series)) || '', mode: series ? 'series' : 'title', series, episodeCode, episodeTitle };
  }
  const title = cleanTitle(withoutRelease);
  return { filename: original, basename, query: title, displayTitle: title, year, seriesYear: '', mode: 'title', series: '', episodeCode: '', episodeTitle: '' };
}

function normalizeMetadataTitle(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '');
}

function cleanWikipediaTitle(value) {
  return String(value || '').replace(/\s+\([^()]*\)\s*$/, '').trim();
}

function exactTvMazeCandidates(results, query) {
  const wanted = normalizeMetadataTitle(query);
  const exact = (Array.isArray(results) ? results : []).filter(result => {
    const show = result?.show;
    const score = Number(result?.score);
    return Boolean(show?.name && normalizeMetadataTitle(show.name) === wanted && Number.isFinite(score) && score >= 0.6);
  });
  return [...new Map(exact.map(result => [String(result.show.id ?? `${result.show.name}:${result.show.premiered || ''}`), result])).values()];
}

function findStrictTvMazeMatch(results, query, year = '') {
  const exact = exactTvMazeCandidates(results, query).filter(result => {
    const premiered = String(result.show.premiered || '').slice(0, 4);
    return !year || premiered === year;
  });
  return exact.length === 1 ? exact[0] : null;
}

async function findTvMazeEpisodeMatch(results, request, fetchJson) {
  const candidates = exactTvMazeCandidates(results, request.query);
  const code = /^S(\d{2})E(\d{2})[A-Z]?$/.exec(String(request.episodeCode || '').toUpperCase());
  const episodeTitle = normalizeMetadataTitle(request.episodeTitle);
  if (candidates.length < 2 || (!code && !episodeTitle)) return null;

  const evidence = await Promise.all(candidates.map(async result => {
    if (!Number.isInteger(Number(result.show.id))) return null;
    const episodes = await fetchJson(`https://api.tvmaze.com/shows/${Number(result.show.id)}/episodes`);
    if (!Array.isArray(episodes)) return null;
    const matched = episodes.some(episode => {
      if (code && (Number(episode.season) !== Number(code[1]) || Number(episode.number) !== Number(code[2]))) return false;
      if (!episodeTitle) return true;
      return String(episode.name || '').split(/[\/|]+/).some(part => normalizeMetadataTitle(part) === episodeTitle);
    });
    return matched ? result : null;
  }));
  const unique = evidence.filter(Boolean);
  return unique.length === 1 ? unique[0] : null;
}

function findStrictWikipediaPage(pages, query, year = '') {
  const wanted = normalizeMetadataTitle(query);
  const exactTitle = (Array.isArray(pages) ? pages : []).filter(page =>
    page?.title && normalizeMetadataTitle(cleanWikipediaTitle(page.title)) === wanted
  );
  if (!year) return exactTitle.length === 1 ? exactTitle[0] : null;
  // Search excerpts often mention a film's year while describing a franchise,
  // soundtrack, or disambiguation page. Only the page identity can establish it.
  const exactYear = exactTitle.filter(page =>
    new RegExp(`\\b${year}\\b`).test([page.title, page.description].join(' '))
  );
  return exactYear.length === 1 ? exactYear[0] : null;
}

function requestSpec(input) {
  if (typeof input === 'string') return parseMetadataFilename(input);
  if (!input || typeof input !== 'object') return parseMetadataFilename('');
  const query = cleanTitle(input.query);
  const year = /^\d{4}$/.test(String(input.year || '')) ? String(input.year) : '';
  const seriesYear = /^\d{4}$/.test(String(input.seriesYear || '')) ? String(input.seriesYear) : '';
  const series = cleanTitle(input.series || '');
  const episodeCode = /^S\d{2}E\d{2}[A-Z]?$|^EP\d{2,}[A-Z]?$/i.test(String(input.episodeCode || '')) ? String(input.episodeCode).toUpperCase() : '';
  const episodeTitle = cleanTitle(input.episodeTitle || '');
  return { query, year, seriesYear, mode: input.mode === 'series' ? 'series' : 'title', series, episodeCode, episodeTitle, displayTitle: cleanTitle(input.displayTitle || query) };
}

async function lookupMetadata(input, fetchJson) {
  const request = requestSpec(input);
  const { query, year } = request;
  if (query.length < 2 || query.length > 100) return null;
  if (typeof fetchJson !== 'function') throw new TypeError('A metadata fetch function is required.');

  if (request.mode === 'series') {
    const results = await fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    const match = findStrictTvMazeMatch(results, query, request.seriesYear || year) || await findTvMazeEpisodeMatch(results, request, fetchJson);
    if (!match) return null;
    const show = match.show;
    return {
      title: show.name,
      year: String(show.premiered || '').slice(0, 4),
      kind: show.type || 'TV',
      detail: String(show.summary || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 260),
      image: show.image?.medium || show.image?.original || '',
      url: show.url || '',
      source: 'TVmaze'
    };
  }

  const search = await fetchJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(`${query} ${year}`.trim())}&limit=10`);
  const pages = Array.isArray(search?.pages) ? search.pages : [];
  const page = findStrictWikipediaPage(pages, query, year);
  if (!page) return null;
  let image = page.thumbnail?.source || page.thumbnail?.url || '';
  if (!image && page.key) {
    try {
      const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
      image = summary.thumbnail?.source || summary.originalimage?.source || '';
    } catch { /* Keep the exact title match, without artwork, if only the image service fails. */ }
  }
  const text = [page.title, page.description, page.excerpt].join(' ');
  const inferredYear = (text.match(YEAR_PATTERN) || [])[1] || '';
  return {
    title: cleanWikipediaTitle(page.title) || query,
    year: year || inferredYear,
    kind: 'Reference',
    detail: String(page.description || page.excerpt || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 260),
    image,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.key || page.title).replace(/ /g, '_'))}`,
    source: 'Wikipedia'
  };
}

function metadataCacheKey(filename) {
  const parsed = parseMetadataFilename(filename);
  const query = normalizeMetadataTitle(parsed.query);
  return [parsed.mode, query, parsed.year, parsed.seriesYear, parsed.episodeCode, parsed.episodeTitle && normalizeMetadataTitle(parsed.episodeTitle)].filter(Boolean).join(':');
}

module.exports = {
  cleanTitle,
  parseMetadataFilename,
  normalizeMetadataTitle,
  cleanWikipediaTitle,
  findStrictTvMazeMatch,
  findStrictWikipediaPage,
  lookupMetadata,
  metadataCacheKey
};
