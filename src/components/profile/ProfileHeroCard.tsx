import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Award, Dumbbell, Camera, Flame, Layers, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { xpForLevel, RARITY_TEXT, RARITY_LABELS, type BadgeRarity } from "@/lib/fitness/badges";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { cn } from "@/lib/utils";
import type { RankAggregate } from "@/components/fitness/RankAggregator";

interface Props {
  pseudo: string;
  streak: number;
  level: number;
  xp: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
  rankAggregate: RankAggregate;
  totalWorkouts: number;
  bestPR: { name: string; weight: number } | null;
  rarestAchievement: { title: string; rarity: BadgeRarity } | null;
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

function StatPill({
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
    <div className="flex min-w-[92px] shrink-0 items-center gap-1.5 rounded-xl bg-black/25 px-2.5 py-2 ring-1 ring-white/10 backdrop-blur-sm">
      <span className={cn("shrink-0", accentClass ?? "text-white/70")}>{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-black leading-tight text-white">{value}</div>
        <div className="truncate text-[8.5px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </div>
      </div>
    </div>
  );
}

/**
 * Fiche de personnage — pièce maîtresse de Profil. Reprend le langage
 * atmosphérique "Reliquary" (rankVisuals) pour le rang le plus élevé obtenu
 * par l'utilisateur, sans dupliquer le moteur : `rankAggregate` est fourni
 * par `RankAggregator`, qui ne fait qu'observer `useExerciseProgression`.
 *
 * Refonte : niveau/XP affichés une seule fois, pas de crayon permanent
 * (édition du pseudo au tap uniquement), et une bande de statistiques
 * élargie (rang global + meilleur rang, séances totales, record personnel,
 * succès le plus rare) plutôt que la grille à 4 cases précédente qui ne
 * laissait pas de place à tout ça.
 */
export function ProfileHeroCard({
  pseudo,
  streak,
  level,
  xp,
  avatarUrl,
  onEdit,
  onAvatarChange,
  rankAggregate,
  totalWorkouts,
  bestPR,
  rarestAchievement,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initial = pseudo[0]?.toUpperCase() ?? "?";

  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = Math.max(0, xp - currentLevelXp);
  const xpForNext = Math.max(1, nextLevelXp - currentLevelXp);
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100));

  const bestRank = rankAggregate.best?.rank ?? null;
  const rankKey = bestRank?.rank.key ?? "mortel";
  const visual = getRankVisual(rankKey);
  const colors = bestRank?.rank.colors ?? {
    primary: "#78716c",
    secondary: "#a8a29e",
    glow: "rgba(120,113,108,0.35)",
    text: "#f5f5f4",
    gradient: "linear-gradient(90deg,#57534e 0%,#a8a29e 100%)",
  };

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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative mb-6 overflow-hidden rounded-[28px] p-5 shadow-elevated"
      style={{
        background: visual.atmosphere,
        boxShadow: `inset 0 0 0 1px ${visual.vignette}, 0 12px 44px -20px ${colors.glow}`,
      }}
    >
      <RankAmbientParticles rankKey={rankKey} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 60% at 50% 100%, rgba(0,0,0,0.5) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <motion.div
            className="absolute inset-[-4px] rounded-[24px] blur-[3px]"
            style={{ background: colors.gradient, opacity: 0.75 }}
            animate={{ opacity: [0.55, 0.85, 0.55] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[20px] border border-white/20 bg-black/40 shadow-lg"
            aria-label="Changer l'avatar"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={pseudo} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">{initial}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
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
            <span className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-black/60 text-[10px] text-white">
              …
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            className="block max-w-full text-left"
            aria-label="Modifier le pseudo"
          >
            <h1 className="truncate text-2xl font-bold tracking-tight text-white">{pseudo}</h1>
          </button>
          <p
            className="mt-0.5 truncate font-serif text-[13px] italic tracking-wide"
            style={{ color: colors.secondary }}
          >
            {bestRank ? bestRank.fullName : "Pas encore classé"}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11px] font-bold text-white/85">Niveau {level}</span>
            <span className="text-[10px] tabular-nums text-white/50">
              {xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP
            </span>
          </div>
          <div className="mt-1.5">
            <MasteryBar percent={pct} colors={colors} segments={5} height={8} />
          </div>
        </div>
      </div>

      <div className="relative mt-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
        <StatPill
          icon={<Trophy className="h-3.5 w-3.5" />}
          value={
            rankAggregate.average
              ? `${rankAggregate.average.rank.label} ${rankAggregate.average.romanLevel}`
              : "—"
          }
          label="Rang global"
        />
        <StatPill
          icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
          value={`${streak}j`}
          label="Série"
          accentClass="text-orange-400"
        />
        <StatPill
          icon={<Layers className="h-3.5 w-3.5" />}
          value={`${totalWorkouts}`}
          label="Séances"
        />
        {bestPR && (
          <StatPill
            icon={<Dumbbell className="h-3.5 w-3.5" />}
            value={`${bestPR.weight} kg`}
            label={bestPR.name}
          />
        )}
        {rarestAchievement && (
          <StatPill
            icon={<Award className="h-3.5 w-3.5" />}
            value={RARITY_LABELS[rarestAchievement.rarity]}
            label={rarestAchievement.title}
            accentClass={RARITY_TEXT[rarestAchievement.rarity]}
          />
        )}
      </div>
    </motion.header>
  );
}
