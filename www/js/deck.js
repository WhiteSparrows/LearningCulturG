// Rassemble les paquets de cartes. L'identifiant dérive de la question :
// corriger une réponse ou une explication ne fait donc pas perdre la progression.
import histoire from '../data/histoire.js';
import lettres from '../data/lettres.js';
import arts from '../data/arts.js';
import sciences from '../data/sciences.js';
import societe from '../data/societe.js';

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const packs = [histoire, lettres, arts, sciences, societe];

export const DECK = packs.flatMap((pack) =>
  Object.entries(pack).flatMap(([domain, rows]) =>
    rows.map(([q, a, wrong, x]) => ({ id: `${domain}-${hash(q)}`, domain, q, a, wrong, x }))
  )
);
