import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed,
  Bath,
  Bed,
  Sofa,
  Shirt,
  Monitor,
  DoorOpen,
  WashingMachine,
  Archive,
  Car,
  TreePine,
  Refrigerator,
  Snowflake,
  Package,
  Leaf,
  Layers,
  Box,
  Shield,
  Droplets,
  Droplet,
  Sparkles,
  Wind,
  Moon,
  BookOpen,
  Star,
  Gamepad2,
  Tv,
  SprayCan,
  Heart,
  Bike,
} from "lucide-react";

export type Compartment = {
  id: string;
  name: string;
  Icon: LucideIcon;
};

export type Room = {
  id: string;
  name: string;
  Icon: LucideIcon;
  gradient: string;
  iconBg: string;
  compartments: Compartment[];
};

export const ROOMS: Room[] = [
  {
    id: "cuisine",
    name: "Cuisine",
    Icon: UtensilsCrossed,
    gradient: "from-orange-500/20 to-amber-500/5",
    iconBg: "bg-orange-500/20 text-orange-400",
    compartments: [
      { id: "frigo", name: "Frigo", Icon: Refrigerator },
      { id: "congelateur", name: "Congélateur", Icon: Snowflake },
      { id: "placard", name: "Placards", Icon: Package },
      { id: "epices", name: "Épices", Icon: Leaf },
      { id: "tiroirs", name: "Tiroirs", Icon: Layers },
      { id: "meuble-haut", name: "Meuble haut", Icon: Box },
      { id: "meuble-bas", name: "Meuble bas", Icon: Box },
    ],
  },
  {
    id: "salle-de-bain",
    name: "Salle de bain",
    Icon: Bath,
    gradient: "from-cyan-500/20 to-blue-500/5",
    iconBg: "bg-cyan-500/20 text-cyan-400",
    compartments: [
      { id: "armoire-pharmacie", name: "Armoire pharmacie", Icon: Shield },
      { id: "douche", name: "Douche", Icon: Droplets },
      { id: "lavabo", name: "Lavabo", Icon: Droplet },
      { id: "produits-visage", name: "Produits visage", Icon: Sparkles },
      { id: "produits-corps", name: "Produits corps", Icon: Heart },
      { id: "serviettes", name: "Serviettes", Icon: Wind },
    ],
  },
  {
    id: "chambre",
    name: "Chambre",
    Icon: Bed,
    gradient: "from-violet-500/20 to-purple-500/5",
    iconBg: "bg-violet-500/20 text-violet-400",
    compartments: [
      { id: "table-nuit", name: "Table de nuit", Icon: Moon },
      { id: "armoire", name: "Armoire", Icon: Package },
      { id: "commode", name: "Commode", Icon: Layers },
      { id: "sous-lit", name: "Sous le lit", Icon: Box },
      { id: "bureau", name: "Bureau", Icon: Monitor },
      { id: "skincare", name: "Skincare", Icon: Sparkles },
    ],
  },
  {
    id: "salon",
    name: "Salon",
    Icon: Sofa,
    gradient: "from-emerald-500/20 to-teal-500/5",
    iconBg: "bg-emerald-500/20 text-emerald-400",
    compartments: [
      { id: "meuble-tv", name: "Meuble TV", Icon: Tv },
      { id: "bibliotheque", name: "Bibliothèque", Icon: BookOpen },
      { id: "decoration", name: "Décoration", Icon: Star },
      { id: "tiroirs", name: "Tiroirs", Icon: Layers },
      { id: "console", name: "Console gaming", Icon: Gamepad2 },
      { id: "entretien", name: "Entretien", Icon: SprayCan },
    ],
  },
  {
    id: "dressing",
    name: "Dressing",
    Icon: Shirt,
    gradient: "from-fuchsia-500/20 to-pink-500/5",
    iconBg: "bg-fuchsia-500/20 text-fuchsia-400",
    compartments: [
      { id: "penderie", name: "Penderie", Icon: Package },
      { id: "tiroirs", name: "Tiroirs", Icon: Layers },
      { id: "chaussures", name: "Chaussures", Icon: Box },
      { id: "accessoires", name: "Accessoires", Icon: Star },
      { id: "sacs", name: "Sacs", Icon: Package },
    ],
  },
  {
    id: "bureau",
    name: "Bureau",
    Icon: Monitor,
    gradient: "from-blue-500/20 to-indigo-500/5",
    iconBg: "bg-blue-500/20 text-blue-400",
    compartments: [
      { id: "plan-travail", name: "Plan de travail", Icon: Monitor },
      { id: "tiroirs", name: "Tiroirs", Icon: Layers },
      { id: "etageres", name: "Étagères", Icon: BookOpen },
      { id: "materiel", name: "Matériel tech", Icon: Box },
      { id: "fournitures", name: "Fournitures", Icon: Package },
    ],
  },
  {
    id: "entree",
    name: "Entrée",
    Icon: DoorOpen,
    gradient: "from-yellow-500/20 to-amber-500/5",
    iconBg: "bg-yellow-500/20 text-yellow-400",
    compartments: [
      { id: "placard", name: "Placard entrée", Icon: Package },
      { id: "chaussures", name: "Chaussures", Icon: Box },
      { id: "manteaux", name: "Manteaux", Icon: Package },
      { id: "divers", name: "Divers", Icon: Layers },
    ],
  },
  {
    id: "buanderie",
    name: "Buanderie",
    Icon: WashingMachine,
    gradient: "from-sky-500/20 to-cyan-500/5",
    iconBg: "bg-sky-500/20 text-sky-400",
    compartments: [
      { id: "produits-lessive", name: "Produits lessive", Icon: SprayCan },
      { id: "linge", name: "Linge", Icon: Wind },
      { id: "repassage", name: "Repassage", Icon: Package },
      { id: "produits-maison", name: "Produits maison", Icon: Package },
    ],
  },
  {
    id: "cave",
    name: "Cave",
    Icon: Archive,
    gradient: "from-stone-500/20 to-slate-500/5",
    iconBg: "bg-stone-500/20 text-stone-400",
    compartments: [
      { id: "cave-vins", name: "Cave à vins", Icon: Droplet },
      { id: "stockage", name: "Stockage", Icon: Box },
      { id: "outils", name: "Outils", Icon: Package },
      { id: "divers", name: "Divers", Icon: Layers },
    ],
  },
  {
    id: "garage",
    name: "Garage",
    Icon: Car,
    gradient: "from-zinc-500/20 to-neutral-500/5",
    iconBg: "bg-zinc-500/20 text-zinc-400",
    compartments: [
      { id: "outils", name: "Outils", Icon: Package },
      { id: "velos", name: "Vélos", Icon: Bike },
      { id: "stockage", name: "Stockage", Icon: Box },
      { id: "produits-auto", name: "Produits auto", Icon: SprayCan },
    ],
  },
  {
    id: "balcon",
    name: "Balcon / Terrasse",
    Icon: TreePine,
    gradient: "from-green-500/20 to-emerald-500/5",
    iconBg: "bg-green-500/20 text-green-400",
    compartments: [
      { id: "plantes", name: "Plantes", Icon: Leaf },
      { id: "mobilier", name: "Mobilier", Icon: Package },
      { id: "jardinage", name: "Jardinage", Icon: Leaf },
      { id: "stockage", name: "Stockage", Icon: Box },
    ],
  },
];

export function getRoomById(id: string): Room | undefined {
  return ROOMS.find((r) => r.id === id);
}

export function getCompartmentById(roomId: string, compId: string): Compartment | undefined {
  return getRoomById(roomId)?.compartments.find((c) => c.id === compId);
}

/** Modules acceptés par l'edge function scan-fridge. */
export type ScanModule = "alimentation" | "pharmacie" | "habits" | "menager";

/**
 * Mapping robuste entre une pièce (id ou label UI) et le module backend.
 * Toute valeur inconnue retombe sur "menager" et émet un warning.
 */
const ROOM_TO_MODULE: Record<string, ScanModule> = {
  // Alimentation
  cuisine: "alimentation",
  alimentation: "alimentation",
  food: "alimentation",
  grocery: "alimentation",
  pantry: "alimentation",
  frigo: "alimentation",
  congelateur: "alimentation",
  cave: "alimentation",
  // Pharmacie
  "salle-de-bain": "pharmacie",
  pharmacie: "pharmacie",
  "armoire-pharmacie": "pharmacie",
  // Habits
  dressing: "habits",
  habits: "habits",
  vetement: "habits",
  vetements: "habits",
  garderobe: "habits",
  entree: "habits",
  // Ménager (catch-all maison)
  menager: "menager",
  menage: "menager",
  buanderie: "menager",
  salon: "menager",
  chambre: "menager",
  bureau: "menager",
  garage: "menager",
  balcon: "menager",
};

export function resolveScanModule(roomOrLabel: string | undefined | null): ScanModule {
  if (!roomOrLabel) {
    console.warn("[resolveScanModule] valeur vide → fallback menager");
    return "menager";
  }
  const key = roomOrLabel
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const mod = ROOM_TO_MODULE[key];
  if (mod) return mod;
  console.warn(
    `[resolveScanModule] valeur inconnue "${roomOrLabel}" (key="${key}") → fallback menager`,
  );
  return "menager";
}
