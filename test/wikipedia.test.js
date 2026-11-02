import test from 'node:test';
import assert from 'node:assert/strict';
import { maskExtract, isGoodTopic, toCard, fetchWikiCards, refillPool, fetchOnThisDay, parseArticle, fetchArticle } from '../www/js/wikipedia.js';
import { DOMAINS } from '../www/js/domains.js';
import { defaultData } from '../www/js/store.js';

const CURIE = "Marie Curie (ou Marie Skłodowska-Curie), née le 7 novembre 1867 à Varsovie et morte le 4 juillet 1934, est une physicienne et chimiste polonaise. Elle est la première femme à avoir reçu le prix Nobel.";

test('le masque cache les mots du titre et les parenthèses qui donneraient la réponse', () => {
  const masked = maskExtract('Marie Curie', CURIE);
  assert.ok(!/Curie|Marie|Skłodowska/.test(masked), masked);
  assert.match(masked, /physicienne/);
  assert.ok(masked.startsWith('▁▁▁'), masked);
});

test('le masque ignore casse, accents, pluriel et élision', () => {
  const masked = maskExtract('Mitochondrie', "Une mitochondrie est un organite. Les mitochondries possèdent une double membrane. L'énergie de la Mitochondrie est connue.");
  assert.ok(!/mitochondri/i.test(masked), masked);
  assert.ok(maskExtract('Égypte', "L'Egypte est un pays d'Afrique du Nord traversé par le Nil.").startsWith("L'▁▁▁"));
});

test('le masque ne touche pas aux petits mots, et ignore la précision entre parenthèses', () => {
  const masked = maskExtract('Le Parrain (film)', 'Le Parrain est un film de Francis Ford Coppola sorti en 1972 aux États-Unis.');
  assert.match(masked, /est un film de Francis/);
  assert.ok(!/Parrain/.test(masked));
});

test('le résumé ne coupe pas après une abréviation', () => {
  const masked = maskExtract('Hannibal', 'Hannibal naît en 247 av. J.-C. à Carthage et y grandit au milieu des guerres. Il meurt en Bithynie.');
  assert.match(masked, /av\. J\.-C\. à Carthage/);
});

test('les listes, les dates et les pages d\'homonymie sont écartées', () => {
  const long = 'x'.repeat(120);
  assert.equal(isGoodTopic('Liste des rois de France', long), false);
  assert.equal(isGoodTopic('1789', long), false);
  assert.equal(isGoodTopic('Mercure (homonymie)', long), false);
  assert.equal(isGoodTopic('Mercure', 'Mercure peut désigner plusieurs choses'.padEnd(120, '.')), false);
  assert.equal(isGoodTopic('Mercure', 'trop court'), false);
  assert.equal(isGoodTopic('Mercure', long), true);
});

test('une page Wikipédia devient une carte complète', () => {
  const card = toCard({ pageid: 7, title: 'Marie Curie', extract: CURIE, description: 'physicienne', thumbnail: { source: 'https://img/x.jpg' } }, 'physique');
  assert.equal(card.id, 'wiki-7');
  assert.equal(card.a, 'Marie Curie');
  assert.equal(card.domain, 'physique');
  assert.equal(card.image, 'https://img/x.jpg');
  assert.equal(card.url, 'https://fr.wikipedia.org/wiki/Marie_Curie');
  assert.ok(!card.q.includes('Curie'));
});

function fakeWiki() {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const body = params.get('list') === 'categorymembers'
      ? { query: { categorymembers: Array.from({ length: 15 }, (_, i) => ({ title: `Discussion:Sujet ${i}` })) } }
      : { query: { pages: Object.fromEntries(params.get('titles').split('|').map((title, i) => [i + 1, { pageid: i + 1, title, extract: `${title} est un sujet tout à fait passionnant dont le résumé dépasse largement la longueur minimale.` }])) } };
    return { ok: true, json: async () => body };
  };
  return { fetchFn, calls };
}

test('la récupération passe des pages de discussion aux articles', async () => {
  const { fetchFn, calls } = fakeWiki();
  const cards = await fetchWikiCards(DOMAINS[0], {}, { fetchFn });
  assert.equal(cards.length, 5);
  assert.ok(cards.every((c) => c.domain === DOMAINS[0].id && c.q.startsWith('▁▁▁')));
  assert.match(new URL(calls[0]).searchParams.get('cmtitle'), /^Catégorie:Article du projet .* d'importance (maximum|élevée)$/);
  assert.ok(!new URL(calls[1]).searchParams.get('titles').includes('Discussion:'));
});

test('un article déjà vu ne revient pas', async () => {
  const { fetchFn } = fakeWiki();
  const seen = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`wiki-${i + 1}`, 1]));
  assert.deepEqual(await fetchWikiCards(DOMAINS[0], seen, { fetchFn }), []);
});

test('la réserve se remplit sans doublon et tolère une panne réseau', async () => {
  const data = defaultData();
  const { fetchFn } = fakeWiki();
  assert.equal(await refillPool(data, { fetchFn }), true);
  assert.ok(data.wikiPool.length > 0);
  assert.equal(new Set(data.wikiPool.map((c) => c.id)).size, data.wikiPool.length);

  const offline = defaultData();
  assert.equal(await refillPool(offline, { fetchFn: async () => { throw new Error('hors ligne'); } }), false);
  assert.equal(offline.wikiPool.length, 0);
});

test('l\'éphéméride est nettoyée', async () => {
  const entry = { year: 1930, text: 'Haïlé Sélassié (photo) est sacré.', pages: [{ title: 'Haïlé_Sélassié_Ier', normalizedtitle: 'Haïlé Sélassié Ier' }] };
  const fetchFn = async () => ({ ok: true, json: async () => ({ selected: [entry, entry] }) });
  const event = await fetchOnThisDay(new Date(2026, 10, 2), { fetchFn });
  assert.deepEqual(event, { year: 1930, text: 'Haïlé Sélassié est sacré.', topic: 'Haïlé Sélassié Ier' });
});

const ARTICLE = [
  "Une introduction.",
  '',
  'Son deuxième paragraphe.',
  '',
  '== Histoire ==',
  'Le début de l\'histoire.',
  '',
  '=== Antiquité ===',
  'Chez les Grecs, la formule',
  '',
  '  ',
  '    ',
  '      E',
  '      {\\displaystyle E=mc^{2}}',
  'reste célèbre.',
  '',
  '=== Sous-partie vide ===',
  '',
  '== Partie vide ==',
  '',
  '== Notes et références ==',
  'Une note.',
  '',
  '=== Liens ===',
  'Un lien.',
  '',
  '== Voir aussi ==',
  'Autre chose.',
].join('\n');

test('un article se découpe en introduction et en parties', () => {
  const { intro, sections } = parseArticle(ARTICLE);
  assert.deepEqual(intro, ['Une introduction.', 'Son deuxième paragraphe.']);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, 'Histoire');
  assert.deepEqual(sections[0].blocks, [
    { text: 'Le début de l\'histoire.' },
    { heading: 'Antiquité' },
    { text: 'Chez les Grecs, la formule' },
    { text: 'reste célèbre.' },
  ]);
});

test('un article récupéré garde son vrai titre après redirection', async () => {
  const fetchFn = async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('exintro'), null);
    assert.equal(params.get('exsectionformat'), 'wiki');
    return { ok: true, json: async () => ({ query: { pages: { 5: { pageid: 5, title: 'Marie Curie', extract: ARTICLE, description: 'physicienne', thumbnail: { source: 'https://img/x.jpg' } } } } }) };
  };
  const article = await fetchArticle('Curie', { fetchFn });
  assert.equal(article.title, 'Marie Curie');
  assert.equal(article.url, 'https://fr.wikipedia.org/wiki/Marie_Curie');
  assert.equal(article.intro.length, 2);
});

test('un article absent déclenche une erreur plutôt qu\'un écran vide', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ query: { pages: { '-1': { title: 'Rien', missing: true } } } }) });
  await assert.rejects(fetchArticle('Rien', { fetchFn }), /introuvable/);
});
