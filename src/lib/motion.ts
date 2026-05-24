/**
 * Centralised Framer Motion presets so animations stay coherent across the app.
 * Import from here rather than redefining transitions inline.
 */
import type { Transition, Variants } from "framer-motion";

export const easeOut: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] };
export const easeSpring: Transition = { type: "spring", stiffness: 380, damping: 30 };

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: easeOut },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

export const sheetSlideUp: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: easeSpring },
  exit: { y: "100%", transition: easeOut },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -6, transition: easeOut },
};
