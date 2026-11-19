// Sauvegardes dans Documents/CulturG : contrairement aux données de l'app, ce dossier
// survit à une désinstallation. Un fichier par jour, les plus anciens sont supprimés.
import { exportData } from './store.js';

export const BACKUP_DIR = 'CulturG';
const KEEP = 10;
const PATTERN = /^culturg-\d{4}-\d{2}-\d{2}(-[\w-]+)?\.json$/;

const pad = (n) => String(n).padStart(2, '0');
const dateStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function backupName(date, suffix = '') {
  return `culturg-${dateStamp(date)}${suffix ? `-${suffix}` : ''}.json`;
}

// Les noms commencent par la date : l'ordre alphabétique est l'ordre chronologique.
export function filesToPrune(names, keep = KEEP) {
  return names.filter((n) => PATTERN.test(n)).sort().reverse().slice(keep);
}

// Une installation neuve n'a rien à protéger : inutile d'ajouter un fichier vide aux sauvegardes.
export function isWorthSaving(data) {
  return Object.keys(data.cards).length > 0 || Object.keys(data.readSeen ?? {}).length > 0;
}

// Après une réinstallation, Android interdit de réécrire un fichier créé par l'ancienne
// installation : on retombe alors sur un nom horodaté plutôt que d'échouer.
export async function writeBackup(data, fs, { now = new Date(), suffix = '' } = {}) {
  const text = exportData(data, now);
  let name = backupName(now, suffix);
  try {
    await fs.write(`${BACKUP_DIR}/${name}`, text);
  } catch {
    name = backupName(now, [suffix, `${pad(now.getHours())}h${pad(now.getMinutes())}`].filter(Boolean).join('-'));
    await fs.write(`${BACKUP_DIR}/${name}`, text);
  }
  try {
    for (const old of filesToPrune(await fs.list(BACKUP_DIR))) {
      await fs.remove(`${BACKUP_DIR}/${old}`).catch(() => {});
    }
  } catch {
    // Le ménage est facultatif : la sauvegarde, elle, est écrite.
  }
  return name;
}

export function describeTime(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const time = `${date.getHours()} h ${pad(date.getMinutes())}`;
  const days = Math.round((new Date(now.toDateString()) - new Date(date.toDateString())) / 86400000);
  if (days === 0) return `aujourd'hui à ${time}`;
  if (days === 1) return `hier à ${time}`;
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}
