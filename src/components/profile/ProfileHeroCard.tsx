import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Flame, Layers, Medal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { Blason } from "@/components/rpg/Blason";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import {
  RANK_TIERS,
  LEVELS_PER_RANK,
  TOTAL_TIERS,
  type RankState,
} from "@/lib/fitness/exerciseRanks";
import { toRankState } from "@/hooks/useExerciseProgression";
import { useUserStats } from "@/hooks/useUserStats";
import { characterLevelProgress } from "@/lib/fitness/rpg/characterLevel";
import { SERIF, EASE_OUT, stagger } from "@/components/rpg/premium/tokens";
import type { RankAggregate } from "@/components/fitness/RankAggregator";

interface Props {
  pseudo: string;
  streak: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
  rankAggregate: RankAggregate;
  totalWorkouts: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
}

async function compressAvatar(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Lecture du fichier échouée"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Image invalide ou format non supporté"));
    i.src = dataUrl;
  });
  const MAX = 512;
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((res, rej) => {
    canvas.toBlob(
      (blob) => (blob ? res(blob) : rej(new Error("Compression échouée"))),
      "image/jpeg",
      0.85,
    );
  });
}

function StatTile({
  icon,
  value,
  label,
  accentClass,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accentClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-black/25 px-2 py-2.5 text-center ring-1 ring-white/10 backdrop-blur-sm">
      <span className={accentClass ?? "text-white/70"}>{icon}</span>
      <div className="w-full truncate text-[13px] font-black leading-tight text-white">{value}</div>
      <div className="w-full truncate text-[8.5px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </div>
    </div>
  );
}

/**
 * Fiche de Personnage — pièce maîtresse de CORTEX (Accueil).
 *
 * P1 « signature premium » : le RANG est le héros. Le blason (Blason) est mis
 * en scène au centre, le nom de rang (« TITAN ») domine, et la progression est
 * cadrée VERS LE PROCHAIN RANG. Le Niveau/XP n'est plus le chiffre-roi : il
 * devient une pastille subordonnée — le moteur qui mène au rang, jamais son
 * remplaçant. Le joueur doit dire « je suis Titan », pas « je suis niveau 42 ».
 *
 * Aucune logique métier ici : `rankAggregate` vient de RankAggregator (qui
 * observe le moteur de rang), `userStats` de useUserStats. Réutilise le
 * langage graphique partagé (Blason, tokens premium) destiné à toute l'app.
 */
export function ProfileHeroCard({
  pseudo,
  streak,
  avatarUrl,
  onEdit,
  onAvatarChange,
  rankAggregate,
  totalWorkouts,
  achievementsUnlocked,
  achievementsTotal,
}: Props) {
  const { user } = useAuth();
  const { data: userStats } = useUserStats();
  const levelInfo = characterLevelProgress(userStats?.xp ?? 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initial = pseudo[0]?.toUpperCase() ?? "?";

  const ranked = rankAggregate.best?.rank ?? null;
  // Rang affiché : le meilleur obtenu, sinon Mortel I en repli (mis en sourdine).
  const rank: RankState = ranked ?? toRankState(0, 0);
  const colors = rank.rank.colors;
  const visual = getRankVisual(rank.rank.key);

  // Cadrage « vers le prochain rang » : palier suivant + seuil de la prochaine
  // FAMILLE de rang (le vrai saut de prestige : Titan → Olympien…).
  const nextTier = rank.tierIndex < TOTAL_TIERS - 1 ? toRankState(rank.tierIndex + 1, 0) : null;
  const familyIdx = Math.floor(rank.tierIndex / LEVELS_PER_RANK);
  const nextFamilyStart = (familyIdx + 1) * LEVELS_PER_RANK;
  const nextFamily = nextFamilyStart < TOTAL_TIERS ? RANK_TIERS[familyIdx + 1] : null;
  const tiersToNextFamily = nextFamily ? nextFamilyStart - rank.tierIndex : 0;

  const handleFile = async (file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 10 Mo)");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressAvatar(file);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await onAvatarChange(data.publicUrl);

      void supabase.storage
        .from("avatars")
        .list(user.id)
        .then(({ data: files }) => {
          const old = (files ?? [])
            .filter((f) => `${user.id}/${f.name}` !== path)
            .map((f) => `${user.id}/${f.name}`);
          if (old.length) void supabase.storage.from("avatars").remove(old);
        });

      toast.success("Avatar mis à jour");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur upload";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative mb-6 overflow-hidden rounded-[28px] px-5 pb-5 pt-4 shadow-elevated"
      style={{
        background: visual.atmosphere,
        boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 16px 50px -22px ${colors.glow}`,
      }}
    >
      <RankAmbientParticles rankKey={rank.rank.key} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(130% 70% at 50% 100%, rgba(0,0,0,0.58) 0%, transparent 72%)",
        }}
      />

      {/* ── Ligne d'identité (subordonnée) : avatar + pseudo · Niveau ──────── */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-black/40 shadow-lg"
              aria-label="Changer l'avatar"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={pseudo} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-white">{initial}</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-[10px] text-white">
                …
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="min-w-0 text-left"
            aria-label="Modifier le pseudo"
          >
            <p className="truncate text-sm font-bold tracking-tight text-white">{pseudo}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/40">
              Athlète
            </p>
          </button>
        </div>

        {/* Niveau — subordonné : le moteur, pas l'identité. */}
        <div className="shrink-0 rounded-xl bg-black/30 px-2.5 py-1.5 text-center ring-1 ring-white/10 backdrop-blur-sm">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Niveau
          </div>
          <div className="text-base font-black leading-none text-white">{levelInfo.level}</div>
        </div>
      </div>

      {/* ── Scène du RANG (le héros) ──────────────────────────────────────── */}
      <div className="relative mt-3 flex flex-col items-center text-center">
        <Blason rank={rank} size={150} variant="hero" revealDelay={0.1} />

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: ranked ? 1 : 0.65, y: 0 }}
          transition={{ duration: 0.6, delay: stagger(1), ease: EASE_OUT }}
          className="mt-3 text-[34px] font-black uppercase leading-none tracking-[0.12em]"
          style={{
            fontFamily: SERIF,
            color: colors.text,
            textShadow: `0 0 26px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.6)`,
          }}
        >
          {rank.rank.label}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: stagger(2), ease: EASE_OUT }}
          className="mt-1.5 flex items-center gap-2"
        >
          <span className="h-px w-6" style={{ background: `${colors.secondary}66` }} />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: colors.secondary }}
          >
            {ranked ? `Rang ${rank.romanLevel}` : "Non classé"}
          </span>
          <span className="h-px w-6" style={{ background: `${colors.secondary}66` }} />
        </motion.div>
      </div>

      {/* ── Progression VERS LE PROCHAIN RANG ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: stagger(3), ease: EASE_OUT }}
        className="relative mt-5"
      >
        <div className="mb-1.5 flex items-end justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">
            {ranked ? "Progression" : "Ton ascension commence"}
          </span>
          <span className="text-[11px] font-bold" style={{ color: colors.secondary }}>
            {rank.isMax ? "Rang suprême" : nextTier ? `vers ${nextTier.fullName}` : ""}
          </span>
        </div>
        <MasteryBar
          percent={(ranked ? rank.progress : 0) * 100}
          colors={colors}
          segments={5}
          height={10}
          showLabel={false}
        />
        {!rank.isMax && nextFamily && tiersToNextFamily > 1 && (
          <p className="mt-1.5 text-center text-[10px] text-white/45">
            Encore {tiersToNextFamily} paliers avant le seuil de{" "}
            <span
              className="font-semibold uppercase tracking-wider"
              style={{ color: colors.secondary }}
            >
              {nextFamily.label}
            </span>
          </p>
        )}
        {!ranked && (
          <p className="mt-1.5 text-center text-[10px] text-white/45">
            Enregistre ta première séance pour forger ton rang.
          </p>
        )}
      </motion.div>

      {/* ── Statistiques (subordonnées) ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: stagger(4), ease: EASE_OUT }}
        className="relative mt-4 grid grid-cols-3 gap-1.5"
      >
        <StatTile
          icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
          value={`${streak}j`}
          label="Série"
          accentClass="text-orange-400"
        />
        <StatTile
          icon={<Layers className="h-3.5 w-3.5 text-white/70" />}
          value={`${totalWorkouts}`}
          label="Séances"
        />
        <StatTile
          icon={<Medal className="h-3.5 w-3.5 text-amber-400" />}
          value={`${achievementsUnlocked}/${achievementsTotal}`}
          label="Succès"
          accentClass="text-amber-400"
        />
      </motion.div>
    </motion.header>
  );
}
