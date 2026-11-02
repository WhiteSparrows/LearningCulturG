import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK } from '../www/js/deck.js';
import { DOMAINS } from '../www/js/domains.js';
import { defaultData, exportData, importData } from '../www/js/store.js';

const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/^(l'|le |la |les |un |une )/, '');

test('chaque domaine a au moins 20 cartes, et tout domaine est connu', () => {
  const ids = new Set(DOMAINS.map((d) => d.id));
  const counts = {};
  for (const card of DECK) {
    assert.ok(ids.has(card.domain), card.domain);
    counts[card.domain] = (counts[card.domain] ?? 0) + 1;
  }
  for (const domain of DOMAINS) assert.ok(counts[domain.id] >= 20, `${domain.id}: ${counts[domain.id]}`);
});

test('les identifiants et les questions sont uniques', () => {
  assert.equal(new Set(DECK.map((c) => c.id)).size, DECK.length);
  assert.equal(new Set(DECK.map((c) => c.q)).size, DECK.length);
});

test('chaque carte est complète, avec trois mauvaises réponses différentes', () => {
  for (const card of DECK) {
    assert.ok(card.q.trim().endsWith('?') || card.q.includes(':'), `Pas une question : ${card.q}`);
    assert.ok(card.a?.trim(), card.q);
    assert.ok(card.x?.trim(), `Sans explication : ${card.q}`);
    assert.ok(card.topic?.trim(), `Sans article à approfondir : ${card.q}`);
    assert.equal(card.wrong.length, 3, card.q);
    assert.equal(new Set([card.a, ...card.wrong]).size, 4, `Réponses en double : ${card.q}`);
  }
});

test('la question ne contient pas sa propre réponse', () => {
  const containsWord = (text, word) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(text);
  const leaks = DECK.filter((c) => containsWord(normalize(c.q), normalize(c.a))).map((c) => c.q);
  assert.deepEqual(leaks, []);
});

test('une sauvegarde se restaure à l\'identique', () => {
  const data = defaultData();
  data.cards.x = { s: 3, d: 5, last: 1, due: 4, reps: 1, lapses: 0 };
  data.settings.minutes = 15;
  data.wikiPool = [{ id: 'wiki-1' }];
  const restored = importData(exportData(data));
  assert.deepEqual(restored.cards, data.cards);
  assert.equal(restored.settings.minutes, 15);
  assert.deepEqual(restored.wikiPool, []);
});

test('un texte quelconque n\'écrase pas la progression', () => {
  assert.throws(() => importData('{"foo":1}'), /sauvegarde/);
  assert.throws(() => importData('pas du json'));
});
