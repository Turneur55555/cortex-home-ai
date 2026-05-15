export type Quote = { text: string; author: string };

// ─── Quotes organised by time of day ─────────────────────────────────────────

const MORNING: Quote[] = [
  { text: "La discipline est le pont entre les objectifs et les accomplissements.", author: "Jim Rohn" },
  { text: "Le seul échec, c'est celui de ne pas essayer.", author: "George Clooney" },
  { text: "Fais aujourd'hui ce que les autres ne veulent pas, fais demain ce que les autres ne peuvent pas.", author: "Jerry Rice" },
  { text: "Le voyage de mille lieues commence par un seul pas.", author: "Lao Tseu" },
  { text: "Tu n'as pas besoin d'être grand pour commencer, mais tu dois commencer pour devenir grand.", author: "Zig Ziglar" },
  { text: "Les rêves ne fonctionnent que si tu te mets au travail.", author: "John C. Maxwell" },
  { text: "Chaque matin est une nouvelle chance de devenir meilleur.", author: "Anonyme" },
  { text: "Ta seule limite, c'est toi-même.", author: "Anonyme" },
  { text: "Les champions ne se font pas dans les salles de sport — ils se font avec quelque chose qu'ils ont au fond d'eux.", author: "Muhammad Ali" },
];

const AFTERNOON: Quote[] = [
  { text: "La motivation te lance, l'habitude te fait avancer.", author: "Jim Ryun" },
  { text: "Le talent gagne des matchs, mais le travail d'équipe et l'intelligence gagnent des championnats.", author: "Michael Jordan" },
  { text: "Un objectif sans plan n'est qu'un souhait.", author: "Antoine de Saint-Exupéry" },
  { text: "Ton corps peut tout supporter. C'est ton mental qu'il faut convaincre.", author: "Anonyme" },
  { text: "Ne compte pas les jours, fais que les jours comptent.", author: "Mohamed Ali" },
  { text: "L'énergie et la persévérance viennent à bout de tout.", author: "Benjamin Franklin" },
  { text: "La douleur d'aujourd'hui est la force de demain.", author: "Anonyme" },
  { text: "La régularité bat le talent quand le talent ne travaille pas régulièrement.", author: "Tim Notke" },
  { text: "Pas d'excuses. Résultats, ou raisons — tu choisis.", author: "Anonyme" },
];

const EVENING: Quote[] = [
  { text: "Le succès n'est pas final, l'échec n'est pas fatal : c'est le courage de continuer qui compte.", author: "Winston Churchill" },
  { text: "Ce qui ne te tue pas te rend plus fort.", author: "Friedrich Nietzsche" },
  { text: "Le succès, c'est tomber sept fois et se relever huit.", author: "Proverbe japonais" },
  { text: "Sois toi-même, les autres sont déjà pris.", author: "Oscar Wilde" },
  { text: "On ne devient pas ce que l'on veut, on devient ce que l'on est.", author: "Carl Jung" },
  { text: "La meilleure façon de prédire l'avenir, c'est de le créer.", author: "Peter Drucker" },
  { text: "Chaque séance terminée est une victoire contre la version d'hier.", author: "Anonyme" },
  { text: "La discipline est la forme la plus haute de l'amour de soi.", author: "Anonyme" },
  { text: "Sois le changement que tu veux voir dans le monde.", author: "Mahatma Gandhi" },
];

const NIGHT: Quote[] = [
  { text: "Le meilleur moment pour planter un arbre était il y a 20 ans. Le second meilleur, c'est maintenant.", author: "Proverbe chinois" },
  { text: "Tu es plus fort que tu ne le penses.", author: "A.A. Milne" },
  { text: "Crois en toi et tout devient possible.", author: "Anonyme" },
  { text: "Les limites n'existent que dans ta tête.", author: "Anonyme" },
  { text: "Le repos fait partie de l'entraînement. Demain, tu reviens plus fort.", author: "Anonyme" },
  { text: "La nuit porte conseil — et les muscles poussent pendant le sommeil.", author: "Anonyme" },
  { text: "Ce que tu plantes aujourd'hui, tu le récolteras demain.", author: "Anonyme" },
];

// ─── Legacy pool (session-random, for backwards compat) ──────────────────────

export const QUOTES: Quote[] = [
  ...MORNING,
  ...AFTERNOON,
  ...EVENING,
  ...NIGHT,
];

// ─── Contextual selection ─────────────────────────────────────────────────────

function pickFromPool(pool: Quote[], storageKey: string): Quote {
  if (typeof window === "undefined") return pool[0];
  try {
    const cached = sessionStorage.getItem(storageKey);
    if (cached) {
      const idx = Number(cached);
      if (Number.isInteger(idx) && idx >= 0 && idx < pool.length) return pool[idx];
    }
    const idx = Math.floor(Math.random() * pool.length);
    sessionStorage.setItem(storageKey, String(idx));
    return pool[idx];
  } catch {
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

export function getContextualQuote(): Quote {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return pickFromPool(MORNING, "icortex.quote.morning");
  if (h >= 12 && h < 18) return pickFromPool(AFTERNOON, "icortex.quote.afternoon");
  if (h >= 18 && h < 23) return pickFromPool(EVENING, "icortex.quote.evening");
  return pickFromPool(NIGHT, "icortex.quote.night");
}

export function getSessionQuote(): Quote {
  return getContextualQuote();
}
