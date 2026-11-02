// Tout reste sur le téléphone : aucune inscription, aucun serveur.
const KEY = 'culturg.v1';

export function defaultData() {
  return {
    version: 1,
    settings: { minutes: 12, reminder: null, wiki: true, disabled: [] },
    cards: {},
    wikiCards: {},
    wikiPool: [],
    wikiSeen: {},
    suspended: {},
    daily: {},
    pace: { review: 16, new: 42 },
    onThisDay: null,
  };
}

function withDefaults(raw) {
  const base = defaultData();
  return { ...base, ...raw, settings: { ...base.settings, ...raw.settings }, pace: { ...base.pace, ...raw.pace } };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? withDefaults(JSON.parse(raw)) : defaultData();
  } catch {
    return defaultData();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Stockage plein ou indisponible : la session continue, seule la sauvegarde est perdue.
  }
}

export function exportData(data) {
  return JSON.stringify({ ...data, wikiPool: [], onThisDay: null });
}

export function importData(text) {
  const raw = JSON.parse(text);
  if (raw.version !== 1 || typeof raw.cards !== 'object' || raw.cards === null) {
    throw new Error('Ce texte ne ressemble pas à une sauvegarde CulturG.');
  }
  return withDefaults(raw);
}
