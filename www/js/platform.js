// Rappel quotidien : uniquement dans l'app Android, le navigateur n'en a pas l'équivalent fiable.
const REMINDER_ID = 1;

function bridge() {
  const cap = globalThis.Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

export const canRemind = () => bridge() !== null;

// Bouton retour d'Android : il remonte l'historique de l'app, et la quitte depuis l'accueil.
export function handleBackButton() {
  const cap = bridge();
  if (!cap) return;
  cap.nativeCallback('App', 'addListener', { eventName: 'backButton' }, ({ canGoBack }) => {
    if (canGoBack) history.back();
    else cap.nativePromise('App', 'exitApp');
  });
}

// Fichiers de sauvegarde, dans le dossier Documents partagé du téléphone.
export const canSaveFiles = () => bridge() !== null;

const files = (method, options) => bridge().nativePromise('Filesystem', method, { directory: 'DOCUMENTS', ...options });

export const documentsFs = {
  write: (path, data) => files('writeFile', { path, data, encoding: 'utf8', recursive: true }),
  list: async (path) => (await files('readdir', { path })).files.map((f) => f.name),
  remove: (path) => files('deleteFile', { path }),
};

// Une copie dans le cache de l'app, que le menu de partage d'Android peut transmettre.
export async function shareFile(name, text) {
  const cap = bridge();
  const { uri } = await cap.nativePromise('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await cap.nativePromise('Share', 'share', { title: 'Sauvegarde CulturG', files: [uri], dialogTitle: 'Envoyer la sauvegarde' });
  } catch (error) {
    if (!/cancel/i.test(error?.message ?? '')) throw error;
  }
}

// Dans un navigateur, la sauvegarde se télécharge simplement.
export function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const callNotifications = (method, options = {}) => bridge().nativePromise('LocalNotifications', method, options);

// Renvoie false si la permission est refusée, pour que le réglage reflète la réalité.
export async function setReminder(time) {
  if (!bridge()) return false;
  await callNotifications('cancel', { notifications: [{ id: REMINDER_ID }] });
  if (!time) return true;

  const { display } = await callNotifications('requestPermissions');
  if (display !== 'granted') return false;

  const [hour, minute] = time.split(':').map(Number);
  await callNotifications('schedule', {
    notifications: [{
      id: REMINDER_ID,
      title: 'Ta session du jour',
      body: 'Quelques minutes pour retenir, et de quoi découvrir.',
      schedule: { on: { hour, minute }, allowWhileIdle: true },
    }],
  });
  return true;
}
