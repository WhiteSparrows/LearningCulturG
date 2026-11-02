// Source sans fin : les articles que les projets de Wikipédia jugent importants,
// transformés en devinettes (le résumé de l'article, son sujet masqué).
import { DOMAINS } from './domains.js';

const API = 'https://fr.wikipedia.org/w/api.php';
const MASK = '▁▁▁';
const STOPWORDS = new Set(['les', 'des', 'une', 'aux', 'sur', 'dans', 'pour', 'par', 'avec', 'sans', 'the', 'and', 'von', 'van', 'del', 'della', 'est']);
const ALPHABET = 'ABCDEFGHIJLMNOPRSTUV';

const normalize = (word) => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[sx]$/, '');

function titleWords(title) {
  const clean = title.replace(/\s*\(.*\)$/, '');
  const words = clean.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
  const minLength = words.length === 1 ? 2 : 3;
  return new Set(words.filter((w) => w.length >= minLength && !STOPWORDS.has(w.toLowerCase())).map(normalize));
}

function leadSentences(text, maxChars = 320) {
  const sentences = text.split(/(?<=[.!?])\s+(?=[\p{Lu}«])/u);
  let lead = '';
  for (const sentence of sentences) {
    const glued = /\b(?:av|apr|St|Dr|M|J\.-C)\.$/.test(lead.trim());
    if (lead && !glued && lead.length + sentence.length > maxChars) break;
    lead += (lead ? ' ' : '') + sentence;
    if (lead.length >= maxChars) break;
  }
  return lead;
}

// Retire du résumé tout ce qui donnerait la réponse : les mots du titre et les parenthèses
// d'ouverture (autres noms, étymologie, prononciation).
export function maskExtract(title, extract) {
  const words = titleWords(title);
  const flat = extract.replace(/\s*\n+\s*/g, ' ').replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  return leadSentences(flat)
    .replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => (words.has(normalize(word)) ? MASK : word))
    .replace(new RegExp(`${MASK}(?:[ -]${MASK})+`, 'g'), MASK);
}

export function isGoodTopic(title, extract) {
  if (!extract || extract.length < 90) return false;
  if (/^\d|^Liste |^Chronologie |^Histoire d|homonymie|^Portail:|^Projet:/i.test(title)) return false;
  return !/peut désigner|peut faire référence/.test(extract.slice(0, 200));
}

export function toCard(page, domainId) {
  const extract = (page.extract ?? '').trim();
  return {
    id: `wiki-${page.pageid}`,
    domain: domainId,
    wiki: true,
    q: maskExtract(page.title, extract),
    a: page.title.replace(/\s*\(.*\)$/, ''),
    x: leadSentences(extract.replace(/\s*\n+\s*/g, ' '), 420),
    description: page.description ?? '',
    image: page.thumbnail?.source ?? '',
    url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  };
}

async function query(params, fetchFn) {
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params })}`;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Wikipédia a répondu ${response.status}`);
  return response.json();
}

// Les catégories listent les pages de discussion : on en déduit le titre des articles.
async function topicsFrom(project, level, rng, fetchFn) {
  const params = {
    list: 'categorymembers',
    cmtitle: `Catégorie:Article du projet ${project} d'importance ${level}`,
    cmnamespace: '1',
    cmlimit: '50',
    cmsort: 'sortkey',
  };
  const start = ALPHABET[Math.floor(rng() * ALPHABET.length)];
  let json = await query({ ...params, cmstartsortkeyprefix: start }, fetchFn);
  let members = json.query?.categorymembers ?? [];
  if (members.length < 10) {
    json = await query(params, fetchFn);
    members = json.query?.categorymembers ?? [];
  }
  return members.map((m) => m.title.replace(/^Discussion:/, ''));
}

function shuffled(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Pour la lecture : l'introduction entière en paragraphes, coupée si elle s'éternise.
function introParagraphs(extract, maxChars = 1800) {
  const paragraphs = [];
  let length = 0;
  for (const paragraph of extract.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    if (paragraphs.length > 0 && length + paragraph.length > maxChars) break;
    paragraphs.push(paragraph);
    length += paragraph.length;
  }
  return paragraphs;
}

export async function fetchWikiCards(domain, seen, { count = 5, long = false, rng = Math.random, fetchFn = fetch } = {}) {
  const project = domain.wiki[Math.floor(rng() * domain.wiki.length)];
  const level = rng() < 0.5 ? 'maximum' : 'élevée';
  const topics = await topicsFrom(project, level, rng, fetchFn);
  const titles = shuffled(topics, rng).slice(0, 12);
  if (titles.length === 0) return [];

  const json = await query({
    prop: 'extracts|pageimages|description',
    exintro: '1',
    explaintext: '1',
    ...(long ? {} : { exsentences: '4' }),
    exlimit: String(titles.length),
    piprop: 'thumbnail',
    pithumbsize: '480',
    redirects: '1',
    titles: titles.join('|'),
  }, fetchFn);

  return Object.values(json.query?.pages ?? {})
    .filter((p) => p.pageid && isGoodTopic(p.title, p.extract) && !seen[`wiki-${p.pageid}`])
    .map((p) => ({ ...toCard(p, domain.id), ...(long ? { body: introParagraphs(p.extract) } : {}) }))
    .slice(0, count);
}

// Remplit la réserve pour que les devinettes restent disponibles hors connexion.
export async function refillPool(data, { target = 15, rng = Math.random, fetchFn = fetch } = {}) {
  if (!data.settings.wiki || data.wikiPool.length >= target) return false;
  const domains = shuffled(DOMAINS.filter((d) => !data.settings.disabled.includes(d.id)), rng).slice(0, 4);
  const results = await Promise.allSettled(domains.map((d) => fetchWikiCards(d, data.wikiSeen, { rng, fetchFn })));
  let added = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const card of result.value) {
      if (data.wikiPool.some((c) => c.id === card.id)) continue;
      data.wikiPool.push(card);
      added = true;
    }
  }
  return added;
}

export async function fetchOnThisDay(date = new Date(), { rng = Math.random, fetchFn = fetch } = {}) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const response = await fetchFn(`https://api.wikimedia.org/feed/v1/wikipedia/fr/onthisday/selected/${mm}/${dd}`);
  if (!response.ok) throw new Error(`Éphéméride indisponible (${response.status})`);
  const { selected = [] } = await response.json();
  if (selected.length === 0) return null;
  const event = selected[Math.floor(rng() * selected.length)];
  const text = event.text.replace(/\s*\(photo\)/g, '').trim();
  return { year: event.year, text: text[0].toUpperCase() + text.slice(1) };
}
