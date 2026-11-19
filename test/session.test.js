import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, weave, Session, applyGrade, currentStreak, dayNumber, dateFromDay, MAX_NEW, MIN_NEW } from '../www/js/session.js';
import { defaultData } from '../www/js/store.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function makeCards(domains, perDomain) {
  return domains.flatMap((domain) =>
    Array.from({ length: perDomain }, (_, i) => ({ id: `${domain}-${i}`, domain, q: 'q', a: 'a', wrong: ['b', 'c', 'd'], x: '' }))
  );
}

const DOMAINS = ['a', 'b', 'c', 'd', 'e', 'f'];
const TODAY = 20000;

function withDue(data, cards, count) {
  cards.slice(0, count).forEach((c, i) => {
    data.cards[c.id] = { s: 5 + i, d: 5, last: TODAY - 5, due: TODAY - (i % 3), interval: 5, reps: 2, lapses: 0 };
  });
}

test('premier jour : uniquement des nouveautés, de domaines variés', () => {
  const cards = makeCards(DOMAINS, 20);
  const plan = buildPlan({ cards, data: defaultData(), today: TODAY, budgetSec: 720, rng: seeded() });
  assert.equal(plan.reviews, 0);
  assert.ok(plan.news > 0 && plan.news <= MAX_NEW);
  assert.ok(new Set(plan.items.map((i) => i.card.domain)).size >= 5);
});

test('le temps prévu tient dans le budget', () => {
  const cards = makeCards(DOMAINS, 40);
  const data = defaultData();
  withDue(data, cards, 200);
  const plan = buildPlan({ cards, data, today: TODAY, budgetSec: 720, rng: seeded() });
  assert.ok(plan.estimateSec <= 720, `${plan.estimateSec}`);
  assert.equal(plan.dueTotal, 200);
});

test('même un jour surchargé, on apprend encore quelque chose', () => {
  const cards = makeCards(DOMAINS, 40);
  const data = defaultData();
  withDue(data, cards, 200);
  const plan = buildPlan({ cards, data, today: TODAY, budgetSec: 720, rng: seeded() });
  assert.ok(plan.news >= MIN_NEW);
  assert.ok(plan.reviews > 0);
});

test('les cartes les plus menacées d\'oubli passent en premier', () => {
  const cards = makeCards(['a'], 3);
  const data = defaultData();
  data.cards['a-0'] = { s: 50, d: 5, last: TODAY - 5, due: TODAY, reps: 3, lapses: 0 };
  data.cards['a-1'] = { s: 1, d: 5, last: TODAY - 5, due: TODAY, reps: 3, lapses: 0 };
  data.cards['a-2'] = { s: 10, d: 5, last: TODAY - 5, due: TODAY + 3, reps: 3, lapses: 0 };
  const plan = buildPlan({ cards, data, today: TODAY, budgetSec: 720, rng: seeded() });
  const reviewed = plan.items.filter((i) => i.kind === 'review').map((i) => i.card.id);
  assert.deepEqual(reviewed, ['a-1', 'a-0']);
});

test('un domaine désactivé et une carte signalée disparaissent', () => {
  const cards = makeCards(DOMAINS, 10);
  const data = defaultData();
  data.settings.disabled = ['a'];
  data.suspended['b-0'] = 'flag';
  data.cards['b-0'] = { s: 5, d: 5, last: TODAY - 5, due: TODAY, reps: 2, lapses: 0 };
  const plan = buildPlan({ cards, data, today: TODAY, budgetSec: 720, rng: seeded() });
  assert.ok(plan.items.every((i) => i.card.domain !== 'a' && i.card.id !== 'b-0'));
});

test('sans budget restant, pas de session', () => {
  const plan = buildPlan({ cards: makeCards(DOMAINS, 5), data: defaultData(), today: TODAY, budgetSec: 0 });
  assert.equal(plan.items.length, 0);
});

test('une devinette Wikipédia arrive régulièrement, et comble quand les cartes manquent', () => {
  const data = defaultData();
  data.wikiPool = Array.from({ length: 20 }, (_, i) => ({ id: `wiki-${i}`, domain: DOMAINS[i % 6], wiki: true, q: 'q', a: 'a' }));
  const mixed = buildPlan({ cards: makeCards(DOMAINS, 10), data, today: TODAY, budgetSec: 720, rng: seeded() });
  assert.ok(mixed.wiki >= 2 && mixed.news > mixed.wiki);
  const onlyWiki = buildPlan({ cards: [], data, today: TODAY, budgetSec: 720, rng: seeded() });
  assert.equal(onlyWiki.news, 0);
  assert.ok(onlyWiki.wiki > 0);
});

test('l\'entrelacement évite deux domaines identiques de suite', () => {
  const reviews = makeCards(['a'], 4).concat(makeCards(['b'], 4)).map((card) => ({ kind: 'review', card }));
  const news = makeCards(['c'], 3).map((card) => ({ kind: 'new', card }));
  const woven = weave(reviews, news);
  assert.equal(woven.length, 11);
  for (let i = 1; i < woven.length; i++) assert.notEqual(woven[i].card.domain, woven[i - 1].card.domain, `position ${i}`);
});

test('une découverte est lue puis retestée plus loin en QCM', () => {
  const [card, ...others] = makeCards(['a'], 6);
  const s = new Session([{ kind: 'new', card }, ...others.map((c) => ({ kind: 'review', card: c }))]);
  assert.equal(s.current.step, 'discover');
  s.discovered();
  assert.notEqual(s.current.card.id, card.id);
  assert.equal(s.queue[3].card.id, card.id);
  assert.equal(s.queue[3].step, 'qcm');
  assert.equal(s.queue[3].first, true);
});

test('une carte ratée revient avant la fin, deux fois au plus', () => {
  const [card, other] = makeCards(['a'], 2);
  const s = new Session([{ kind: 'review', card }, { kind: 'review', card: other }]);
  s.graded('again');
  assert.equal(s.answered, 1);
  assert.equal(s.correct, 0);
  assert.equal(s.current.card.id, other.id);
  s.graded('good');
  assert.equal(s.current.step, 'relearn');
  s.relearned(false);
  assert.equal(s.current.step, 'relearn');
  s.relearned(false);
  assert.equal(s.current, null);
  assert.equal(s.progress, 1);
});

test('après un premier test réussi, la carte revient sous deux jours', () => {
  const data = defaultData();
  const [card] = makeCards(['a'], 1);
  const state = applyGrade(data, card, 'good', TODAY, { first: true });
  assert.equal(state.due, TODAY + 2);
  assert.equal(data.cards[card.id], state);
});

test('la série compte les jours consécutifs, même si aujourd\'hui reste à faire', () => {
  const daily = { [TODAY - 3]: { n: 5 }, [TODAY - 2]: { n: 5 }, [TODAY - 1]: { n: 5 } };
  assert.equal(currentStreak(daily, TODAY), 3);
  daily[TODAY] = { n: 2 };
  assert.equal(currentStreak(daily, TODAY), 4);
  assert.equal(currentStreak(daily, TODAY + 2), 0);
});

test('les numéros de jour se convertissent dans les deux sens', () => {
  const date = new Date(2026, 10, 2, 23, 30);
  const back = dateFromDay(dayNumber(date));
  assert.equal(back.getFullYear(), 2026);
  assert.equal(back.getMonth(), 10);
  assert.equal(back.getDate(), 2);
  assert.equal(dayNumber(new Date(2026, 10, 3, 0, 5)), dayNumber(date) + 1);
});
