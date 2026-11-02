# CulturG

Une application Android pour passer 10 à 15 minutes par jour à apprendre de la culture générale, et surtout à la retenir. Usage strictement personnel : pas de compte, pas de serveur, tout reste sur le téléphone.

## Comment ça marche

Chaque session mélange deux choses, dans la limite du temps choisi (10, 12 ou 15 minutes) :

- **Des révisions** : les cartes que tu risques d'oublier, les plus fragiles d'abord.
- **Des découvertes** : au moins 3 par jour, même les jours chargés, prises dans les domaines que tu as le moins explorés.

Le parcours d'une connaissance suit ce qui fonctionne le mieux pour la mémoire :

1. Tu la **découvres**, avec une explication qui donne une raison de t'en souvenir.
2. Quelques cartes plus loin, un **QCM** t'oblige à la retrouver.
3. Tu la revois sous 2 jours, puis à **intervalles croissants**, cette fois sans propositions : tu cherches dans ta tête, tu regardes la réponse et tu notes ton rappel.
4. Une carte ratée revient avant la fin de la session, puis dès le lendemain.

Les intervalles sont calculés par [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) (version 4.5, paramètres par défaut), à partir de ce que tu as retenu ou oublié. Même une connaissance très solide revient au moins tous les 2 ans. L'app mesure aussi ton rythme réel pour ajuster le nombre de cartes à la durée choisie.

## Le mode Lire

Pour apprendre sans flashcards : ni question ni note, juste des articles de fond de Wikipédia entrecoupés de savoirs courts, sur tous les domaines ou sur celui que tu choisis. Rien ne s'ajoute aux révisions, sauf ce que tu marques « Retenir ». Une journée de lecture compte dans ta série, mais n'entame pas le temps de la session du jour.

## Approfondir

Quand une carte en dit trop peu, le bouton « Approfondir » ouvre l'article Wikipédia complet dans l'app : l'introduction, puis les grandes parties à déplier. Il apparaît une fois la réponse connue, pour ne rien dévoiler. En refermant, tu retrouves la carte là où tu l'avais laissée, et ce temps n'entame pas celui de la session. Il faut une connexion.

## D'où vient le contenu

- **531 cartes rédigées** sur 25 domaines, utilisables hors connexion : histoire, géographie, cultures du monde, littérature, philosophie, peinture, architecture, musique, cinéma, mythes et religions, physique, médecine, espace, maths, climat, animaux et plantes, inventions, économie, politique, psychologie, langue, sport, gastronomie, pop culture.
- **Wikipédia en français**, sans fin : les articles que les projets Wikipédia classent d'importance « maximum » ou « élevée » (plusieurs dizaines de milliers) deviennent des devinettes, le résumé de l'article avec son sujet masqué. Tu gardes ce qui t'intéresse et tu écartes le reste. Une réserve est téléchargée à l'avance pour les moments hors connexion.
- **L'éphéméride de Wikipédia** : un événement du jour sur l'accueil, à ajouter à tes révisions si tu veux.

Les cartes ont été rédigées par Claude sans vérification individuelle dans une source. Le bouton « Signaler une erreur » retire une carte douteuse des révisions, et les réglages permettent de la rétablir.

Pour ajouter des cartes, il suffit de compléter un fichier de [www/data](www/data). Le format est `[question, réponse, [3 mauvaises réponses], explication, titre de l'article Wikipédia]`. Modifier le texte d'une question réinitialise sa progression, mais pas modifier la réponse ou l'explication.

## Installer l'app sur le téléphone

Il faut Node.js et Android Studio (pour son JDK et le SDK Android 34).

```bash
npm install
```

```bash
npm run android:build
```

Le script [scripts/build-apk.ps1](scripts/build-apk.ps1) gère aussi l'analyse HTTPS d'Avast, qui provoque sinon l'erreur `PKIX path building failed` : il donne à Java une copie de ses certificats complétée de la racine Avast. Git a le même problème (`SSL certificate problem`), qui se règle en lui faisant utiliser le magasin de certificats de Windows, sans désactiver la vérification :

```bash
git -c http.sslBackend=schannel push
```

L'APK se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`. Pour l'installer, deux possibilités :

- **Par câble**, avec le débogage USB activé sur le téléphone : `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
- **Sans câble** : copie le fichier sur le téléphone, ouvre-le et autorise l'installation depuis cette source.

Pour conserver ta progression lors d'une mise à jour, installe toujours un APK compilé sur le même PC. Une clé de signature différente oblige à désinstaller, ce qui efface les données. En cas de doute, fais d'abord un export depuis **Réglages > Sauvegarde**.

## Développer

```bash
npm test
npm run dev
```

`npm run dev` sert l'app sur http://localhost:5173. Le rappel quotidien n'existe que dans l'app Android installée.

| Fichier | Rôle |
| --- | --- |
| [www/js/fsrs.js](www/js/fsrs.js) | Calcul des intervalles de révision |
| [www/js/session.js](www/js/session.js) | Composition et déroulé de la session |
| [www/js/wikipedia.js](www/js/wikipedia.js) | Récupération des articles et masquage des devinettes |
| [www/js/app.js](www/js/app.js) | Interface |
| [www/data](www/data) | Cartes rédigées |
| [android](android) | Projet Capacitor qui emballe `www` en application Android |

Après toute modification de `www`, relance `npx cap sync android` avant de recompiler.

Les textes issus de Wikipédia sont sous licence CC BY-SA.
