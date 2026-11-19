import test from 'node:test';
import assert from 'node:assert/strict';
import { backupName, filesToPrune, isWorthSaving, writeBackup, describeTime, BACKUP_DIR } from '../www/js/backup.js';
import { defaultData, importData } from '../www/js/store.js';

const NOW = new Date(2026, 10, 19, 19, 7);

function fakeFs(existing = [], { lockedNames = [] } = {}) {
  const files = new Map(existing.map((n) => [`${BACKUP_DIR}/${n}`, '{}']));
  return {
    files,
    write: async (path, text) => {
      if (lockedNames.some((n) => path.endsWith(n))) throw new Error('FILE_NOTCREATED');
      files.set(path, text);
    },
    list: async () => [...files.keys()].map((p) => p.split('/').pop()),
    remove: async (path) => { files.delete(path); },
  };
}

function studied() {
  const data = defaultData();
  data.cards.x = { s: 3, d: 5, last: 1, due: 4, reps: 1, lapses: 0 };
  return data;
}

test('le nom du fichier porte la date du jour', () => {
  assert.equal(backupName(NOW), 'culturg-2026-11-19.json');
  assert.equal(backupName(NOW, 'avant-restauration'), 'culturg-2026-11-19-avant-restauration.json');
});

test('seuls les dix fichiers les plus récents sont gardés', () => {
  const names = Array.from({ length: 12 }, (_, i) => `culturg-2026-11-${String(i + 1).padStart(2, '0')}.json`);
  assert.deepEqual(filesToPrune([...names, 'notes.txt', 'photo.jpg']), ['culturg-2026-11-02.json', 'culturg-2026-11-01.json']);
});

test('une installation neuve ne crée pas de sauvegarde vide', () => {
  assert.equal(isWorthSaving(defaultData()), false);
  assert.equal(isWorthSaving(studied()), true);
});

test('la sauvegarde s\'écrit dans le dossier et se relit à l\'identique', async () => {
  const fs = fakeFs();
  const name = await writeBackup(studied(), fs, { now: NOW });
  assert.equal(name, 'culturg-2026-11-19.json');
  const text = fs.files.get(`${BACKUP_DIR}/${name}`);
  const restored = importData(text);
  assert.deepEqual(restored.cards, studied().cards);
  assert.equal(JSON.parse(text).savedAt, NOW.toISOString());
});

test('un fichier laissé par une ancienne installation n\'empêche pas de sauvegarder', async () => {
  const fs = fakeFs(['culturg-2026-11-19.json'], { lockedNames: ['culturg-2026-11-19.json'] });
  const name = await writeBackup(studied(), fs, { now: NOW });
  assert.equal(name, 'culturg-2026-11-19-19h07.json');
  assert.ok(fs.files.has(`${BACKUP_DIR}/culturg-2026-11-19.json`));
});

test('le ménage supprime les vieux fichiers sans toucher aux autres', async () => {
  const old = Array.from({ length: 10 }, (_, i) => `culturg-2026-10-${String(i + 10).padStart(2, '0')}.json`);
  const fs = fakeFs([...old, 'liste-de-courses.txt']);
  await writeBackup(studied(), fs, { now: NOW });
  assert.equal(fs.files.size, 11);
  assert.ok(!fs.files.has(`${BACKUP_DIR}/culturg-2026-10-10.json`));
  assert.ok(fs.files.has(`${BACKUP_DIR}/liste-de-courses.txt`));
});

test('une panne pendant le ménage n\'annule pas la sauvegarde', async () => {
  const fs = { ...fakeFs(), list: async () => { throw new Error('refusé'); } };
  assert.equal(await writeBackup(studied(), fs, { now: NOW }), 'culturg-2026-11-19.json');
});

test('la date de la dernière sauvegarde se lit en langage courant', () => {
  assert.equal(describeTime(new Date(2026, 10, 19, 8, 5).getTime(), NOW), 'aujourd\'hui à 8 h 05');
  assert.equal(describeTime(new Date(2026, 10, 18, 21, 30).getTime(), NOW), 'hier à 21 h 30');
  assert.equal(describeTime(new Date(2026, 10, 2, 9, 0).getTime(), NOW), 'le 2 novembre');
});
