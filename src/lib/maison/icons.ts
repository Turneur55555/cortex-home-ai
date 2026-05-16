import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed, Bath, Bed, Sofa, Shirt, Monitor, DoorOpen,
  WashingMachine, Archive, Car, TreePine, Refrigerator, Snowflake,
  Package, Leaf, Layers, Box, Shield, Droplets, Droplet, Sparkles,
  Wind, Moon, BookOpen, Star, Gamepad2, Tv, SprayCan, Heart, Bike,
  ChefHat, Home, Flower2, Coffee, Wine, Dumbbell, Baby, Wrench,
  Pencil, Music, Camera, Flame, Umbrella, Zap, Globe, ShoppingBag,
  Pill, Dog, Cat, Fish, Bird, Paintbrush, Scissors, Key,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  // Rooms
  ChefHat, UtensilsCrossed, Bath, Bed, Sofa, Shirt, Monitor, DoorOpen,
  WashingMachine, Archive, Car, TreePine, Home,
  // Storage
  Refrigerator, Snowflake, Package, Layers, Box, Shield,
  // Nature
  Leaf, Droplets, Droplet, Sparkles, Wind, Moon, Flower2,
  // Lifestyle
  BookOpen, Star, Gamepad2, Tv, SprayCan, Heart, Bike, Coffee, Wine,
  Dumbbell, Baby, Music, Camera,
  // Tools
  Wrench, Pencil, Paintbrush, Scissors, Key,
  // Misc
  Flame, Umbrella, Zap, Globe, ShoppingBag, Pill, Dog, Cat, Fish, Bird,
};

export const ICON_NAMES = Object.keys(ICON_MAP) as (keyof typeof ICON_MAP)[];

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Box;
}
