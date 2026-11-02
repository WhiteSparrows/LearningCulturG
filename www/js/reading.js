// Mode Lire : des savoirs à parcourir, sans question ni note. Rien n'est planifié,
// sauf ce que la personne choisit de retenir.
import { applyGrade } from './session.js';

// Pioche un savoir pas encore lu ; une fois tout lu, le domaine repart de zéro.
export function pickFact(cards, data, { domain = null, lastDomain = null, rng = Math.random } = {}) {
  const usable = cards.filter((c) => !c.wiki && !data.suspended[c.id]
    && (domain ? c.domain === domain : !data.settings.disabled.includes(c.domain)));
  if (usable.length === 0) return null;

  const unread = usable.filter((c) => !data.readSeen[c.id]);
  const pool = unread.length > 0 ? unread : usable;
  const elsewhere = pool.filter((c) => c.domain !== lastDomain);
  const candidates = elsewhere.length > 0 ? elsewhere : pool;
  return candidates[Math.floor(rng() * candidates.length)];
}

// Un article lu ne reviendra pas en devinette : on connaît déjà la réponse.
export function markRead(data, card, today, seconds) {
  if (card.wiki) {
    data.wikiSeen[card.id] = 1;
    data.wikiPool = data.wikiPool.filter((c) => c.id !== card.id);
  } else {
    data.readSeen[card.id] = 1;
  }
  const day = (data.daily[today] ??= { secs: 0, n: 0, ok: 0 });
  day.read = (day.read ?? 0) + 1;
  day.readSecs = (day.readSecs ?? 0) + seconds;
}

// Passerelle facultative vers les révisions, pour ce qui mérite d'être gardé.
export function keepForReview(data, card, today) {
  if (data.cards[card.id]) return;
  if (card.wiki) {
    const { body, ...stored } = card;
    data.wikiCards[card.id] = stored;
  }
  applyGrade(data, card, 'good', today, { first: true });
}
