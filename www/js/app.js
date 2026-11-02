import { DECK } from './deck.js';
import { DOMAINS, domainById } from './domains.js';
import { preview, formatInterval, schedule } from './fsrs.js';
import {
  buildPlan, Session, applyGrade, logDay, currentStreak, averageRecall, updatePace, dayNumber, dateFromDay, isActiveDay,
} from './session.js';
import { pickFact, markRead, keepForReview } from './reading.js';
import { load, save, exportData, importData } from './store.js';
import { refillPool, fetchOnThisDay, fetchWikiCards } from './wikipedia.js';
import { canRemind, setReminder } from './platform.js';

const root = document.getElementById('app');
const BONUS_SECONDS = 300;
const MAX_STEP_SECONDS = 90;
const ACTIVITY_WEEKS = 16;
const MAX_READ_SECONDS = 240;
const ARTICLE_WAIT_MS = 2500;

let data = load();
let screen = 'home';
let run = null;
let reading = null;

const today = () => dayNumber();
const allCards = () => [...DECK, ...Object.values(data.wikiCards)];

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

function show(...nodes) {
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function persist() {
  save(data);
}

const hueStyle = (domainId) => `--h:${domainById[domainId]?.hue ?? 40}`;

function domainTag(domainId) {
  return h('span', { class: 'domain-tag', style: hueStyle(domainId) }, domainById[domainId]?.label ?? '');
}

function minutes(seconds) {
  return Math.max(1, Math.round(seconds / 60));
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

function planFor(budgetSec) {
  return buildPlan({ cards: allCards(), data, today: today(), budgetSec });
}

// ---- Navigation -----------------------------------------------------------

function goTo(next, { replace = false } = {}) {
  screen = next;
  if (replace) history.replaceState({ screen: next }, '');
  else history.pushState({ screen: next }, '');
  render();
}

window.addEventListener('popstate', (event) => {
  screen = event.state?.screen ?? 'home';
  if (screen !== 'session') run = null;
  if (screen !== 'reading') stopReading();
  render();
});

function render() {
  if (screen === 'session' && run) return renderStep();
  if (screen === 'reading' && reading) return renderReading();
  if (screen === 'read') return renderRead();
  if (screen === 'domains') return renderDomains();
  if (screen === 'settings') return renderSettings();
  return renderHome();
}

function tabs(current) {
  const tab = (id, label) => h('button', {
    class: 'tab',
    'aria-current': current === id ? 'page' : null,
    onclick: () => current !== id && goTo(id, { replace: true }),
  }, label);
  return h('nav', { class: 'tabs' }, tab('home', "Aujourd'hui"), tab('read', 'Lire'), tab('domains', 'Domaines'), tab('settings', 'Réglages'));
}

// ---- Accueil --------------------------------------------------------------

function planSummary(plan) {
  const parts = [];
  if (plan.reviews) parts.push(plural(plan.reviews, 'révision'));
  if (plan.news) parts.push(plural(plan.news, 'découverte'));
  if (plan.wiki) parts.push(plural(plan.wiki, 'devinette'));
  return parts.join(' · ');
}

function renderHero() {
  const { secs: spent = 0, done = false } = data.daily[today()] ?? {};
  const budget = data.settings.minutes * 60;
  const plan = planFor(budget - spent);

  // Une session menée au bout clôt la journée, même s'il reste un peu de temps au budget.
  if (!done && plan.items.length > 0) {
    return h('section', { class: 'hero' },
      h('h1', {}, spent > 0 ? 'Il te reste un peu à faire' : 'Ta session du jour'),
      h('p', { class: 'hero-detail' }, `Environ ${minutes(plan.estimateSec)} min. ${planSummary(plan)}.`),
      h('button', { class: 'btn btn-primary', onclick: () => startSession(plan) }, spent > 0 ? 'Reprendre' : 'Commencer'),
    );
  }
  const bonus = planFor(BONUS_SECONDS);
  return h('section', { class: 'hero' },
    h('h1', {}, spent > 0 ? "C'est fait pour aujourd'hui" : "Rien à réviser aujourd'hui"),
    h('p', { class: 'hero-detail' }, bonus.dueTotal > 0
      ? `Encore ${plural(bonus.dueTotal, 'carte')} à revoir : elles attendront demain sans problème.`
      : 'Ta mémoire travaille aussi quand tu ne fais rien.'),
    bonus.items.length > 0 && h('button', { class: 'btn btn-ghost', onclick: () => startSession(bonus) }, '5 minutes de plus'),
  );
}

function renderFigures() {
  const studied = Object.keys(data.cards).length;
  const recall = averageRecall(data, today());
  const streak = currentStreak(data.daily, today());
  const figure = (value, label) => h('div', { class: 'figure' }, h('b', {}, value), h('span', {}, label));
  return h('section', { class: 'figures' },
    figure(String(streak), streak > 1 ? 'jours de suite' : 'jour de suite'),
    figure(String(studied), studied > 1 ? 'savoirs en mémoire' : 'savoir en mémoire'),
    figure(recall === null ? '–' : `${Math.round(recall * 100)} %`, 'de rappel estimé'),
  );
}

// Une colonne par semaine, du lundi au dimanche : la régularité se voit d'un coup d'œil.
function renderActivity() {
  const now = today();
  const mondayIndex = (dateFromDay(now).getDay() + 6) % 7;
  const first = now - mondayIndex - (ACTIVITY_WEEKS - 1) * 7;
  const days = Array.from({ length: ACTIVITY_WEEKS * 7 }, (_, i) => {
    const day = first + i;
    const state = day > now ? 'future' : isActiveDay(data.daily[day]) ? 'on' : '';
    return h('i', { class: state });
  });
  return h('section', {},
    h('h2', { class: 'section-title' }, `Tes ${ACTIVITY_WEEKS} dernières semaines`),
    h('div', { class: 'activity', role: 'img', 'aria-label': 'Jours où une session a été faite' }, days),
  );
}

function renderEphemeris() {
  const event = data.onThisDay?.day === today() ? data.onThisDay : null;
  if (!event) return null;
  const id = `otd-${event.year}-${event.text.length}-${today() % 366}`;
  const kept = Boolean(data.wikiCards[id]);
  return h('section', { class: 'ephemeris' },
    h('h2', { class: 'section-title' }, 'Ce jour-là'),
    h('div', { class: 'ephemeris-year' }, String(event.year)),
    h('p', {}, event.text),
    kept
      ? h('span', { class: 'card-kind' }, 'Ajouté à tes révisions')
      : h('button', { class: 'inline-action', onclick: () => keepEphemeris(id, event) }, 'Retenir cette date'),
  );
}

function keepEphemeris(id, event) {
  data.wikiCards[id] = {
    id, domain: 'histoire', wiki: true,
    q: `En quelle année ? ${event.text}`,
    a: String(event.year),
    x: 'Tiré de l\'éphéméride de Wikipédia.',
  };
  data.cards[id] = schedule(undefined, 'good', today());
  persist();
  render();
}

function renderHome() {
  const date = capitalize(dateFromDay(today()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  show(
    h('div', { class: 'page' },
      h('header', { class: 'masthead' }, h('span', { class: 'brand' }, 'CulturG'), h('span', { class: 'today-date' }, date)),
      h('div', { class: 'hero-group' },
        renderHero(),
        h('button', { class: 'btn-link', onclick: () => goTo('read', { replace: true }) }, 'Juste lire, sans questions'),
      ),
      renderFigures(),
      renderEphemeris(),
      renderActivity(),
    ),
    tabs('home'),
  );
}

// ---- Session --------------------------------------------------------------

function startSession(plan) {
  run = { session: new Session(plan.items), startedAt: Date.now(), discoverSecs: {}, reveal: false, picked: null };
  goTo('session');
}

function takeSeconds() {
  const seconds = Math.min(MAX_STEP_SECONDS, (Date.now() - run.startedAt) / 1000);
  run.startedAt = Date.now();
  run.session.seconds += seconds;
  logDay(data, today(), { seconds });
  return seconds;
}

function nextStep() {
  run.reveal = false;
  run.picked = null;
  run.startedAt = Date.now();
  persist();
  renderStep();
}

function quitSession() {
  run = null;
  history.back();
}

function renderStep() {
  const { session } = run;
  const step = session.current;
  if (!step) return renderFinish();
  const views = { discover: stepDiscover, qcm: stepQcm, recall: stepRecall, relearn: stepRelearn, wiki: stepWiki };
  const { body, actions } = views[step.step](step);
  // L'animation d'entrée marque une nouvelle carte, pas le fait de révéler sa réponse.
  const isNewCard = run.shownStep !== step;
  run.shownStep = step;
  const scrollY = window.scrollY;
  show(h('div', { class: 'session' },
    h('div', { class: 'session-bar' },
      h('button', { class: 'close', 'aria-label': 'Quitter la session', onclick: quitSession }, '×'),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(session.progress * 100)}%` })),
    ),
    h('article', { class: `card${isNewCard ? ' enter' : ''}`, style: hueStyle(step.card.domain) }, domainTag(step.card.domain), body),
    h('div', { class: 'actions' }, actions),
  ));
  if (!isNewCard) window.scrollTo(0, scrollY);
}

function explanation(card) {
  return [
    h('p', { class: 'answer' }, card.a),
    card.description && h('p', { class: 'description' }, capitalize(card.description)),
    card.image && h('img', { class: 'card-image', src: card.image, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }),
    card.x && h('p', { class: 'explain' }, card.x),
    h('div', { class: 'card-links' },
      card.url ? h('a', { href: card.url, target: '_blank', rel: 'noopener' }, 'Lire sur Wikipédia') : h('span'),
      h('button', { onclick: () => flagCard(card) }, 'Signaler une erreur'),
    ),
  ];
}

// La carte signalée sort des révisions, et se rétablit depuis les réglages.
function flagCard(card) {
  data.suspended[card.id] = 'flag';
  run.session.skip();
  nextStep();
}

const isRiddle = (card) => Boolean(card.url);

function questionNode(card) {
  return h('h1', { class: `question${isRiddle(card) ? ' riddle' : ''}` }, card.q);
}

// Une fois la réponse connue, le résumé complet d'une devinette remplace son énoncé masqué.
function revealed(card) {
  return [!isRiddle(card) && questionNode(card), ...explanation(card)];
}

function stepDiscover({ card }) {
  return {
    body: [h('p', { class: 'card-kind' }, 'À découvrir'), questionNode(card), ...explanation(card)],
    actions: h('button', {
      class: 'btn btn-primary',
      onclick: () => {
        run.discoverSecs[card.id] = takeSeconds();
        run.session.discovered();
        nextStep();
      },
    }, 'Compris'),
  };
}

// Mélange stable pour une même carte : les réponses ne bougent pas au moment de corriger.
function shuffledChoices(card) {
  const seed = [...card.id].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
  const choices = [card.a, ...card.wrong];
  const shift = seed % choices.length;
  return [...choices.slice(shift), ...choices.slice(0, shift)];
}

function stepQcm({ card, first }) {
  const picked = run.picked;
  const answered = picked !== null;
  const buttons = shuffledChoices(card).map((choice) => {
    const state = !answered ? '' : choice === card.a ? 'right' : choice === picked ? 'wrong' : 'dim';
    return h('button', {
      class: `choice ${state}`,
      disabled: answered,
      onclick: () => {
        run.picked = choice;
        renderStep();
      },
    }, choice);
  });
  const body = [h('p', { class: 'card-kind' }, 'Te souviens-tu ?'), questionNode(card), h('div', { class: 'choices' }, buttons)];
  if (answered && card.x) body.push(h('p', { class: 'explain' }, card.x));
  return {
    body,
    actions: answered && h('button', {
      class: 'btn btn-primary',
      onclick: () => {
        const grade = picked === card.a ? 'good' : 'again';
        const seconds = takeSeconds();
        updatePace(data.pace, 'new', seconds + (run.discoverSecs[card.id] ?? 0));
        finishGrade(card, grade, { first });
      },
    }, 'Continuer'),
  };
}

function finishGrade(card, grade, options = {}) {
  applyGrade(data, card, grade, today(), options);
  logDay(data, today(), { answered: 1, correct: grade === 'again' ? 0 : 1 });
  run.session.graded(grade);
  nextStep();
}

const GRADE_LABELS = [['again', 'Oublié'], ['hard', 'Difficile'], ['good', 'Bien'], ['easy', 'Facile']];

function stepRecall({ card, first }) {
  if (!run.reveal) {
    return {
      body: [h('p', { class: 'card-kind' }, card.wiki ? 'De quoi parle-t-on ?' : 'Cherche la réponse dans ta tête'), questionNode(card)],
      actions: h('button', { class: 'btn btn-primary', onclick: () => { run.reveal = true; renderStep(); } }, 'Voir la réponse'),
    };
  }
  const next = preview(data.cards[card.id], today());
  const grades = GRADE_LABELS.map(([key, label]) => h('button', {
    class: `grade ${key}`,
    onclick: () => {
      updatePace(data.pace, 'review', takeSeconds());
      finishGrade(card, key, { first });
    },
  }, label, h('small', {}, key === 'again' ? 'bientôt' : formatInterval(next[key].interval))));
  return {
    body: revealed(card),
    actions: h('div', { class: 'grades' }, grades),
  };
}

function stepRelearn({ card }) {
  if (!run.reveal) {
    return {
      body: [h('p', { class: 'card-kind' }, 'Deuxième essai'), questionNode(card)],
      actions: h('button', { class: 'btn btn-primary', onclick: () => { run.reveal = true; renderStep(); } }, 'Voir la réponse'),
    };
  }
  const answer = (gotIt) => () => {
    takeSeconds();
    run.session.relearned(gotIt);
    nextStep();
  };
  return {
    body: revealed(card),
    actions: h('div', { class: 'grades two' },
      h('button', { class: 'grade again', onclick: answer(false) }, 'Pas encore'),
      h('button', { class: 'grade good', onclick: answer(true) }, 'Je l\'ai'),
    ),
  };
}

function resolveWiki(card, gradeKey) {
  const seconds = takeSeconds();
  updatePace(data.pace, 'new', seconds);
  data.wikiPool = data.wikiPool.filter((c) => c.id !== card.id);
  data.wikiSeen[card.id] = 1;
  if (gradeKey) {
    data.wikiCards[card.id] = card;
    applyGrade(data, card, gradeKey, today(), { first: gradeKey === 'good' });
  }
  logDay(data, today(), { answered: 1, correct: gradeKey === 'easy' ? 1 : 0 });
  run.session.skip();
  nextStep();
}

function stepWiki({ card }) {
  if (!run.reveal) {
    return {
      body: [h('p', { class: 'card-kind' }, 'Devinette Wikipédia'), questionNode(card)],
      actions: h('button', { class: 'btn btn-primary', onclick: () => { run.reveal = true; renderStep(); } }, 'Révéler'),
    };
  }
  return {
    body: revealed(card),
    actions: [
      h('button', { class: 'btn btn-primary', onclick: () => resolveWiki(card, 'good') }, 'À retenir'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost', onclick: () => resolveWiki(card, 'easy') }, 'Je savais'),
        h('button', { class: 'btn btn-ghost', onclick: () => resolveWiki(card, null) }, 'Pas pour moi'),
      ),
    ],
  };
}

function renderFinish() {
  const { session } = run;
  const rate = session.answered > 0 ? Math.round((session.correct / session.answered) * 100) : null;
  logDay(data, today(), {});
  data.daily[today()].done = true;
  persist();
  refillInBackground();
  show(h('div', { class: 'finish' },
    h('h1', {}, 'Session terminée'),
    h('section', { class: 'figures' },
      h('div', { class: 'figure' }, h('b', {}, String(session.answered)), h('span', {}, session.answered > 1 ? 'cartes testées' : 'carte testée')),
      h('div', { class: 'figure' }, h('b', {}, rate === null ? '–' : `${rate} %`), h('span', {}, 'retrouvées')),
      h('div', { class: 'figure' }, h('b', {}, `${minutes(session.seconds)} min`), h('span', {}, 'de travail')),
    ),
    h('p', { class: 'explain' }, rate !== null && rate < 70
      ? 'Oublier fait partie du travail : ce sont les rappels difficiles qui retiennent le mieux. Ces cartes reviendront vite.'
      : 'Ce que tu viens de revoir reviendra juste avant que tu l\'oublies.'),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn btn-primary', onclick: quitSession }, 'Retour'),
  ));
}

// ---- Lire -----------------------------------------------------------------

function renderRead() {
  const start = (domain) => () => startReading(domain);
  const chips = DOMAINS.map((domain) => h('button', {
    class: 'read-domain',
    style: `--h:${domain.hue}`,
    onclick: start(domain.id),
  }, domain.label));
  show(
    h('div', { class: 'page' },
      h('header', {},
        h('h1', { class: 'page-title' }, 'Lire'),
        h('p', { class: 'page-intro' }, 'Ni question ni note : des savoirs à parcourir à ton rythme. Rien ne s\'ajoute à tes révisions, sauf ce que tu choisis de retenir.'),
      ),
      h('button', { class: 'btn btn-primary', onclick: start(null) }, 'Surprends-moi'),
      h('section', {},
        h('h2', { class: 'section-title' }, 'Ou choisis un domaine'),
        h('div', { class: 'read-domains' }, chips),
      ),
    ),
    tabs('read'),
  );
}

// On attend brièvement le premier article ; passé ce délai, un savoir hors ligne prend le relais.
async function startReading(domain) {
  const session = { domain, current: null, articles: [], loading: false, turn: 0, startedAt: Date.now(), waiting: true };
  reading = session;
  goTo('reading');
  await Promise.race([loadArticles(), new Promise((resolve) => setTimeout(resolve, ARTICLE_WAIT_MS))]);
  if (reading !== session) return;
  session.waiting = false;
  showNextReading();
  renderReading();
}

// Sans domaine choisi, de petits lots : deux articles de suite, puis on change de sujet.
async function loadArticles() {
  if (!reading || reading.loading || reading.articles.length >= 3 || !data.settings.wiki) return;
  const session = reading;
  const choices = session.domain ? [domainById[session.domain]] : DOMAINS.filter((d) => !data.settings.disabled.includes(d.id));
  const domain = choices[Math.floor(Math.random() * choices.length)];
  if (!domain) return;
  session.loading = true;
  let added = 0;
  try {
    const cards = await fetchWikiCards(domain, data.wikiSeen, { long: true, count: session.domain ? 4 : 2 });
    const known = new Set([...session.articles.map((c) => c.id), session.current?.id]);
    const fresh = cards.filter((c) => !known.has(c.id));
    session.articles.push(...fresh);
    added = fresh.length;
  } catch {
    // Hors connexion : les savoirs intégrés suffisent.
  }
  session.loading = false;
  if (added > 0) loadArticles();
}

// Hors connexion, la réserve de devinettes sert d'articles.
function nextArticle() {
  if (reading.articles.length > 0) return reading.articles.shift();
  if (navigator.onLine !== false) return null;
  return data.wikiPool.find((c) => !reading.domain || c.domain === reading.domain) ?? null;
}

// Surtout des articles de fond, avec un savoir court de temps en temps pour varier le rythme.
function showNextReading() {
  const previous = reading.current;
  const wantArticle = reading.turn % 3 !== 2;
  reading.turn += 1;
  const fact = () => pickFact(DECK, data, { domain: reading.domain, lastDomain: previous?.domain });
  reading.current = (wantArticle && nextArticle()) || fact() || nextArticle();
  reading.startedAt = Date.now();
  loadArticles();
}

function recordReading() {
  if (!reading?.current) return;
  const seconds = Math.min(MAX_READ_SECONDS, (Date.now() - reading.startedAt) / 1000);
  markRead(data, reading.current, today(), seconds);
  persist();
}

function stopReading() {
  if (!reading) return;
  recordReading();
  reading = null;
  refillInBackground();
}

function renderReading() {
  if (reading.waiting) {
    show(h('div', { class: 'session' },
      h('div', { class: 'session-bar' }, h('button', { class: 'close', 'aria-label': 'Arrêter de lire', onclick: () => history.back() }, '×')),
      h('p', { class: 'reading-wait' }, 'Je cherche de quoi lire…'),
    ));
    return;
  }
  const card = reading.current;
  if (!card) {
    show(h('div', { class: 'finish' },
      h('h1', {}, 'Plus rien à lire ici'),
      h('p', { class: 'explain' }, 'Tous les domaines sont désactivés ou toutes leurs cartes sont signalées.'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-primary', onclick: () => history.back() }, 'Retour'),
    ));
    return;
  }
  const goal = data.settings.minutes * 60;
  const readToday = data.daily[today()]?.readSecs ?? 0;
  const kept = Boolean(data.cards[card.id]);
  const keep = h('button', {
    class: 'inline-action',
    onclick: (event) => {
      keepForReview(data, card, today());
      persist();
      event.target.replaceWith(h('span', {}, 'Ajouté à tes révisions'));
    },
  }, 'Retenir');

  show(h('div', { class: 'session' },
    h('div', { class: 'session-bar' },
      h('button', { class: 'close', 'aria-label': 'Arrêter de lire', onclick: () => history.back() }, '×'),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.min(100, Math.round((readToday / goal) * 100))}%` })),
    ),
    h('article', { class: 'card enter', style: hueStyle(card.domain) },
      domainTag(card.domain),
      card.wiki ? readingArticle(card) : readingFact(card),
      h('div', { class: 'card-links' },
        card.wiki
          ? h('a', { href: card.url, target: '_blank', rel: 'noopener' }, 'Lire la suite sur Wikipédia')
          : h('button', {
            onclick: () => {
              data.suspended[card.id] = 'flag';
              showNextReading();
              persist();
              renderReading();
            },
          }, 'Signaler une erreur'),
        kept ? h('span', {}, 'Dans tes révisions') : keep,
      ),
    ),
    h('div', { class: 'actions' },
      readToday >= goal && h('p', { class: 'read-goal' }, `Tes ${data.settings.minutes} minutes sont faites. Continue si tu en as envie.`),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => {
          recordReading();
          showNextReading();
          renderReading();
        },
      }, 'Suivant'),
    ),
  ));
}

function readingArticle(card) {
  const paragraphs = card.body ?? [card.x];
  return [
    card.image && h('img', { class: 'card-image', src: card.image, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }),
    h('h1', { class: 'reading-title' }, card.a),
    card.description && h('p', { class: 'description' }, capitalize(card.description)),
    paragraphs.map((text) => h('p', { class: 'explain' }, text)),
  ];
}

function readingFact(card) {
  return [
    h('p', { class: 'reading-context' }, card.q),
    h('h1', { class: 'reading-title' }, card.a),
    h('p', { class: 'explain' }, card.x),
  ];
}

// ---- Domaines -------------------------------------------------------------

function renderDomains() {
  const totals = {};
  const learned = {};
  for (const card of DECK) totals[card.domain] = (totals[card.domain] ?? 0) + 1;
  for (const card of allCards()) {
    if (data.cards[card.id]) learned[card.domain] = (learned[card.domain] ?? 0) + 1;
  }
  const rows = DOMAINS.map((domain) => {
    const enabled = !data.settings.disabled.includes(domain.id);
    const done = learned[domain.id] ?? 0;
    const percent = Math.min(100, Math.round((done / totals[domain.id]) * 100));
    return h('li', { class: `domain-row${enabled ? '' : ' off'}`, style: `--h:${domain.hue}` },
      h('span', { class: 'domain-name' }, domain.label),
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: enabled, 'aria-label': `Étudier : ${domain.label}`, onchange: (e) => toggleDomain(domain.id, e.target.checked) }),
        h('span'),
      ),
      h('div', { class: 'domain-meter' }, h('div', { class: 'meter' }, h('i', { style: `width:${percent}%` })), `${done} / ${totals[domain.id]}`),
    );
  });
  show(
    h('div', { class: 'page' },
      h('header', {},
        h('h1', { class: 'page-title' }, 'Domaines'),
        h('p', { class: 'page-intro' }, 'Chaque session pioche d\'abord dans ceux que tu as le moins explorés. Une fois les cartes vues, Wikipédia prend le relais.'),
      ),
      h('ul', { class: 'domain-list' }, rows),
    ),
    tabs('domains'),
  );
}

function toggleDomain(id, enabled) {
  const disabled = new Set(data.settings.disabled);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  data.settings.disabled = [...disabled];
  persist();
  render();
}

// ---- Réglages -------------------------------------------------------------

function switchControl(checked, label, onchange) {
  return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, 'aria-label': label, onchange }), h('span'));
}

function reminderSetting() {
  if (!canRemind()) {
    return h('section', { class: 'setting' },
      h('h2', {}, 'Rappel quotidien'),
      h('small', {}, 'Disponible dans l\'application Android installée.'),
    );
  }
  const { reminder } = data.settings;
  const message = h('p', { class: 'message error', role: 'status' });
  const apply = async (time) => {
    const allowed = await setReminder(time).catch(() => false);
    data.settings.reminder = allowed ? time : null;
    persist();
    renderSettings();
    if (!allowed) root.querySelector('.reminder-note').textContent = 'Android refuse les notifications à CulturG : autorise-les dans les paramètres du téléphone.';
  };
  return h('section', { class: 'setting' },
    h('div', { class: 'setting-line' },
      h('h2', {}, 'Rappel quotidien'),
      switchControl(Boolean(reminder), 'Activer le rappel quotidien', (e) => apply(e.target.checked ? '19:00' : null)),
      h('small', {}, 'Une notification à heure fixe, c\'est ce qui installe l\'habitude.'),
    ),
    reminder && h('input', { type: 'time', value: reminder, 'aria-label': 'Heure du rappel', onchange: (e) => e.target.value && apply(e.target.value) }),
    Object.assign(message, { className: 'message error reminder-note' }),
  );
}

function backupSetting() {
  const area = h('textarea', { 'aria-label': 'Texte de sauvegarde', placeholder: 'Colle ici une sauvegarde pour la restaurer.', spellcheck: false });
  const message = h('p', { class: 'message', role: 'status' });
  const say = (text, isError = false) => {
    message.textContent = text;
    message.className = `message${isError ? ' error' : ''}`;
  };
  return h('section', { class: 'setting' },
    h('h2', {}, 'Sauvegarde'),
    h('small', {}, 'Ta progression n\'existe que sur ce téléphone. Garde une copie de ce texte dans un endroit sûr.'),
    area,
    h('div', { class: 'row' },
      h('button', {
        class: 'btn btn-ghost',
        onclick: async () => {
          area.value = exportData(data);
          area.select();
          try {
            await navigator.clipboard.writeText(area.value);
            say('Sauvegarde copiée.');
          } catch {
            say('Sélectionne le texte et copie-le à la main.');
          }
        },
      }, 'Exporter'),
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => {
          try {
            data = importData(area.value);
            persist();
            render();
          } catch (error) {
            say(error instanceof SyntaxError ? 'Ce texte ne ressemble pas à une sauvegarde CulturG.' : error.message, true);
          }
        },
      }, 'Restaurer'),
    ),
    message,
  );
}

function flaggedSetting() {
  const ids = Object.keys(data.suspended);
  if (ids.length === 0) return null;
  const cards = allCards();
  const restore = (id) => () => {
    delete data.suspended[id];
    persist();
    render();
  };
  return h('section', { class: 'setting' },
    h('h2', {}, 'Cartes signalées'),
    h('ul', { class: 'flagged' }, ids.map((id) => h('li', {},
      h('span', {}, cards.find((c) => c.id === id)?.q ?? id),
      h('button', { class: 'inline-action', onclick: restore(id) }, 'Rétablir'),
    ))),
  );
}

function renderSettings() {
  const { minutes: current, wiki } = data.settings;
  const durations = [10, 12, 15].map((value) => h('button', {
    'aria-pressed': String(value === current),
    onclick: () => {
      data.settings.minutes = value;
      persist();
      render();
    },
  }, `${value} min`));
  show(
    h('div', { class: 'page' },
      h('h1', { class: 'page-title' }, 'Réglages'),
      h('section', { class: 'setting' },
        h('h2', {}, 'Durée d\'une session'),
        h('div', { class: 'segmented' }, durations),
        h('small', {}, 'Le contenu s\'adapte à ton rythme réel, mesuré au fil des sessions.'),
      ),
      reminderSetting(),
      h('section', { class: 'setting' },
        h('div', { class: 'setting-line' },
          h('h2', {}, 'Devinettes Wikipédia'),
          switchControl(wiki, 'Activer les devinettes Wikipédia', (e) => {
            data.settings.wiki = e.target.checked;
            persist();
            if (e.target.checked) refillInBackground();
          }),
          h('small', {}, 'Une source sans fin d\'articles importants. Une réserve reste disponible hors connexion.'),
        ),
      ),
      backupSetting(),
      flaggedSetting(),
    ),
    tabs('settings'),
  );
}

// ---- Démarrage ------------------------------------------------------------

// Le réseau n'est jamais bloquant : hors ligne, l'app tourne sur ses cartes et sa réserve.
function refillInBackground() {
  refillPool(data).then((added) => {
    if (!added) return;
    persist();
    if (screen === 'home') render();
  }).catch(() => {});
}

function loadEphemeris() {
  if (data.onThisDay?.day === today()) return;
  fetchOnThisDay().then((event) => {
    if (!event) return;
    data.onThisDay = { ...event, day: today() };
    persist();
    if (screen === 'home') render();
  }).catch(() => {});
}

// L'app reste ouverte d'un jour à l'autre sur un téléphone : on rafraîchit au retour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || screen === 'session' || screen === 'reading') return;
  loadEphemeris();
  render();
});

history.replaceState({ screen: 'home' }, '');
render();
refillInBackground();
loadEphemeris();
