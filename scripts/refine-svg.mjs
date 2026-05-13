import fs from "fs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable");
  process.exit(1);
}

async function callClaude(system, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

const [, , muscleId, feedback] = process.argv;
if (!muscleId || !feedback) {
  console.error("Usage: node scripts/refine-svg.mjs <muscleId> <feedback>");
  console.error('Example: node scripts/refine-svg.mjs quad_l "trop petit"');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync("src/data/bodymap-paths.json", "utf8"));
const allMuscles = [...data.front.muscles, ...data.back.muscles];
const muscle = allMuscles.find((m) => m.id === muscleId);

if (!muscle) {
  console.error(`Muscle "${muscleId}" not found`);
  console.error("Available:", allMuscles.map((m) => m.id).join(", "));
  process.exit(1);
}

console.log(`Refining ${muscleId}: ${feedback}`);
const newPath = await callClaude(
  "Expert SVG anatomique. Réponds UNIQUEMENT avec le nouveau path d SVG, rien d'autre.",
  `Améliore ce path SVG pour le muscle "${muscleId}".
viewBox: 0 0 200 500, centre x=100.
Path actuel : ${muscle.d}
Problème : ${feedback}
Retourne uniquement la valeur du attribut d (pas la balise path, juste la chaîne de coordonnées).
Utilise des courbes Bézier cubiques (C) pour un rendu organique et anatomique.`
);

muscle.d = newPath;
fs.writeFileSync("src/data/bodymap-paths.json", JSON.stringify(data, null, 2));
console.log(`✓ ${muscleId} updated`);
