(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SaturdayMoviePreroll = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  function isFeatureMovie(durationSeconds) {
    return Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 59 * 60;
  }

  function selectMovieTrailers(trailers, random = Math.random, excludedPath = '') {
    const unique = [];
    const seen = new Set();
    for (const trailer of Array.isArray(trailers) ? trailers : []) {
      if (!trailer || typeof trailer.path !== 'string' || !trailer.path || !trailer.url || trailer.path === excludedPath || seen.has(trailer.path)) continue;
      seen.add(trailer.path);
      unique.push(trailer);
    }
    if (!unique.length) return [];
    const shuffled = [...unique];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const sample = Number(random());
      const other = Math.max(0, Math.min(index, Math.floor((Number.isFinite(sample) ? sample : 0) * (index + 1))));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const sample = Number(random());
    const requested = 4 + Math.floor(Math.max(0, Math.min(0.999999, Number.isFinite(sample) ? sample : 0)) * 4);
    return shuffled.slice(0, Math.min(requested, shuffled.length));
  }

  return { isFeatureMovie, selectMovieTrailers };
});
