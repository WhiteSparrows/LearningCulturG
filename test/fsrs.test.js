import test from 'node:test';
import assert from 'node:assert/strict';
import { preview, schedule, retrievability, formatInterval, MAX_INTERVAL } from '../www/js/fsrs.js';

test('une carte réussie revient de plus en plus tard', () => {
  let state = schedule(undefined, 'good', 0);
  const intervals = [state.interval];
  for (let i = 0; i < 5; i++) {
    state = schedule(state, 'good', state.due);
    intervals.push(state.interval);
  }
  for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], intervals.join(','));
});

test('les délais respectent l\'ordre des boutons', () => {
  const first = preview(undefined, 0);
  assert.equal(first.again.interval, 1);
  assert.ok(first.hard.interval < first.good.interval);
  assert.ok(first.good.interval < first.easy.interval);

  const later = preview(first.good, first.good.due);
  assert.equal(later.again.interval, 1);
  assert.ok(later.hard.interval < later.good.interval);
  assert.ok(later.good.interval < later.easy.interval);
});

test('un oubli réduit la stabilité et compte comme une rechute', () => {
  let state = schedule(undefined, 'good', 0);
  state = schedule(state, 'good', state.due);
  const forgotten = schedule(state, 'again', state.due);
  assert.ok(forgotten.s < state.s);
  assert.equal(forgotten.due, state.due + 1);
  assert.equal(forgotten.lapses, 1);
  assert.ok(forgotten.d > state.d);
});

test('rien n\'attend plus de deux ans', () => {
  let state = schedule(undefined, 'easy', 0);
  for (let i = 0; i < 30; i++) state = schedule(state, 'easy', state.due);
  assert.equal(state.interval, MAX_INTERVAL);
});

test('la mémoire décroît avec le temps et vaut 90 % après S jours', () => {
  assert.equal(retrievability(0, 10), 1);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(retrievability(30, 10) < retrievability(10, 10));
});

test('les délais s\'affichent en langage courant', () => {
  assert.equal(formatInterval(1), 'demain');
  assert.equal(formatInterval(5), '5 j');
  assert.equal(formatInterval(21), '3 sem.');
  assert.equal(formatInterval(120), '4 mois');
  assert.equal(formatInterval(365), '1 an');
  assert.equal(formatInterval(730), '2 ans');
});
