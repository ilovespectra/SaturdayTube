(function attachYoutubeSources(root, create) {
  const api = create();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaturdayTubeYouTubeSources = api;
})(typeof globalThis === 'object' ? globalThis : this, function createYoutubeSources() {
  const DEFAULT_STARTERS = Object.freeze([
    Object.freeze({
      id: 'vh1', name: 'Mixtape Rewind',
      programUrl: 'https://www.youtube.com/playlist?list=PLiy0XOfUv4hFH2HbflPOARBXA6qN90mHt',
      commercialsUrl: 'https://www.youtube.com/watch?v=L0CQEEtaoY0'
    }),
    Object.freeze({
      id: 'mtv', name: 'Jam Sessions',
      programUrl: 'https://www.youtube.com/playlist?list=PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i',
      commercialsUrl: 'https://www.youtube.com/playlist?list=PLLVo3pOp9VjWrqo6pL8iH4QyZ-HklpCoP'
    }),
    Object.freeze({
      id: 'pbs-kids', name: 'Storytime Garden',
      programUrl: 'https://www.youtube.com/playlist?list=PLRM5fZauTNuA',
      commercialsUrl: 'https://www.youtube.com/playlist?list=PLn5YyF5x2FFvPkw40Q07AD5b-dN9W5LC4'
    }),
    Object.freeze({
      id: 'nick', name: 'Bubble Bay',
      programUrl: 'https://www.youtube.com/playlist?list=PLpsOhwH8agOW5fwcWufaifhMs8j4X5rmi',
      commercialsUrl: 'https://www.youtube.com/playlist?list=PLWHVjbPtMDwZjCm3pZqMgPCNJ1dt0_gWA'
    })
  ]);
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,128}$/;
  const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

  function parseYouTubeSource(value, { playlistOnly = false } = {}) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let url;
    try { url = new URL(value.trim()); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'youtu.be' && !YOUTUBE_HOSTS.has(host)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    let list = url.searchParams.get('list') || '';
    if (!list && parts[0] === 'show' && /^VLPL[A-Za-z0-9_-]{8,}$/.test(parts[1] || '')) {
      // Legacy YouTube show URLs expose the equivalent playlist as `VL` + playlist ID.
      list = parts[1].slice(2);
    }
    if (list && PLAYLIST_ID.test(list)) return { kind: 'playlist', id: list };
    if (playlistOnly) return null;

    let video = '';
    if (host === 'youtu.be') video = parts[0] || '';
    else if (parts[0] === 'watch') video = url.searchParams.get('v') || '';
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) video = parts[1] || '';
    return VIDEO_ID.test(video) ? { kind: 'video', id: video } : null;
  }

  function canonicalYouTubeUrl(source) {
    if (!source || typeof source.id !== 'string') return '';
    if (source.kind === 'playlist' && PLAYLIST_ID.test(source.id)) return `https://www.youtube.com/playlist?list=${encodeURIComponent(source.id)}`;
    if (source.kind === 'video' && VIDEO_ID.test(source.id)) return `https://www.youtube.com/watch?v=${encodeURIComponent(source.id)}`;
    return '';
  }

  function normalizeStarterConfigurations(saved) {
    const rows = Array.isArray(saved) ? saved : [];
    return DEFAULT_STARTERS.map(starter => {
      const row = rows.find(candidate => candidate && candidate.id === starter.id) || {};
      const programUrl = Object.prototype.hasOwnProperty.call(row, 'programUrl') ? row.programUrl : starter.programUrl;
      const commercialsUrl = Object.prototype.hasOwnProperty.call(row, 'commercialsUrl') ? row.commercialsUrl : starter.commercialsUrl;
      const program = parseYouTubeSource(programUrl);
      const commercials = parseYouTubeSource(commercialsUrl);
      return {
        ...starter,
        program,
        commercials,
        programUrl: canonicalYouTubeUrl(program),
        commercialsUrl: canonicalYouTubeUrl(commercials)
      };
    });
  }

  function serializeStarterConfigurations(configurations) {
    return normalizeStarterConfigurations(configurations).map(row => ({
      id: row.id,
      programUrl: row.programUrl,
      commercialsUrl: row.commercialsUrl
    }));
  }

  return Object.freeze({ DEFAULT_STARTERS, parseYouTubeSource, canonicalYouTubeUrl, normalizeStarterConfigurations, serializeStarterConfigurations });
});
