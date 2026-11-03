/**
 * Qualité des données du Dressing — logique pure, zéro import React.
 *
 * Détecte ce qui fausse le dressing et PROPOSE une correction : rien n'est
 * jamais écrit sans l'accord du joueur (écran « Remise à niveau »). Les
 * propositions sont recalculées à chaque lecture : une correction appliquée
 * disparaît d'elle-même, rien n'est stocké.
 *
 * Cas réels relevés le 03/11/2026 (33 pièces) : noms sans accord
 * (« Chemise blanc »), « T shirt » sans trait d'union, noms génériques
 * (« Shorts », « Polo »), nom ↔ couleur contradictoires (« Polo noir »
 * enregistré blanc), nom ↔ type (« Jogging vert » rangé en pantalon),
 * pièces sans saison, noms en double.
 */
import { agreeColor, grammarOf, suggestWardrobeName } from "./naming";
import {
  WARDROBE_SUBCATEGORIES,
  WARDROBE_UI_CATEGORY_BY_DB,
  canonicalWardrobeColor,
  canonicalWardrobeSubcategory,
  findSubcategory,
} from "./taxonomy";

export interface QualityItem {
  id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  material: string | null;
  pattern: string | null;
  seasons: string[];
}

export interface WardrobePatch {
  name?: string;
  subcategory?: string;
  primary_color?: string;
  secondary_colors?: string[];
  seasons?: string[];
}

export type WardrobeFixKind = "name" | "subcategory" | "color" | "seasons";

export interface WardrobeFixChoice {
  label: string;
  patch: WardrobePatch;
}

export interface WardrobeFix {
  /** Stable : `${kind}:${itemId}`. */
  key: string;
  kind: WardrobeFixKind;
  itemId: string;
  title: string;
  detail: string;
  /** Correction directe (acceptable d'un appui, et par « Tout accepter »). */
  patch: WardrobePatch | null;
  /** Question à trancher : jamais acceptée en masse. */
  choices: WardrobeFixChoice[];
}

export const ALL_SEASONS = ["printemps", "ete", "automne", "hiver"];

/** Minuscules, sans accent, tout ce qui n'est pas une lettre/chiffre réduit à une espace. */
function letters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Couleurs reconnues dans un nom, formes accordées comprises, les composées d'abord. */
const NAME_COLOR_WORDS: Array<{ word: string; color: string }> = (() => {
  const base = [
    "gris foncé",
    "gris clair",
    "bleu marine",
    "bleu clair",
    "noir",
    "blanc",
    "gris",
    "bleu",
    "beige",
    "marron",
    "vert",
    "rouge",
    "jaune",
    "orange",
    "rose",
    "violet",
    "bordeaux",
  ];
  const words: Array<{ word: string; color: string }> = [];
  for (const color of base) {
    const forms = new Set([
      color,
      agreeColor(color, { gender: "f", plural: false }),
      agreeColor(color, { gender: "m", plural: true }),
      agreeColor(color, { gender: "f", plural: true }),
    ]);
    for (const form of forms) words.push({ word: letters(form), color });
  }
  return words.sort((a, b) => b.word.split(" ").length - a.word.split(" ").length);
})();

/** Couleur nommée dans un nom (« Polo noir » → noir), ou null. */
export function colorInName(name: string): string | null {
  const padded = ` ${letters(name)} `;
  for (const { word, color } of NAME_COLOR_WORDS) {
    if (padded.includes(` ${word} `)) return color;
  }
  return null;
}

/** Type précis désigné par le début du nom, dans la catégorie de la pièce. */
function subcategoryInName(name: string, category: string | null): string | null {
  const ui = category ? WARDROBE_UI_CATEGORY_BY_DB[category] : undefined;
  if (!ui) return null;
  const folded = letters(name);
  const firstWord = folded.split(" ")[0] ?? "";
  // Les libellés les plus longs d'abord (« Short de bain » avant « Short »).
  const defs = WARDROBE_SUBCATEGORIES.filter((d) => d.category === ui).sort(
    (a, b) => b.label.length - a.label.length,
  );
  for (const def of defs) {
    const label = letters(def.label);
    if (folded === label || folded.startsWith(`${label} `)) return def.value;
  }
  const alias = canonicalWardrobeSubcategory(firstWord);
  return alias && findSubcategory(alias)?.category === ui ? alias : null;
}

const PATTERN_QUALIFIER: Record<string, [string, string]> = {
  texture: ["texturé", "texturée"],
  rayures: ["à rayures", "à rayures"],
  carreaux: ["à carreaux", "à carreaux"],
  imprime: ["imprimé", "imprimée"],
  graphique: ["graphique", "graphique"],
  logo: ["à logo", "à logo"],
};

type Qualifier = (item: QualityItem) => string | null;

/**
 * Ce qui distingue deux pièces au même nom, dans l'ordre : marque, matière
 * (le coton, courant, ne qualifie pas), couleur secondaire, motif (l'uni non plus).
 */
const QUALIFIERS: Qualifier[] = [
  (i) => i.brand?.trim() || null,
  (i) => {
    const m = letters(i.material ?? "");
    return m && m !== "coton" ? `en ${m}` : null;
  },
  (i) =>
    i.secondary_colors[0]
      ? `et ${agreeColor(i.secondary_colors[0], grammarOf(i.subcategory))}`
      : null,
  (i) => {
    const q = i.pattern ? PATTERN_QUALIFIER[i.pattern] : undefined;
    return q ? q[grammarOf(i.subcategory).gender === "f" ? 1 : 0] : null;
  },
];

/**
 * Départage un groupe de pièces qui porteraient le même nom : le premier
 * critère dont les valeurs sont toutes différentes (une seule pièce peut
 * rester sans précision) l'emporte. Null si aucun ne départage.
 */
function disambiguate(group: QualityItem[], base: string): Map<string, string> | null {
  for (const qualifier of QUALIFIERS) {
    const values = group.map(qualifier);
    const present = values.filter((v): v is string => v !== null);
    const distinct = new Set(values.map((v) => v ?? "")).size === group.length;
    if (distinct && present.length >= group.length - 1) {
      return new Map(
        group.map((item, idx) => [item.id, values[idx] ? `${base} ${values[idx]}` : base]),
      );
    }
  }
  return null;
}

function quote(s: string): string {
  return `« ${s} »`;
}

/** Toutes les corrections proposées pour le dressing, dans un ordre stable. */
export function detectWardrobeFixes(items: QualityItem[]): WardrobeFix[] {
  const fixes: WardrobeFix[] = [];
  const colorConflict = new Set<string>();

  // 1. Nom ↔ type précis (« Jogging vert » rangé en pantalon).
  const subcategoryOf = new Map<string, string | null>();
  for (const item of items) {
    const named = item.name ? subcategoryInName(item.name, item.category) : null;
    const current = canonicalWardrobeSubcategory(item.subcategory);
    subcategoryOf.set(item.id, current);
    if (named && current && named !== current) {
      const from = findSubcategory(current)?.label ?? current;
      const to = findSubcategory(named)?.label ?? named;
      subcategoryOf.set(item.id, named);
      fixes.push({
        key: `subcategory:${item.id}`,
        kind: "subcategory",
        itemId: item.id,
        title: item.name ?? to,
        detail: `rangé en ${quote(from.toLowerCase())} → ${to.toLowerCase()}`,
        patch: { subcategory: named },
        choices: [],
      });
    }
  }

  // 2. Nom ↔ couleur principale (« Polo noir » enregistré blanc) : une question.
  for (const item of items) {
    const named = item.name ? colorInName(item.name) : null;
    const stored = canonicalWardrobeColor(item.primary_color);
    if (!named || !stored || named === stored) continue;
    colorConflict.add(item.id);
    const sub = subcategoryOf.get(item.id) ?? item.subcategory;
    const renamed = suggestWardrobeName(sub, stored);
    const secondary = [stored, ...item.secondary_colors.filter((c) => c !== named)];
    fixes.push({
      key: `color:${item.id}`,
      kind: "color",
      itemId: item.id,
      title: [item.name, item.brand].filter(Boolean).join(" · "),
      detail: `couleur enregistrée ${stored} — laquelle est juste ?`,
      patch: null,
      choices: [
        {
          label: named.charAt(0).toUpperCase() + named.slice(1),
          patch: { primary_color: named, secondary_colors: [...new Set(secondary)] },
        },
        ...(renamed
          ? [
              {
                label: stored.charAt(0).toUpperCase() + stored.slice(1),
                patch: { name: renamed },
              },
            ]
          : []),
      ],
    });
  }

  // 3. Noms : accord, orthographe, nom générique, doublons.
  const proposed = new Map<string, string>();
  for (const item of items) {
    if (colorConflict.has(item.id) || !item.name) continue;
    const sub = subcategoryOf.get(item.id) ?? null;
    const def = findSubcategory(sub);
    const expected = suggestWardrobeName(sub, item.primary_color);
    if (!def || !expected) continue;
    const name = letters(item.name);
    const raw = letters(`${def.label} ${item.primary_color ?? ""}`);
    const generic = name === letters(def.label) || canonicalWardrobeSubcategory(name) === def.value;
    const generated = name === raw || name === letters(expected);
    if (generic || generated) proposed.set(item.id, expected);
  }
  // Noms finaux (proposés ou actuels) en double → précision qui départage.
  const finalName = (item: QualityItem) => proposed.get(item.id) ?? item.name ?? "";
  const groups = new Map<string, QualityItem[]>();
  for (const item of items) {
    // Une pièce à la couleur contestée attend la réponse du joueur.
    if (colorConflict.has(item.id)) continue;
    const key = letters(finalName(item));
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const named = disambiguate(group, finalName(group[0]));
    if (named) for (const [id, n] of named) proposed.set(id, n);
  }
  for (const item of items) {
    const next = proposed.get(item.id);
    if (!next || next === item.name) continue;
    fixes.push({
      key: `name:${item.id}`,
      kind: "name",
      itemId: item.id,
      title: item.name ?? next,
      detail: `→ ${next}`,
      patch: { name: next },
      choices: [],
    });
  }

  // 4. Aucune saison renseignée → toutes saisons.
  for (const item of items) {
    if (item.seasons.length > 0) continue;
    fixes.push({
      key: `seasons:${item.id}`,
      kind: "seasons",
      itemId: item.id,
      title: proposed.get(item.id) ?? item.name ?? "Pièce sans nom",
      detail: "aucune saison → toutes saisons",
      patch: { seasons: ALL_SEASONS },
      choices: [],
    });
  }

  return fixes;
}

/** Noms encore en double après corrections (à départager à la main), groupés. */
export function remainingDuplicateNames(items: QualityItem[]): string[] {
  const fixes = detectWardrobeFixes(items);
  const renamed = new Map(
    fixes.filter((f) => f.patch?.name).map((f) => [f.itemId, f.patch!.name!] as const),
  );
  const counts = new Map<string, { label: string; n: number }>();
  for (const item of items) {
    const label = renamed.get(item.id) ?? item.name ?? "";
    const key = letters(label);
    if (!key) continue;
    const entry = counts.get(key) ?? { label, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  return [...counts.values()].filter((c) => c.n > 1).map((c) => c.label);
}

/** Pièces dont la photo n'est pas encore détourée (Remise à niveau). */
export function itemsWithoutCutout<
  T extends { storage_path: string | null; processed_storage_path: string | null },
>(items: readonly T[]): T[] {
  return items.filter((i) => !!i.storage_path && !i.processed_storage_path);
}
