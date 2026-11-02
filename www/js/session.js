// Compose la session du jour (quoi réviser, quoi découvrir, dans quel ordre)
// et fait avancer la file de cartes. Aucune dépendance au DOM : tout se teste sous Node.
import { retrievability, schedule } from './fsrs.js';

export const MAX_NEW = 12;
export const MIN_NEW = 3;
// Un nouveau savoir testé tout de suite reste fragile : on le revoit vite, quelle que soit sa note.
const FIRST_INTERVAL_CAP = 2;
const REINSERT_AFTER = 3;
const MAX_RELEARN = 2;

export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

export function dateFromDay(day) {
  const d = new Date(day * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const isEnabled = (item, data) => !data.settings.disabled.includes(item.domain);
const isUsable = (card, data) => isEnabled(card, data) && !data.suspended[card.id];

export function dueCards(cards, data, today) {
  const usable = cards.filter((c) => isUsable(c, data) && data.cards[c.id] && data.cards[c.id].due <= today);
  const risk = (c) => retrievability(today - data.cards[c.id].last, data.cards[c.id].s);
  return usable.sort((a, b) => risk(a) - risk(b));
}

function pickRandom(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

// Équilibre les domaines : on pioche toujours dans celui qu'on a le moins exploré.
function pickNew(fresh, pool, count, data, cards, rng) {
  const remaining = new Map();
  for (const card of fresh) {
    if (!remaining.has(card.domain)) remaining.set(card.domain, []);
    remaining.get(card.domain).push(card);
  }
  const explored = {};
  for (const card of cards) {
    if (data.cards[card.id]) explored[card.domain] = (explored[card.domain] ?? 0) + 1;
  }
  const wiki = [...pool];
  const picked = [];
  let lastDomain = null;

  for (let i = 0; i < count; i++) {
    const wikiTurn = wiki.length > 0 && (i % 3 === 2 || remaining.size === 0);
    if (wikiTurn) {
      const item = pickRandom(wiki, rng);
      wiki.splice(wiki.indexOf(item), 1);
      picked.push({ kind: 'wiki', card: item });
      lastDomain = item.domain;
      continue;
    }
    if (remaining.size === 0) break;
    let candidates = [...remaining.keys()];
    if (candidates.length > 1) candidates = candidates.filter((d) => d !== lastDomain);
    const fewest = Math.min(...candidates.map((d) => explored[d] ?? 0));
    const domain = pickRandom(candidates.filter((d) => (explored[d] ?? 0) === fewest), rng);
    const inDomain = remaining.get(domain);
    const card = pickRandom(inDomain, rng);
    inDomain.splice(inDomain.indexOf(card), 1);
    if (inDomain.length === 0) remaining.delete(domain);
    explored[domain] = (explored[domain] ?? 0) + 1;
    picked.push({ kind: 'new', card });
    lastDomain = domain;
  }
  return picked;
}

// Répartit les découvertes parmi les révisions, puis évite deux domaines identiques de suite.
export function weave(reviews, news) {
  const merged = [];
  const gap = (reviews.length + 1) / (news.length + 1);
  let r = 0;
  news.forEach((item, i) => {
    const until = Math.round(gap * (i + 1));
    while (r < until && r < reviews.length) merged.push(reviews[r++]);
    merged.push(item);
  });
  while (r < reviews.length) merged.push(reviews[r++]);

  for (let i = 1; i < merged.length; i++) {
    if (merged[i].card.domain !== merged[i - 1].card.domain) continue;
    const j = merged.findIndex((item, k) => k > i && item.card.domain !== merged[i - 1].card.domain);
    if (j !== -1) {
      [merged[i], merged[j]] = [merged[j], merged[i]];
      continue;
    }
    // Plus rien à échanger en fin de file : on la replace plus tôt, entre deux autres domaines.
    const domain = merged[i].card.domain;
    const slot = merged.findIndex((item, k) => k > 0 && k < i && item.card.domain !== domain && merged[k - 1].card.domain !== domain);
    if (slot !== -1) merged.splice(slot, 0, merged.splice(i, 1)[0]);
  }
  return merged;
}

// Le budget de temps décide : les révisions d'abord, car c'est là que se joue la mémoire,
// mais on réserve toujours une place aux nouveautés pour ne pas stagner les jours chargés.
export function buildPlan({ cards, data, today, budgetSec, rng = Math.random }) {
  const empty = { items: [], reviews: 0, news: 0, wiki: 0, estimateSec: 0, dueTotal: 0 };
  const due = dueCards(cards, data, today);
  if (budgetSec <= 0) return { ...empty, dueTotal: due.length };

  const fresh = cards.filter((c) => isUsable(c, data) && !data.cards[c.id]);
  const pool = data.settings.wiki ? data.wikiPool.filter((i) => isEnabled(i, data)) : [];
  const newAvailable = fresh.length + pool.length;
  const { review: secReview, new: secNew } = data.pace;

  const reserved = Math.min(MIN_NEW, newAvailable) * secNew;
  const reviewCount = Math.max(0, Math.min(due.length, Math.floor((budgetSec - reserved) / secReview)));
  const left = budgetSec - reviewCount * secReview;
  const newCount = Math.min(MAX_NEW, newAvailable, Math.floor(left / secNew));

  const news = pickNew(fresh, pool, newCount, data, cards, rng);
  const reviews = due.slice(0, reviewCount).map((card) => ({ kind: 'review', card }));
  const wikiCount = news.filter((n) => n.kind === 'wiki').length;
  return {
    items: weave(reviews, news),
    reviews: reviews.length,
    news: news.length - wikiCount,
    wiki: wikiCount,
    estimateSec: reviews.length * secReview + news.length * secNew,
    dueTotal: due.length,
  };
}

const STEP_FOR = { review: 'recall', new: 'discover', wiki: 'wiki' };

// Déroulé d'une session. Une découverte est lue, puis retestée quelques cartes plus loin ;
// une carte ratée revient avant la fin, parce que l'effort de rappel est ce qui fixe le souvenir.
export class Session {
  constructor(items) {
    this.queue = items.map(({ kind, card }) => ({ step: STEP_FOR[kind], card }));
    this.done = 0;
    this.correct = 0;
    this.answered = 0;
    this.seconds = 0;
  }

  get current() {
    return this.queue[0] ?? null;
  }

  get progress() {
    const total = this.done + this.queue.length;
    return total === 0 ? 1 : this.done / total;
  }

  #insertLater(step) {
    this.queue.splice(Math.min(REINSERT_AFTER, this.queue.length), 0, step);
  }

  #advance() {
    this.queue.shift();
    this.done += 1;
  }

  discovered() {
    const { card } = this.current;
    this.#advance();
    this.#insertLater({ step: card.wrong?.length ? 'qcm' : 'recall', card, first: true });
  }

  // Résultat d'une note FSRS ('again' renvoie la carte en fin de file).
  graded(gradeKey) {
    const { card } = this.current;
    this.answered += 1;
    if (gradeKey !== 'again') this.correct += 1;
    this.#advance();
    if (gradeKey === 'again') this.#insertLater({ step: 'relearn', card, attempts: 1 });
  }

  relearned(gotIt) {
    const { card, attempts } = this.current;
    this.#advance();
    if (!gotIt && attempts < MAX_RELEARN) this.#insertLater({ step: 'relearn', card, attempts: attempts + 1 });
  }

  skip() {
    this.#advance();
  }
}

export function applyGrade(data, card, gradeKey, today, { first = false } = {}) {
  const next = schedule(data.cards[card.id], gradeKey, today);
  if (first) {
    next.interval = Math.min(next.interval, FIRST_INTERVAL_CAP);
    next.due = today + next.interval;
  }
  data.cards[card.id] = next;
  return next;
}

export function logDay(data, today, { seconds = 0, answered = 0, correct = 0 }) {
  const day = (data.daily[today] ??= { secs: 0, n: 0, ok: 0 });
  day.secs += seconds;
  day.n += answered;
  day.ok += correct;
}

export const isActiveDay = (entry) => entry?.n > 0 || entry?.read > 0;

export function currentStreak(daily, today) {
  let day = isActiveDay(daily[today]) ? today : today - 1;
  let streak = 0;
  while (isActiveDay(daily[day])) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

// Probabilité moyenne de se souvenir aujourd'hui de ce qui a déjà été étudié.
export function averageRecall(data, today) {
  const states = Object.values(data.cards);
  if (states.length === 0) return null;
  const sum = states.reduce((acc, c) => acc + retrievability(today - c.last, c.s), 0);
  return sum / states.length;
}

// Temps moyen mesuré, pour que le budget de la session colle au rythme réel.
export function updatePace(pace, key, seconds) {
  const [min, max] = key === 'review' ? [6, 60] : [15, 120];
  const blended = pace[key] * 0.9 + seconds * 0.1;
  pace[key] = Math.min(max, Math.max(min, blended));
}
