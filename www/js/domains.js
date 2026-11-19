// Les domaines de l'app. `hue` colore l'interface, `wiki` liste les projets
// Wikipédia dont les articles importants alimentent les découvertes sans fin.
export const DOMAINS = [
  { id: 'antiquite', label: 'Antiquité & Moyen Âge', hue: 55, wiki: ['Rome antique', 'Monde antique', 'Moyen Âge', 'Âge des Vikings', 'Empire carolingien'] },
  { id: 'histoire', label: 'Histoire moderne', hue: 25, wiki: ['Histoire', 'Révolution et Empire', 'Première Guerre mondiale', 'Seconde Guerre mondiale', 'Histoire militaire'] },
  { id: 'geo', label: 'Géographie', hue: 165, wiki: ['Géographie', 'Afrique', 'Asie', 'Amérique du Sud', 'Europe'] },
  { id: 'monde', label: 'Cultures du monde', hue: 195, wiki: ['Japon', 'Corée', 'Chine médiévale', 'Monde arabo-musulman', 'Moyen-Orient', 'Amérique précolombienne'] },
  { id: 'litterature', label: 'Littérature', hue: 340, wiki: ['Littérature', 'Poésie', 'Théâtre', 'Science-fiction'] },
  { id: 'philo', label: 'Philosophie', hue: 290, wiki: ['Philosophie', 'Logique'] },
  { id: 'art', label: 'Peinture & sculpture', hue: 10, wiki: ['Peinture', 'Sculpture', 'Arts', 'Photographie'] },
  { id: 'architecture', label: 'Architecture', hue: 75, wiki: ['Architecture et urbanisme', 'Archéologie', 'Châteaux', 'Monuments historiques'] },
  { id: 'musique', label: 'Musique', hue: 315, wiki: ['Musique', 'Musique classique', 'Jazz', 'Rock'] },
  { id: 'cinema', label: 'Cinéma', hue: 0, wiki: ['Cinéma', 'Télévision', 'Animation'] },
  { id: 'mythes', label: 'Mythes & religions', hue: 95, wiki: ['Mythologies', 'Mythologie grecque', 'Mythologie nordique', 'Religions et croyances', 'Christianisme', 'Islam', 'Bouddhisme', 'Judaïsme', 'Hindouisme'] },
  { id: 'physique', label: 'Physique & chimie', hue: 240, wiki: ['Physique', 'Chimie', 'Histoire des sciences'] },
  { id: 'vivant', label: 'Corps & médecine', hue: 150, wiki: ['Biologie', 'Médecine', 'Anatomie', 'Neurosciences'] },
  { id: 'espace', label: 'Astronomie & espace', hue: 265, wiki: ['Astronomie', 'Astronautique'] },
  { id: 'maths', label: 'Mathématiques', hue: 220, wiki: ['Mathématiques'] },
  { id: 'terre', label: 'Terre & climat', hue: 130, wiki: ['Géologie', 'Environnement', 'Météorologie', 'Énergie'] },
  { id: 'nature', label: 'Animaux & plantes', hue: 115, wiki: ['Zoologie', 'Botanique', 'Ornithologie', 'Entomologie'] },
  { id: 'tech', label: 'Inventions & numérique', hue: 205, wiki: ['Informatique', 'Électricité et électronique', 'Télécommunications', 'Aéronautique', 'Automobile'] },
  { id: 'eco', label: 'Économie', hue: 85, wiki: ['Économie', 'Entreprises', 'Finance'] },
  { id: 'politique', label: 'Politique & droit', hue: 280, wiki: ['Droit', 'Politique', 'Relations internationales', 'Union européenne'] },
  { id: 'humaines', label: 'Psycho & société', hue: 330, wiki: ['Psychologie', 'Sociologie', 'Anthropologie'] },
  { id: 'langue', label: 'Langue & mots', hue: 40, wiki: ['Langues', 'Langue française et francophonie'] },
  { id: 'sport', label: 'Sport', hue: 180, wiki: ['Sport', 'Football', 'Cyclisme', 'Jeux olympiques', 'Tennis', 'Rugby à XV'] },
  { id: 'gastronomie', label: 'Table & gastronomie', hue: 65, wiki: ['Alimentation et gastronomie', 'Vigne et vin'] },
  { id: 'pop', label: 'BD, jeux & pop culture', hue: 300, wiki: ['Bande dessinée', 'Jeu vidéo', 'Jeux'] },
];

export const domainById = Object.fromEntries(DOMAINS.map((d) => [d.id, d]));
