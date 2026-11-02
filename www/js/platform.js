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
