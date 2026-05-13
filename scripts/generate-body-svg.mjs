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
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(clean);
}

const SYSTEM =
  "Tu es un expert SVG anatomique. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans explication. Tes paths SVG utilisent exclusivement des courbes Bézier (C, Q, S) pour des formes organiques réalistes. Chaque muscle doit être anatomiquement positionné et proportionné.";

const PROMPT_FRONT = `
Tu es un expert en illustration SVG anatomique et en design fitness premium.
Génère les paths SVG d'un corps masculin athlétique — VUE FACE.
viewBox : "0 0 200 500"
Centre du corps : x=100

CONTRAINTES ANATOMIQUES STRICTES :
- Silhouette masculine athlétique (pas ronde, pas féminine)
- Épaules larges (~140px), taille resserrée (~90px), bassin ~110px
- Ratio tête/corps : 1/7.5
- Toutes les formes en courbes Bézier cubiques (C) ou quadratiques (Q)
- AUCUN polygon, AUCUN rect pour les membres
- Proportions réalistes : cuisses volumineuses, mollets définis

Génère EXACTEMENT ce JSON (et rien d'autre, pas de markdown) :
{
  "silhouette": "M100,10 C...",
  "muscles": [
    { "id": "pec_l", "name": "Pectoral gauche", "d": "..." },
    { "id": "pec_r", "name": "Pectoral droit", "d": "..." },
    { "id": "delt_fl", "name": "Deltoïde avant gauche", "d": "..." },
    { "id": "delt_fr", "name": "Deltoïde avant droit", "d": "..." },
    { "id": "bic_l", "name": "Biceps gauche", "d": "..." },
    { "id": "bic_r", "name": "Biceps droit", "d": "..." },
    { "id": "fore_l", "name": "Avant-bras gauche", "d": "..." },
    { "id": "fore_r", "name": "Avant-bras droit", "d": "..." },
    { "id": "abs_1l", "name": "Abdos haut gauche", "d": "..." },
    { "id": "abs_1r", "name": "Abdos haut droit", "d": "..." },
    { "id": "abs_2l", "name": "Abdos milieu gauche", "d": "..." },
    { "id": "abs_2r", "name": "Abdos milieu droit", "d": "..." },
    { "id": "abs_3l", "name": "Abdos bas gauche", "d": "..." },
    { "id": "abs_3r", "name": "Abdos bas droit", "d": "..." },
    { "id": "obl_l", "name": "Obliques gauche", "d": "..." },
    { "id": "obl_r", "name": "Obliques droit", "d": "..." },
    { "id": "quad_l", "name": "Quadriceps gauche", "d": "..." },
    { "id": "quad_r", "name": "Quadriceps droit", "d": "..." },
    { "id": "tib_l", "name": "Tibial ant. gauche", "d": "..." },
    { "id": "tib_r", "name": "Tibial ant. droit", "d": "..." },
    { "id": "calf_fl", "name": "Mollet gauche", "d": "..." },
    { "id": "calf_fr", "name": "Mollet droit", "d": "..." }
  ]
}
`;

const PROMPT_BACK = `
Tu es un expert en illustration SVG anatomique et en design fitness premium.
Génère les paths SVG d'un corps masculin athlétique — VUE DOS.
viewBox : "0 0 200 500"
Centre du corps : x=100

MÊMES CONTRAINTES que la vue face.
Le dos doit montrer clairement :
- Grand dorsal en V très marqué (s'évasant des aisselles vers la taille)
- Trapèzes larges et définis
- Fessiers ronds et volumineux
- Ischio-jambiers larges
- Mollets bicéphales (deux chefs visibles)

Génère EXACTEMENT ce JSON (et rien d'autre) :
{
  "silhouette": "M100,10 C...",
  "muscles": [
    { "id": "trap", "name": "Trapèzes", "d": "..." },
    { "id": "trap_l", "name": "Trapèze bas gauche", "d": "..." },
    { "id": "trap_r", "name": "Trapèze bas droit", "d": "..." },
    { "id": "rdel_l", "name": "Deltoïde arrière gauche", "d": "..." },
    { "id": "rdel_r", "name": "Deltoïde arrière droit", "d": "..." },
    { "id": "tri_l", "name": "Triceps gauche", "d": "..." },
    { "id": "tri_r", "name": "Triceps droit", "d": "..." },
    { "id": "fare_l", "name": "Avant-bras arrière gauche", "d": "..." },
    { "id": "fare_r", "name": "Avant-bras arrière droit", "d": "..." },
    { "id": "lat_l", "name": "Grand dorsal gauche", "d": "..." },
    { "id": "lat_r", "name": "Grand dorsal droit", "d": "..." },
    { "id": "lb", "name": "Lombaires", "d": "..." },
    { "id": "glu_l", "name": "Fessier gauche", "d": "..." },
    { "id": "glu_r", "name": "Fessier droit", "d": "..." },
    { "id": "ham_l", "name": "Ischio-jambier gauche", "d": "..." },
    { "id": "ham_r", "name": "Ischio-jambier droit", "d": "..." },
    { "id": "calf_bl", "name": "Mollet arrière gauche", "d": "..." },
    { "id": "calf_br", "name": "Mollet arrière droit", "d": "..." }
  ]
}
`;

async function main() {
  console.log("Generating FRONT and BACK in parallel...");
  const [frontData, backData] = await Promise.all([
    callClaude(SYSTEM, PROMPT_FRONT).then((d) => { console.log("✓ FRONT done"); return d; }),
    callClaude(SYSTEM, PROMPT_BACK).then((d) => { console.log("✓ BACK done"); return d; }),
  ]);

  fs.mkdirSync("src/data", { recursive: true });
  fs.writeFileSync(
    "src/data/bodymap-paths.json",
    JSON.stringify({ front: frontData, back: backData, generatedAt: new Date().toISOString() }, null, 2)
  );
  console.log("✓ src/data/bodymap-paths.json generated");
  console.log(`  Front muscles: ${frontData.muscles.length}`);
  console.log(`  Back muscles: ${backData.muscles.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
