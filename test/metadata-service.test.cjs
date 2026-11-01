const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findStrictTvMazeMatch,
  findStrictWikipediaPage,
  lookupMetadata,
  metadataCacheKey,
  normalizeMetadataTitle,
  parseMetadataFilename
} = require('../metadata-service.cjs');

const shelfNames = [
  '03 Treehouse of Horror XXII.avi',
  'Bluey.S01E02.720p.DSNP.WEBRip.x264-GalaxyTV.mkv',
  'Bluey.S01E12.720p.DSNP.WEBRip.x264-GalaxyTV.mkv',
  'Bluey.S01E38.720p.DSNP.WEBRip.x264-GalaxyTV.mkv',
  'Bluey.S02E05.720p.DSNP.WEBRip.x264-GalaxyTV.mkv',
  "Bob's Burgers S08E17 Boywatch.mkv",
  'Carl the Collector EP 5.mp4',
  'Fig Flies A Kite - Missing Muffin.mp4',
  'Hocus.Pocus.1993.1080p.BrRip.x264.YIFY.mp4',
  'In.Your.Dreams.2025.1080p.WEBRip.x264.AAC5.1-[YTS.MX].mp4',
  'S24E02- Treehouse of Horror XXIII.mkv',
  'Spiderman S01E09b (Fifth Avenue Phantom).mp4',
  'The Great British Bake Off S17E05 Dessert Week 1080p ALL4 WEB-DL AAC2 0 H 264-RAWR[EZTVx.to].mkv',
  'The.Simpsons.S25E02.Treehouse.of.Horror.XXIV.720p.WEB-DL.x264.AAC.mp4',
  'snow-toy.story.of.terror.2013.1080p.bluray.x264.mkv'
];

test('parses representative shelf movie and episode filenames', () => {
  assert.equal(shelfNames.length, 15);
  const parsed = shelfNames.map(parseMetadataFilename);
  assert.deepEqual([parsed[1].query, parsed[1].mode, parsed[1].episodeCode, parsed[1].seriesYear], ['Bluey', 'series', 'S01E02', '2018']);
  assert.deepEqual([parsed[5].series, parsed[5].episodeCode, parsed[5].episodeTitle], ["Bob's Burgers", 'S08E17', 'Boywatch']);
  assert.deepEqual([parsed[6].query, parsed[6].episodeCode], ['Carl the Collector', 'EP05']);
  assert.deepEqual([parsed[8].query, parsed[8].year, parsed[8].mode], ['Hocus Pocus', '1993', 'title']);
  assert.deepEqual([parsed[9].query, parsed[9].year, parsed[9].mode], ['In Your Dreams', '2025', 'title']);
  assert.deepEqual([parsed[10].episodeCode, parsed[10].episodeTitle], ['S24E02', 'Treehouse of Horror XXIII']);
  assert.deepEqual([parsed[11].episodeCode, parsed[11].episodeTitle], ['S01E09B', 'Fifth Avenue Phantom']);
  assert.deepEqual([parsed[12].query, parsed[12].episodeCode, parsed[12].episodeTitle], ['The Great British Bake Off', 'S17E05', 'Dessert Week']);
  assert.deepEqual([parsed[13].series, parsed[13].episodeCode, parsed[13].episodeTitle], ['The Simpsons', 'S25E02', 'Treehouse of Horror XXIV']);
  assert.deepEqual([parsed[14].query, parsed[14].year], ['snow-toy story of terror', '2013']);
  assert.equal(metadataCacheKey(shelfNames[1]), metadataCacheKey('Bluey S01E02.mkv'));
  assert.notEqual(metadataCacheKey(shelfNames[1]), metadataCacheKey(shelfNames[2]));
});

test('TV matches require an exact series title and compatible premiere year', () => {
  const unrelated = { score: 0.99, show: { id: 1, name: 'In Your Dreams', premiered: '2023-03-09' } };
  assert.equal(findStrictTvMazeMatch([unrelated], 'In Your Dreams', '2025'), null);
  assert.equal(findStrictTvMazeMatch([unrelated], 'In Your Dreams', '2023')?.show.id, 1);
  assert.equal(findStrictTvMazeMatch([{ ...unrelated, score: 0.59 }], 'In Your Dreams'), null);
  assert.equal(findStrictTvMazeMatch([{ ...unrelated, score: 0.99, show: { ...unrelated.show, name: 'In Your Dream' } }], 'In Your Dreams'), null);
  assert.equal(findStrictTvMazeMatch([unrelated, { score: 0.99, show: { id: 2, name: 'In Your Dreams', premiered: '2023-03-09' } }], 'In Your Dreams'), null);
});

test('Wikipedia title matches are exact and honor the requested year', () => {
  const page = { title: 'Hocus Pocus (1993 film)', description: '1993 American fantasy comedy film' };
  assert.equal(findStrictWikipediaPage([page], 'Hocus Pocus', '1993'), page);
  assert.equal(findStrictWikipediaPage([page], 'Hocus Pocus', '2025'), null);
  assert.equal(findStrictWikipediaPage([{ title: 'Hocus Pocus 2' }], 'Hocus Pocus'), null);
  assert.equal(findStrictWikipediaPage([page, { title: 'Hocus Pocus (1993 movie)', description: '1993 film' }], 'Hocus Pocus', '1993'), null);
  assert.equal(normalizeMetadataTitle('The Simpsons'), normalizeMetadataTitle('the-simpsons'));
});

test('an exact film page wins over same-title pages mentioning its year in excerpts', () => {
  const film = { title: 'Hocus Pocus (1993 film)', description: '1993 film by Kenny Ortega' };
  const pages = [
    film,
    { title: 'Hocus Pocus (franchise)', description: 'Disney media franchise', excerpt: 'The 1993 film and its sequel' },
    { title: 'Hocus Pocus', description: 'Topics referred to by the same term', excerpt: 'The 1993 film' },
    { title: 'Hocus Pocus (soundtrack)', description: '2013 soundtrack album', excerpt: 'music for the 1993 film' }
  ];
  assert.equal(findStrictWikipediaPage(pages, 'Hocus Pocus', '1993'), film);
});

test('movie lookup never falls through to a similarly named TV series', async () => {
  const calls = [];
  const result = await lookupMetadata('In.Your.Dreams.2025.1080p.WEBRip.x264.mp4', async url => {
    calls.push(url);
    if (url.includes('tvmaze.com')) return [{ score: 0.99, show: { id: 7, name: 'In Your Dreams', premiered: '2023-01-01' } }];
    if (url.includes('/search/page')) return { pages: [{ title: 'In Your Dreams (2023 television series)', description: 'Australian animated series premiered in 2023' }] };
    throw new Error(`Unexpected request ${url}`);
  });
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /wikipedia\.org/);
  assert.doesNotMatch(calls[0], /tvmaze\.com/);
});

test('TV lookup uses TVmaze only and surfaces a unique exact match', async () => {
  const calls = [];
  const result = await lookupMetadata('Bluey.S01E02.720p.WEBRip.mkv', async url => {
    calls.push(url);
    return [{ score: 0.99, show: { id: 1, name: 'Bluey', premiered: '2018-10-01', type: 'Animation', image: { medium: 'https://static.tvmaze.com/bluey.jpg' }, summary: '<p>A family comedy.</p>' } }];
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.tvmaze\.com/);
  assert.deepEqual([result.title, result.year, result.source], ['Bluey', '2018', 'TVmaze']);
  assert.equal(result.image, 'https://static.tvmaze.com/bluey.jpg');
});

test('same-title TV listings with different years stay unmatched without evidence', () => {
  const matches = [
    { score: 0.888, show: { id: 41821, name: 'Bluey', premiered: '2018-10-01' } },
    { score: 0.877, show: { id: 56351, name: 'Bluey', premiered: '1976-08-02' } }
  ];
  assert.equal(findStrictTvMazeMatch(matches, 'Bluey'), null);
});

test('the shelf Bluey filename selects the 2018 animated series', async () => {
  const matches = [
    { score: 0.888, show: { id: 41821, name: 'Bluey', premiered: '2018-10-01', type: 'Animation' } },
    { score: 0.877, show: { id: 56351, name: 'Bluey', premiered: '1976-08-02', type: 'Scripted' } }
  ];
  const result = await lookupMetadata(parseMetadataFilename('Bluey.S01E12.720p.DSNP.WEBRip.mkv'), async url => {
    assert.match(url, /search\/shows\?q=Bluey/);
    return matches;
  });
  assert.deepEqual([result?.title, result?.year], ['Bluey', '2018']);
});

test('episode title evidence selects the exact Spider-Man series', async () => {
  const calls = [];
  const result = await lookupMetadata(parseMetadataFilename('Spiderman S01E09b (Fifth Avenue Phantom).mp4'), async url => {
    calls.push(url);
    if (url.includes('/search/shows?')) return [
      { score: 0.91, show: { id: 1611, name: 'Spider-Man', premiered: '1994-11-19', type: 'Animation' } },
      { score: 0.89, show: { id: 4107, name: 'Spider-Man', premiered: '1967-09-09', type: 'Animation' } }
    ];
    if (url.endsWith('/shows/1611/episodes')) return [{ name: 'The Incredible Shrinking Spider-Man', season: 1, number: 9 }];
    if (url.endsWith('/shows/4107/episodes')) return [{ name: 'The One-Eyed Idol/Fifth Avenue Phantom', season: 1, number: 9 }];
    throw new Error(`Unexpected request ${url}`);
  });
  assert.deepEqual([result?.title, result?.year], ['Spider-Man', '1967']);
  assert.equal(calls.length, 3);
});

test('an unavailable provider remains a retryable error, not a cached miss', async () => {
  await assert.rejects(() => lookupMetadata('Hocus.Pocus.1993.mp4', async () => { throw new Error('offline'); }), /offline/);
});

test('a transient provider error can be retried successfully for the same filename', async () => {
  let attempts = 0;
  const fetchThenRecover = async url => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary outage');
    assert.match(url, /wikipedia\.org/);
    return { pages: [{ title: 'Hocus Pocus (1993 film)', description: '1993 film by Kenny Ortega' }] };
  };
  await assert.rejects(() => lookupMetadata('Hocus.Pocus.1993.mp4', fetchThenRecover), /temporary outage/);
  const result = await lookupMetadata('Hocus.Pocus.1993.mp4', fetchThenRecover);
  assert.equal(result?.title, 'Hocus Pocus');
  assert.equal(attempts, 2);
});
