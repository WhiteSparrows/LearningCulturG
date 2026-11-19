// Répétition espacée : algorithme FSRS-4.5 (paramètres par défaut publiés).
// Chaque carte garde une stabilité S (jours pour retomber à 90 % de rappel)
// et une difficulté D. Les dates sont des numéros de jour, l'app raisonnant à la journée.

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;

export const GRADE = { again: 1, hard: 2, good: 3, easy: 4 };
export const DEFAULT_RETENTION = 0.9;
// Plafond volontaire : même une connaissance solide revient au moins tous les 2 ans.
export const MAX_INTERVAL = 730;

const clampDifficulty = (d) => Math.min(10, Math.max(1, d));

export function retrievability(elapsedDays, stability) {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function intervalFor(stability, retention) {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.max(1, Math.round(days));
}

function nextMemory(prev, grade, today) {
  if (!prev) {
    return { s: W[grade - 1], d: clampDifficulty(W[4] - (grade - 3) * W[5]) };
  }
  const r = retrievability(today - prev.last, prev.s);
  const d = clampDifficulty(W[7] * W[4] + (1 - W[7]) * (prev.d - W[6] * (grade - 3)));
  if (grade === GRADE.again) {
    const forgotten = W[11] * Math.pow(prev.d, -W[12]) * (Math.pow(prev.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
    return { s: Math.max(0.1, Math.min(forgotten, prev.s)), d };
  }
  const bonus = grade === GRADE.hard ? W[15] : grade === GRADE.easy ? W[16] : 1;
  const growth = Math.exp(W[8]) * (11 - prev.d) * Math.pow(prev.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * bonus;
  return { s: prev.s * (1 + growth), d };
}

// Prochain état pour chacune des quatre notes, utile aussi pour afficher les délais sur les boutons.
export function preview(prev, today, retention = DEFAULT_RETENTION) {
  const memory = {
    again: nextMemory(prev, GRADE.again, today),
    hard: nextMemory(prev, GRADE.hard, today),
    good: nextMemory(prev, GRADE.good, today),
    easy: nextMemory(prev, GRADE.easy, today),
  };
  const hard = intervalFor(memory.hard.s, retention);
  const good = Math.max(intervalFor(memory.good.s, retention), hard + 1);
  const easy = Math.max(intervalFor(memory.easy.s, retention), good + 1);
  const intervals = { again: 1, hard, good, easy };

  const result = {};
  for (const key of Object.keys(GRADE)) {
    const interval = Math.min(intervals[key], MAX_INTERVAL);
    result[key] = {
      ...memory[key],
      interval,
      last: today,
      due: today + interval,
      reps: (prev?.reps ?? 0) + 1,
      lapses: (prev?.lapses ?? 0) + (key === 'again' && prev ? 1 : 0),
    };
  }
  return result;
}

export function schedule(prev, gradeKey, today, retention = DEFAULT_RETENTION) {
  return preview(prev, today, retention)[gradeKey];
}

export function formatInterval(days) {
  if (days <= 1) return 'demain';
  if (days < 14) return `${days} j`;
  if (days < 60) return `${Math.round(days / 7)} sem.`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  const years = days / 365;
  return `${Number.isInteger(Math.round(years * 2) / 2) ? Math.round(years) : (Math.round(years * 2) / 2).toString().replace('.', ',')} an${years >= 1.5 ? 's' : ''}`;
}
