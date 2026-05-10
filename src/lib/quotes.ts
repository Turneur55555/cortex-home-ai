// Motivational quotes shown on the home page, refreshed once per browser session.
export type Quote = { text: string; author: string };

export const QUOTES: Quote[] = [
  { text: "La discipline est le pont entre les objectifs et les accomplissements.", author: "Jim Rohn" },
  { text: "Tu n'as pas besoin d'être grand pour commencer, mais tu dois commencer pour devenir grand.", author: "Zig Ziglar" },
  { text: "Le succès, c'est tomber sept fois et se relever huit.", author: "Proverbe japonais" },
  { text: "Ce qui ne te tue pas te rend plus fort.", author: "Friedrich Nietzsche" },
  { text: "Le seul échec, c'est celui de ne pas essayer.", author: "George Clooney" },
  { text: "La motivation te lance, l'habitude te fait avancer.", author: "Jim Ryun" },
  { text: "Les rêves ne fonctionnent que si tu te mets au travail.", author: "John C. Maxwell" разу" },
  { text: "Sois toi-même, les autres sont déjà pris.", author: "Oscar Wilde" },
  { text: "Le succès n'est pas final, l'échec n'est pas fatal : c'est le courage de continuer qui compte.", author: "Winston Churchill" },
  { text: "Fais aujourd'hui ce que les autres ne veulent pas, fais demain ce que les autres ne peuvent pas.", author: "Jerry Rice" },
  { text: "Ton corps peut tout supporter. C'est ton mental qu'il faut convaincre.", author: "Anonyme" },
  { text: "Le meilleur moment pour planter un arbre était il y a 20 ans. Le second meilleur, c'est maintenant.", author: "Proverbe chinois" },
  { text: "Tu es plus fort que tu ne le penses.", author: "A.A. Milne" },
  { text: "Le talent gagne des matchs, mais le travail d'équipe et l'intelligence gagnent des championnats.", author: "Michael Jordan" },
  { text: "Ne compte pas les jours, fais que les jours comptent.", author: "Mohamed Ali" },
  { text: "Le voyage de mille lieues commence par un seul pas.", author: "Lao Tseu" },
  { text: "Crois en toi et tout devient possible.", author: "Anonyme" },
  { text: "L'énergie et la persévérance viennent à bout de tout.", author: "Benjamin Franklin" },
  { text: "Le plus grand risque est de ne pas prendre de risque.", author: "Mark Zuckerberg" },
  { text: "On ne devient pas ce que l'on veut, on devient ce que l'on est.", author: "Carl Jung" },
  { text: "La meilleure façon de prédire l'avenir, c'est de le créer.", author: "Peter Drucker" },
  { text: "Les limites n'existent que dans ta tête.", author: "Anonyme" },
  { text: "Chaque expert a un jour été un débutant.", author: "Helen Hayes" },
  { text: "Sois le changement que tu veux voir dans le monde.", author: "Mahatma Gandhi" },
  { text: "Un objectif sans plan n'est qu'un souhait.", author: "Antoine de Saint-Exupéry" },
];

const STORAGE_KEY = "icortex.daily_quote.v1";

export function getSessionQuote(): Quote {
  if (typeof window === "undefined") return QUOTES[0];
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (cached) {
      const idx = Number(cached);
      if (Number.isInteger(idx) && idx >= 0 && idx < QUOTES.length) return QUOTES[idx];
    }
    const idx = Math.floor(Math.random() * QUOTES.length);
    sessionStorage.setItem(STORAGE_KEY, String(idx));
    return QUOTES[idx];
  } catch {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
}
