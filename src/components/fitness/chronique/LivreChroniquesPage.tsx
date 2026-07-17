// ============================================================
// LOT C2 — « Le Livre des Chroniques », page plein écran.
//
// Troisième pilier de CORTEX (avec l'Arène et La Forge) : le musée vivant
// de toute la carrière de l'athlète. Ouvert par la Hero Card
// LivreChroniquesCard — vraie navigation (early-return dans SeancesTab,
// même système qu'ActiveWorkoutView), aucun modal, aucun drawer.
//
// Sections : Hall of Fame → Légendes → Techniques oubliées → Potentiel
// caché → Spécialisations → Galerie des Records → Chronologie (les cartes
// de séances existantes, chacune ouvrant la Chronique immersive du C1).
//
// Contraintes : lecture seule — toutes les valeurs viennent de
// lib/fitness/chronicles.ts (dérivations pures sur l'historique déjà
// chargé). Quand une donnée n'existe pas, la carte est masquée, jamais
// inventée. Aucun moteur/hook/mutation modifié.
// ============================================================

import { useEffect, useMemo, useRef } from "react";
import { motion, useInView, animate } from "framer-motion";
import {
  Award,
  BookOpen,
  ChevronLeft,
  Clock,
  Crown,
  Dumbbell,
  Flame,
  Heart,
  History,
  Layers,
  Medal,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { GenericHistoryCard } from "@/components/fitness/session/GenericHistoryCard";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { formatTonnage } from "@/lib/fitness/strength";
import {
  computeHallOfFame,
  computeLegends,
  computeForgotten,
  computePlateaus,
  computeSpecializations,
  computeBadges,
  type LegendLevel,
} from "@/lib/fitness/chronicles";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine, type DisciplineId } from "@/lib/fitness/engines/types";

// ── Compteur animé ────────────────────────────────────────────────────────────
// Micro-interaction demandée par le lot : les grands chiffres comptent
// jusqu'à leur valeur à l'entrée dans le viewport (une seule fois, GPU-light).

function AnimatedNumber({
  value,
  format: fmt,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt ? fmt(v) : `${Math.round(v)}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, fmt]);
  return (
    <span ref={ref} className={className}>
      {fmt ? fmt(0) : "0"}
    </span>
  );
}

// ── Briques visuelles ─────────────────────────────────────────────────────────

function SectionTitle({
  icon,
  children,
  hint,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">{icon}</span>
        <h2 className="font-serif text-[17px] font-semibold italic text-white/90">{children}</h2>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function GoldCard({
  children,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-3xl border border-white/[0.07] shadow-card backdrop-blur-xl " +
        className
      }
      style={{
        background:
          "radial-gradient(120% 90% at 20% 0%, rgba(234,179,8,0.08) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        ...(glow ? { boxShadow: "0 0 40px -12px rgba(234,179,8,0.35)" } : {}),
      }}
    >
      {children}
    </div>
  );
}

const LEVEL_STYLE: Record<LegendLevel, string> = {
  Légendaire: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  Maîtrisé: "bg-primary/15 text-primary border-primary/30",
  Confirmé: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25",
  "En apprentissage": "bg-white/[0.06] text-white/60 border-white/10",
};

function StarsRow({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={
            "h-3.5 w-3.5 " +
            (i < stars ? "fill-amber-400 text-amber-400" : "fill-transparent text-white/20")
          }
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LivreChroniquesPage({
  workouts,
  prByName,
  histByName,
  volByName,
  prByGym,
  histByGym,
  imageUrls,
  latestDate,
  onRepeatLive,
  onOpenFromTemplate,
  onSaveAsTemplate,
  onOpenChronicle,
  onBack,
}: {
  workouts: WorkoutRow[];
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByGym: Map<string, Map<string, number>>;
  histByGym: Map<string, Map<string, Array<{ date: string; weight: number }>>>;
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
  onRepeatLive: (w: WorkoutRow) => void;
  onOpenFromTemplate: (w: WorkoutRow) => void;
  onSaveAsTemplate: (w: WorkoutRow) => void;
  onOpenChronicle: (w: WorkoutRow) => void;
  onBack: () => void;
}) {
  const { data: bodyWeightKg } = useLatestBodyWeight();

  const hof = useMemo(
    () => computeHallOfFame(workouts, bodyWeightKg ?? null),
    [workouts, bodyWeightKg],
  );
  const legends = useMemo(() => computeLegends(workouts), [workouts]);
  const forgotten = useMemo(() => computeForgotten(workouts), [workouts]);
  const plateaus = useMemo(() => computePlateaus(workouts), [workouts]);
  const specializations = useMemo(() => computeSpecializations(workouts), [workouts]);
  const badges = useMemo(() => computeBadges(workouts), [workouts]);

  const dateOf = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: fr });

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-6 pb-4"
    >
      {/* ── Barre de retour ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-1 flex items-center gap-3 bg-background/70 px-1 py-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-2 pl-2.5 pr-4 text-sm font-semibold text-white/90 transition-all active:scale-95 hover:bg-white/[0.1]"
          aria-label="Retour aux Séances"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>
        <span className="truncate font-serif text-[13px] font-semibold italic text-white/60">
          Le Livre des Chroniques
        </span>
      </div>

      {/* ── En-tête du Livre ───────────────────────────────────────────── */}
      <SectionReveal>
        <div
          className="relative overflow-hidden rounded-[26px] border border-white/[0.08] p-6 shadow-elevated"
          style={{
            background: `
              radial-gradient(120% 80% at 50% 0%, rgba(234,179,8,0.18) 0%, transparent 55%),
              linear-gradient(180deg,#171004 0%,#070502 100%)`,
          }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-6"
            style={{
              background:
                "radial-gradient(55% 70% at 50% 40%, rgba(234,179,8,0.14) 0%, transparent 70%)",
            }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative">
            <p
              className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "#fcd34d" }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Le Livre des Chroniques
            </p>
            <h1 className="mt-2 font-serif text-[30px] font-semibold italic leading-tight tracking-wide text-white">
              Toute ton histoire d'athlète.
            </h1>

            {/* Compteurs carrière animés */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
                <AnimatedNumber
                  value={hof.career.sessions}
                  className="text-xl font-bold tabular-nums text-white"
                />
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                  Séances
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
                <AnimatedNumber
                  value={hof.career.tonnage}
                  format={(n) => formatTonnage(Math.round(n))}
                  className="text-xl font-bold tabular-nums text-white"
                />
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                  Soulevés
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
                <AnimatedNumber
                  value={hof.career.prCount}
                  className="text-xl font-bold tabular-nums text-amber-300"
                />
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                  Records
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionReveal>

      {/* ── 3. HALL OF FAME ────────────────────────────────────────────── */}
      {(hof.bestTonnage || hof.heaviestSet || hof.longestSet || hof.longestSession) && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Crown className="h-4 w-4" />} hint="Tes records absolus.">
              Hall of Fame
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {/* Pièce maîtresse — pleine largeur, glow */}
              {hof.bestTonnage && (
                <GoldCard glow>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-8 top-0 h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(234,179,8,0.7), transparent)",
                    }}
                  />
                  <div className="relative flex items-center gap-4 p-5">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        background: "linear-gradient(140deg,#78350f 0%,#eab308 50%,#451a03 100%)",
                        boxShadow: "0 6px 24px -8px rgba(234,179,8,0.7)",
                      }}
                    >
                      <Trophy className="h-6 w-6 text-white drop-shadow" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                        Plus gros tonnage
                      </p>
                      <AnimatedNumber
                        value={hof.bestTonnage.value}
                        format={(n) => formatTonnage(Math.round(n))}
                        className="mt-0.5 block font-serif text-[30px] font-semibold italic leading-none text-white"
                      />
                      <p className="mt-1 truncate text-[11px] text-white/50">
                        Record absolu · {hof.bestTonnage.workoutName} ·{" "}
                        {dateOf(hof.bestTonnage.date)}
                      </p>
                    </div>
                  </div>
                </GoldCard>
              )}

              <div className="grid grid-cols-2 gap-3">
                {hof.bestCalories && (
                  <GoldCard>
                    <div className="p-4">
                      <Medal className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Plus grosse séance
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.bestCalories.value} />{" "}
                        <span className="text-[11px] font-medium text-white/50">kcal</span>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/40">
                        {dateOf(hof.bestCalories.date)}
                      </p>
                    </div>
                  </GoldCard>
                )}
                {hof.bestIntensity && (
                  <GoldCard>
                    <div className="p-4">
                      <Zap className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Plus haute intensité
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.bestIntensity.value} />{" "}
                        <span className="text-[11px] font-medium text-white/50">kg/min</span>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/40">
                        {dateOf(hof.bestIntensity.date)}
                      </p>
                    </div>
                  </GoldCard>
                )}
                {hof.heaviestSet && (
                  <GoldCard>
                    <div className="p-4">
                      <Flame className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Série la plus lourde
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white/80">
                        {hof.heaviestSet.exercise}
                      </p>
                      <p className="text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.heaviestSet.weight} />{" "}
                        <span className="text-[11px] font-medium text-white/50">kg</span>
                      </p>
                    </div>
                  </GoldCard>
                )}
                {hof.longestSet && (
                  <GoldCard>
                    <div className="p-4">
                      <Crown className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Plus longue série
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white/80">
                        {hof.longestSet.exercise}
                      </p>
                      <p className="text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.longestSet.reps} />{" "}
                        <span className="text-[11px] font-medium text-white/50">reps</span>
                      </p>
                    </div>
                  </GoldCard>
                )}
                {hof.longestSession && (
                  <GoldCard>
                    <div className="p-4">
                      <Clock className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Plus longue séance
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.longestSession.minutes} />{" "}
                        <span className="text-[11px] font-medium text-white/50">min</span>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/40">
                        {dateOf(hof.longestSession.date)}
                      </p>
                    </div>
                  </GoldCard>
                )}
                {hof.career.series > 0 && (
                  <GoldCard>
                    <div className="p-4">
                      <Layers className="h-4 w-4 text-amber-300" />
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Séries au total
                      </p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                        <AnimatedNumber value={hof.career.series} />
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/40">Toute carrière</p>
                    </div>
                  </GoldCard>
                )}
              </div>
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 4. LES LÉGENDES ────────────────────────────────────────────── */}
      {legends.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle
              icon={<Trophy className="h-4 w-4" />}
              hint="Tes exercices les plus construits."
            >
              Les Légendes
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {legends.map((l, rank) => {
                const imgUrl =
                  (l.imagePath ? imageUrls?.get(l.imagePath) : null) ??
                  exerciseIllustration(l.name);
                return (
                  <GoldCard key={l.key} glow={rank === 0}>
                    <div className="flex items-center gap-4 p-4">
                      {imgUrl ? (
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-amber-400/20">
                          <img
                            src={imgUrl}
                            alt={l.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/15 to-amber-400/5 text-amber-300/70">
                          <Dumbbell className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tabular-nums text-amber-300/80">
                            #{rank + 1}
                          </span>
                          <h3 className="truncate text-sm font-bold text-white/90">{l.name}</h3>
                        </div>
                        <span
                          className={
                            "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            LEVEL_STYLE[l.level]
                          }
                        >
                          {l.level}
                        </span>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/60">
                          <span className="font-semibold text-white/85">PR {l.pr} kg</span>
                          {l.progressionPct != null && l.progressionPct !== 0 && (
                            <span
                              className={
                                l.progressionPct > 0 ? "text-emerald-400" : "text-white/50"
                              }
                            >
                              {l.progressionPct > 0 ? "+" : ""}
                              {l.progressionPct} %
                            </span>
                          )}
                          <span>
                            {l.sessions} séance{l.sessions > 1 ? "s" : ""}
                          </span>
                          <span className="text-white/40">{dateOf(l.lastUsed)}</span>
                        </p>
                      </div>
                    </div>
                  </GoldCard>
                );
              })}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 5. TECHNIQUES OUBLIÉES ─────────────────────────────────────── */}
      {forgotten.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle
              icon={<History className="h-4 w-4" />}
              hint="Des exercices que tu maîtrisais disparaissent de tes séances."
            >
              Techniques oubliées
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {forgotten.map((f) => (
                <GoldCard key={f.key} className="border-orange-400/15">
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate text-sm font-bold text-white/90">{f.name}</h3>
                      <span className="shrink-0 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-orange-300">
                        {f.daysSince} jours
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">
                      Dernière utilisation : {dateOf(f.lastUsed)} · {f.sessions} séances jouées
                    </p>
                    {f.impact.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-orange-200/80">
                        Impact : {f.impact.join(", ").toLowerCase()} moins stimulé
                        {f.impact.length > 1 ? "s" : ""}.
                      </p>
                    )}
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <Sparkles className="h-3 w-3" />
                      Suggestion : le réintroduire à ta prochaine séance.
                    </p>
                  </div>
                </GoldCard>
              ))}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 6. LE POTENTIEL CACHÉ ──────────────────────────────────────── */}
      {plateaus.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Des exercices encore joués, mais qui ne progressent plus."
            >
              Le potentiel caché
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {plateaus.map((p) => (
                <GoldCard key={p.key} className="border-cyan-400/15">
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate text-sm font-bold text-white/90">{p.name}</h3>
                      <span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-300">
                        Plateau · {p.weeksSinceImprovement} sem.
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">
                      {p.stalledSessions} séances sans dépasser le PR de {p.pr} kg.
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <Sparkles className="h-3 w-3" />
                      Suggestion : varier les reps ou baisser la charge pour relancer.
                    </p>
                  </div>
                </GoldCard>
              ))}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 7. SPÉCIALISATIONS ─────────────────────────────────────────── */}
      {specializations.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle
              icon={<Award className="h-4 w-4" />}
              hint="Là où ton volume de travail parle pour toi."
            >
              Spécialisations
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {specializations.map((s) => (
                <GoldCard key={s.id}>
                  <div className="p-4">
                    <h3 className="font-serif text-[15px] font-semibold italic text-white/90">
                      {s.title}
                    </h3>
                    <div className="mt-1.5">
                      <StarsRow stars={s.stars} />
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/40">
                      {formatTonnage(s.volume)} · {s.sets} séries
                    </p>
                  </div>
                </GoldCard>
              ))}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 8. GALERIE DES RECORDS ─────────────────────────────────────── */}
      {badges.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle
              icon={<Medal className="h-4 w-4" />}
              hint="Les jalons déjà gravés dans le Livre."
            >
              Galerie des Records
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {badges.map((b, i) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  <GoldCard>
                    <div className="flex items-center gap-3 p-4">
                      <span className="text-2xl leading-none drop-shadow">{b.emoji}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white/90">{b.label}</p>
                        <p className="truncate text-[10px] text-white/45">{b.detail}</p>
                      </div>
                    </div>
                  </GoldCard>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── 9. CHRONOLOGIE ─────────────────────────────────────────────── */}
      <SectionReveal>
        <div>
          <SectionTitle
            icon={<Heart className="h-4 w-4" />}
            hint="Chaque séance ouvre sa Chronique immersive."
          >
            Chronologie
          </SectionTitle>
          {workouts.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-muted-foreground">
              Le Livre est encore vierge — lance-toi, ta première légende t'attend.
            </p>
          ) : (
            <ul className="space-y-3">
              {workouts.map((w) => {
                // Même routage que l'ancien accordéon : musculation garde
                // WorkoutCard, toute autre discipline route vers la carte
                // générique — décision prise une seule fois ici.
                const entry = ENGINE_REGISTRY[(w.discipline as DisciplineId | null) ?? "muscu"];
                const isStrength =
                  !entry ||
                  !isReadyEngine(entry) ||
                  entry.historyPresentation.cardVariant === "strength";
                if (!isStrength) {
                  return <GenericHistoryCard key={w.id} workout={w} />;
                }
                return (
                  <WorkoutCard
                    key={w.id}
                    w={w}
                    prByName={prByName}
                    histByName={histByName}
                    volByName={volByName}
                    prByGym={prByGym}
                    histByGym={histByGym}
                    imageUrls={imageUrls}
                    latestDate={latestDate}
                    onRepeatLive={onRepeatLive}
                    onOpenFromTemplate={onOpenFromTemplate}
                    onSaveAsTemplate={onSaveAsTemplate}
                    onOpenChronicle={onOpenChronicle}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </SectionReveal>
    </motion.section>
  );
}
