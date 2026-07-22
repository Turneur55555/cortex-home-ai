import { motion } from "framer-motion";

import { RankIllustration } from "@/components/rpg/RankIllustration";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useUserStats } from "@/hooks/useUserStats";
import {
  titleProgressForXp,
  nextGradeLabel,
  type TitleProgress,
} from "@/lib/fitness/rpg/titleProgress";
import { formatXp } from "@/lib/fitness/rpg/grade";
import { EASE_OUT } from "@/components/rpg/premium/tokens";
import { MATERIAL_GRAIN, rankGlowShadow, rankThemeByKey } from "@/components/rpg/rankTheme";

/**
 * Fiche de Personnage — pièce maîtresse de CORTEX (Accueil).
 *
 * L'illustration officielle du TITRE courant (« GUERRIER », « TITAN »…) est
 * TOUJOURS la star : elle porte le nom du rang, on ne superpose jamais de
 * texte dessus (cf. `assets/ranks/FORMAT.md`).
 *
 * ── Proof of Concept « Artefact Guerrier » (22/07/2026) ─────────────────────
 * Pour le rang GUERRIER uniquement, la carte n'est plus un simple conteneur
 * d'illustration : c'est une **plaque de cuivre forgée**. L'illustration est
 * sertie dans la matière (fenêtre en creux), et la progression / les
 * statistiques sont gravées dans le cuivre sous elle. Les autres rangs
 * conservent le rendu historique (illustration plein cadre) — ils seront
 * adaptés dans un second temps.
 *
 * Aucune logique métier ici : le Titre vient du moteur de progression
 * principale (`titleProgress`, piloté PAR L'XP GLOBALE UNIQUEMENT). Seules les
 * données déjà calculées sont mises en scène — rien n'est inventé.
 */
export function ProfileHeroCard() {
  const { data: userStats } = useUserStats();
  const progress = titleProgressForXp(userStats?.xp ?? 0);

  // Position dans le palier courant (0..100).
  const gradeSpan = Math.max(
    1,
    (progress.xpNextThreshold ?? progress.xpCurrentThreshold) - progress.xpCurrentThreshold,
  );
  const percentInGrade = progress.isMax
    ? 100
    : ((progress.xp - progress.xpCurrentThreshold) / gradeSpan) * 100;

  const rank = toRankState(progress.tierIndex, percentInGrade);

  // POC : seul le Guerrier reçoit l'artefact forgé. Les autres rangs restent
  // sur le rendu historique (plein cadre) tant qu'ils ne sont pas adaptés.
  if (rank.rank.key === "guerrier") {
    return (
      <ForgedGuerrierArtifact
        progress={progress}
        percent={percentInGrade}
        rankKey={rank.rank.key}
        rankLabel={rank.rank.label}
        totalActions={userStats?.total_actions ?? 0}
      />
    );
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-6 aspect-[4/5] overflow-hidden rounded-[28px] shadow-elevated"
    >
      <RankIllustration
        rankKey={rank.rank.key}
        label={rank.rank.label}
        className="absolute inset-0 h-full w-full"
      />
    </motion.header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Matériau « cuivre forgé » — POC Guerrier.
//
// Valeurs LITTÉRALES (pas dérivées de `rank.colors.*`) : c'est un nouveau
// MATÉRIAU, pas une simple teinte de rang. Candidat à une extraction future
// dans RankTheme (cf. rapport de session) sous la forme d'un profil de
// matériau par rang. Une SEULE source de lumière, en haut de la plaque : tous
// les biseaux/reliefs ci-dessous en découlent (arête claire en haut, creux
// sombre en bas).
// ════════════════════════════════════════════════════════════════════════════
const COPPER = {
  lit: "rgba(255,231,196,0.55)", // arête éclairée (haut) — la source lumineuse
  inlay: "#f0cf99", // cuivre poli des valeurs gravées (inlay)
  grade: "#f7dcae", // inlay le plus clair — nom du grade
  engrave: "rgba(28,14,4,0.62)", // fond des gravures (creux sombre)
  rim: "#6d3c1c", // liseré cuivre des sertissages
} as const;

/** Corps de la plaque : dégradé cuivre + double bloom de lumière (haut). */
const PLATE_SURFACE =
  "radial-gradient(135% 95% at 50% -18%, rgba(255,224,178,0.34), transparent 56%)," +
  "radial-gradient(70% 55% at 76% 8%, rgba(255,208,150,0.16), transparent 60%)," +
  "linear-gradient(158deg, #bd7a41 0%, #a4602f 32%, #834620 66%, #5b2f14 100%)";

/** Arête forgée + épaisseur (ombre portée = poids) + biseau interne. */
const PLATE_SHADOW = [
  "0 26px 58px -22px rgba(0,0,0,0.82)", // poids / élévation
  "0 8px 18px -10px rgba(0,0,0,0.6)",
  `inset 0 2px 1px ${COPPER.lit}`, // arête haute éclairée
  "inset 0 -4px 10px rgba(0,0,0,0.5)", // bas dans l'ombre
  "inset 3px 0 8px -5px rgba(0,0,0,0.32)", // profondeur latérale
  "inset -3px 0 8px -5px rgba(0,0,0,0.42)",
].join(",");

/** Champ intérieur en creux (donne la profondeur / le « cadre forgé »). */
const FIELD_SHADOW = [
  "inset 0 3px 11px -2px rgba(0,0,0,0.72)",
  "inset 0 1px 0 rgba(0,0,0,0.42)",
  "inset 0 -1px 0 rgba(255,220,170,0.12)",
  "0 0 0 1px rgba(0,0,0,0.35)",
].join(",");

interface ForgedProps {
  progress: TitleProgress;
  percent: number;
  rankKey: "guerrier";
  rankLabel: string;
  totalActions: number;
}

/**
 * L'artefact : une plaque de cuivre martelée dans laquelle l'illustration du
 * Guerrier est sertie, et sous laquelle progression + statistiques sont
 * gravées dans le métal.
 */
function ForgedGuerrierArtifact({
  progress,
  percent,
  rankKey,
  rankLabel,
  totalActions,
}: ForgedProps) {
  // Couleurs de RANG (halo / énergie chaude) : elles transitent par RankTheme,
  // jamais réassemblées à la main — seule la MATIÈRE cuivre est littérale.
  const theme = rankThemeByKey(rankKey);
  const nextGrade = nextGradeLabel(progress);
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-6 overflow-hidden rounded-[26px] p-3"
      style={{ background: PLATE_SURFACE, boxShadow: PLATE_SHADOW }}
    >
      {/* Grain martelé du cuivre — même bruit procédural partagé que RankTheme,
          jamais réinventé (mix overlay pour un relief de surface, pas un motif). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[26px]"
        style={{
          backgroundImage: MATERIAL_GRAIN,
          backgroundSize: "130px 130px",
          mixBlendMode: "overlay",
          opacity: 0.42,
        }}
      />

      {/* Respiration TRÈS discrète de la lumière — réutilise le rythme partagé
          `.animate-rank-breathe` (respecte le réglage « Animations » et
          prefers-reduced-motion). Aucune étincelle, aucune particule. */}
      <div
        aria-hidden
        className="animate-rank-breathe pointer-events-none absolute inset-0 rounded-[26px]"
        style={{
          background:
            "radial-gradient(120% 70% at 50% -12%, rgba(255,232,196,0.5), transparent 60%)",
        }}
      />

      {/* Champ intérieur en creux : illustration sertie + gravures. */}
      <div
        className="relative rounded-[20px] p-3"
        style={{ boxShadow: FIELD_SHADOW, background: "rgba(0,0,0,0.12)" }}
      >
        {/* Fenêtre sertie (ratio 4:5 imposé par FORMAT.md) — rim cuivre + creux. */}
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-[14px]"
          style={{
            boxShadow: [
              `inset 0 0 0 2px ${COPPER.rim}`,
              "inset 0 0 0 3px rgba(255,220,170,0.22)",
              "inset 0 5px 14px rgba(0,0,0,0.6)",
            ].join(","),
          }}
        >
          <RankIllustration
            rankKey={rankKey}
            label={rankLabel}
            className="absolute inset-0 h-full w-full"
          />
          {/* Gloss haut : raccorde l'éclairage de l'illustration à la source de
              lumière de la plaque (haut), sans masquer le sujet. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,224,180,0.14) 0%, transparent 26%," +
                "transparent 82%, rgba(0,0,0,0.28) 100%)",
            }}
          />
        </div>

        {/* ── Gravures : grade → barre d'énergie → statistiques ─────────────── */}
        <div className="mt-4 px-1">
          <p
            className="text-center text-[9px] font-semibold uppercase tracking-[0.34em]"
            style={{ color: COPPER.engrave, textShadow: "0 1px 0 rgba(255,224,180,0.16)" }}
          >
            Grade
          </p>
          <p
            className="mt-1 text-center text-[19px] font-black uppercase tracking-[0.14em]"
            style={{
              color: COPPER.grade,
              textShadow: `0 1px 0 rgba(0,0,0,0.55), 0 0 14px ${theme.glow}`,
            }}
          >
            {progress.grade}
          </p>

          {/* Barre gravée dans la plaque puis remplie d'énergie chaude. */}
          <div
            className="relative mt-3 h-3 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={Math.round(clampedPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              background: "linear-gradient(180deg, #3f2312 0%, #5c3319 100%)",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,220,170,0.16)",
            }}
          >
            <div
              className="relative h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${clampedPercent}%`,
                background: theme.gradient,
                // Halo chaud VALIDE (0 0 12px — jamais de blur négatif) + reflet
                // haut / creux bas pour que l'énergie semble coulée dans le sillon.
                boxShadow: `${rankGlowShadow(theme.glow, 0, 0, 12)}, inset 0 1px 0 rgba(255,242,214,0.6), inset 0 -2px 4px rgba(0,0,0,0.4)`,
              }}
            >
              {/* Extrémité incandescente qui respire (métal en fusion). */}
              {clampedPercent > 4 && clampedPercent < 100 && (
                <span
                  aria-hidden
                  className="animate-rank-breathe absolute inset-y-0 right-0 w-6 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 100% 50%, rgba(255,244,214,0.95), transparent 70%)",
                  }}
                />
              )}
            </div>
          </div>

          {/* Message de progression — la raison de revenir aujourd'hui. */}
          <p
            className="mt-2.5 text-center text-[11px] font-semibold"
            style={{ color: "rgba(28,14,4,0.7)" }}
          >
            {progress.isMax || !nextGrade ? (
              <span style={{ color: COPPER.inlay }}>Grade suprême atteint</span>
            ) : (
              <>
                Plus que{" "}
                <span className="font-black" style={{ color: COPPER.inlay }}>
                  {formatXp(progress.xpToNext)} XP
                </span>{" "}
                avant{" "}
                <span
                  className="font-black uppercase tracking-wider"
                  style={{ color: COPPER.inlay }}
                >
                  {nextGrade}
                </span>
              </>
            )}
          </p>

          {/* Statistiques gravées — cartouches en creux, discrètes (niveau 3). */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <EngravedStat label="XP totale" value={`${formatXp(progress.xp)} XP`} />
            <EngravedStat label="Actes accomplis" value={formatXp(totalActions)} />
          </div>
        </div>
      </div>
    </motion.header>
  );
}

/** Cartouche statistique gravé dans le cuivre : label en creux + valeur inlay. */
function EngravedStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.16), rgba(0,0,0,0.3))",
        boxShadow: "inset 0 1px 5px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,220,170,0.12)",
      }}
    >
      <p
        className="text-[8px] font-semibold uppercase tracking-[0.24em]"
        style={{ color: COPPER.engrave, textShadow: "0 1px 0 rgba(255,224,180,0.14)" }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 text-[14px] font-black tabular-nums"
        style={{ color: COPPER.inlay, textShadow: "0 1px 0 rgba(0,0,0,0.5)" }}
      >
        {value}
      </p>
    </div>
  );
}
