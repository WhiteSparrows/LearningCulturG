import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFact, markRead, keepForReview } from '../www/js/reading.js';
import { currentStreak } from '../www/js/session.js';
import { defaultData } from '../www/js/store.js';
import { fetchWikiCards } from '../www/js/wikipedia.js';
import { DOMAINS } from '../www/js/domains.js';

const TODAY = 20000;
const fact = (domain, i) => ({ id: `${domain}-${i}`, domain, q: 'q', a: 'a', wrong: [], x: 'x' });
const CARDS = [fact('a', 0), fact('a', 1), fact('b', 0), { id: 'wiki-1', domain: 'a', wiki: true, q: 'q', a: 'a' }];

test('on lit d\'abord ce qui n\'a pas encore été lu', () => {
  const data = defaultData();
  data.readSeen = { 'a-0': 1, 'a-1': 1 };
  assert.equal(pickFact(CARDS, data).id, 'b-0');
});

test('une fois tout lu, la lecture repart au lieu de s\'arrêter', () => {
  const data = defaultData();
  data.readSeen = { 'a-0': 1, 'a-1': 1, 'b-0': 1 };
  assert.ok(pickFact(CARDS, data));
});

test('on change de domaine d\'un savoir à l\'autre, sauf si un domaine est choisi', () => {
  const data = defaultData();
  assert.equal(pickFact(CARDS, data, { lastDomain: 'a' }).domain, 'b');
  assert.equal(pickFact(CARDS, data, { domain: 'a', lastDomain: 'a' }).domain, 'a');
});

test('les domaines désactivés et les cartes signalées sont écartés, un domaine choisi reste lisible', () => {
  const data = defaultData();
  data.settings.disabled = ['a'];
  assert.equal(pickFact(CARDS, data).domain, 'b');
  assert.equal(pickFact(CARDS, data, { domain: 'a' }).domain, 'a');
  data.suspended['b-0'] = 'flag';
  assert.equal(pickFact(CARDS, data), null);
});

test('lire ne planifie aucune révision', () => {
  const data = defaultData();
  markRead(data, CARDS[0], TODAY, 30);
  assert.deepEqual(data.cards, {});
  assert.equal(data.readSeen['a-0'], 1);
  assert.equal(data.daily[TODAY].read, 1);
  assert.equal(data.daily[TODAY].readSecs, 30);
  assert.equal(data.daily[TODAY].secs, 0);
});

test('un article lu sort de la réserve de devinettes', () => {
  const data = defaultData();
  data.wikiPool = [{ id: 'wiki-1' }, { id: 'wiki-2' }];
  markRead(data, CARDS[3], TODAY, 30);
  assert.deepEqual(data.wikiPool, [{ id: 'wiki-2' }]);
  assert.equal(data.wikiSeen['wiki-1'], 1);
});

test('une journée de lecture compte dans la série', () => {
  const data = defaultData();
  markRead(data, CARDS[0], TODAY, 30);
  assert.equal(currentStreak(data.daily, TODAY), 1);
});

test('retenir un savoir l\'ajoute aux révisions sans écraser une progression', () => {
  const data = defaultData();
  keepForReview(data, CARDS[0], TODAY);
  assert.equal(data.cards['a-0'].due, TODAY + 2);
  const state = { s: 50, d: 5, last: TODAY - 1, due: TODAY + 40, reps: 6, lapses: 0 };
  data.cards['a-1'] = state;
  keepForReview(data, CARDS[1], TODAY);
  assert.equal(data.cards['a-1'], state);
});

test('retenir un article le stocke sans son texte long', () => {
  const data = defaultData();
  keepForReview(data, { ...CARDS[3], body: 'très long' }, TODAY);
  assert.equal(data.wikiCards['wiki-1'].body, undefined);
  assert.ok(data.cards['wiki-1']);
});

test('la lecture demande l\'introduction complète, découpée en paragraphes', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(new URL(url).searchParams);
    const params = calls.at(-1);
    const body = params.get('list')
      ? { query: { categorymembers: Array.from({ length: 12 }, (_, i) => ({ title: `Discussion:Sujet ${i}` })) } }
      : { query: { pages: { 1: { pageid: 1, title: 'Sujet 0', extract: 'Sujet 0 est un premier paragraphe assez long pour passer le filtre de qualité des articles.\nUn second paragraphe suit.' } } } };
    return { ok: true, json: async () => body };
  };
  const [card] = await fetchWikiCards(DOMAINS[0], {}, { fetchFn, long: true });
  assert.equal(calls[1].get('exsentences'), null);
  assert.deepEqual(card.body.length, 2);
  const [short] = await fetchWikiCards(DOMAINS[0], {}, { fetchFn });
  assert.equal(calls[3].get('exsentences'), '4');
  assert.equal(short.body, undefined);
});
