// Détection WebGL — pure, testable, zéro dépendance Three.js (évite de
// charger tout le moteur 3D juste pour savoir s'il est utilisable). Le
// buste 3D (`BusteViewer`) retombe sur `RankIllustration` (2D) si `false`,
// jamais un écran cassé (même philosophie de repli que le reste de l'app).
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGL2RenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}
