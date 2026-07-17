import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Flame, Layers, Medal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MasteryBar } from "@/components/fitness/MasteryBar";
import { RankAmbientParticles } from "@/components/fitness/RankAmbientParticles";
import { getRankVisual } from "@/lib/fitness/rankVisuals";
import { useUserStats } from "@/hooks/useUserStats";
import { characterLevelProgress } from "@/lib/fitness/rpg/characterLevel";
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
 * Fiche de personnage — pièce maîtresse de Profil. Reprend le langage
 * atmosphérique "Reliquary" (rankVisuals) pour le rang le plus élevé obtenu
 * par l'utilisateur, sans dupliquer le moteur : `rankAggregate` est fourni
 * par `RankAggregator`, qui ne fait qu'observer `useExerciseProgression`.
 *
 * Refonte finale (06/07/2026) : le Rang global (meilleur rang obtenu)
 * n'apparaît QU'ICI dans tout le Profil — sous forme de sous-titre, jamais
 * dupliqué en pastille. Plus de "Niveau X / XP" (système de niveau compte
 * séparé, source de la confusion "le niveau apparaît plusieurs fois") : la
 * seule barre de progression du Hero est celle du rang affiché au-dessus.
 * La ligne de statistiques est une grille fixe (jamais de scroll horizontal,
 * jamais de statistique coupée) de 3 informations qui ne redisent jamais le
 * rang : série, séances, succès débloqués.
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="block min-w-0 flex-1 text-left"
              aria-label="Modifier le pseudo"
            >
              <h1 className="truncate text-2xl font-bold tracking-tight text-white">{pseudo}</h1>
            </button>
            <span className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-black text-white ring-1 ring-white/15">
              Niv. {levelInfo.level}
            </span>
          </div>
          <p
            className="mt-0.5 truncate font-serif text-[13px] italic tracking-wide"
            style={{ color: colors.secondary }}
          >
            {bestRank ? bestRank.fullName : "Pas encore classé"}
          </p>

          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-white/45">
              <span>Niveau de personnage</span>
              <span>
                {levelInfo.xpIntoLevel} / {levelInfo.xpForLevelSpan} XP
              </span>
            </div>
            <MasteryBar
              percent={levelInfo.progress * 100}
              colors={colors}
              segments={5}
              height={8}
              showLabel={false}
            />
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-1.5">
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
      </div>
    </motion.header>
  );
}
