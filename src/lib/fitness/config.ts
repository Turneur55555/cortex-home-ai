// Salles codées en dur (pas de gestion dynamique demandée). Maison et
// Fitness Park ajoutés phase 2 pour la question Lieu du Sensei conversationnel.
export const GYMS = ["Maison", "Keep Cool", "On Air", "Fitness Park"] as const;

/** Nom de séance par défaut ("Séance du lundi soir"), basé sur le jour et
 *  l'heure actuels. Utilisé par StartWorkoutSheet et par le Catalogue
 *  d'exercices (démarrage rapide depuis la fiche d'un exercice). */
export function defaultWorkoutName(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("fr-FR", { weekday: "long" });
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const h = now.getHours();
  if (h < 12) return `Séance du ${label} matin`;
  if (h < 17) return `Séance du ${label}`;
  return `Séance du ${label} soir`;
}
