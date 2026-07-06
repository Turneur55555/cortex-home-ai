import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Flame, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { xpForLevel } from "@/lib/fitness/badges";
import { MasteryBar } from "@/components/fitness/MasteryBar";

interface Props {
  pseudo: string;
  streak: number;
  level: number;
  xp: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
}

// Palette dédiée au Hero Header — cohérente avec l'identité RPG (Reliquary)
// sans en reprendre l'habillage complet (réservé à la Salle des trophées).
const HERO_COLORS = {
  primary: "#6c63ff",
  secondary: "#4dafff",
  glow: "rgba(108,99,255,0.45)",
  text: "#ffffff",
  gradient: "linear-gradient(90deg,#6c63ff 0%,#4dafff 100%)",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Bonsoir";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
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

export function ProfileHeroCard({ pseudo, streak, level, xp, avatarUrl, onEdit, onAvatarChange }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initial = pseudo[0]?.toUpperCase() ?? "?";

  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = Math.max(0, xp - currentLevelXp);
  const xpForNext = Math.max(1, nextLevelXp - currentLevelXp);
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100));

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

      // Nettoyage : supprime les anciens avatars (fire-and-forget)
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
      className="relative mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent p-5 shadow-elevated backdrop-blur-xl"
    >
      {/* Halos ambiants — pièce maîtresse de l'écran */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(108,99,255,0.4), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(77,175,255,0.22), transparent 70%)" }}
      />

      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            className="absolute inset-[-3px] rounded-[22px] opacity-70 blur-[2px]"
            style={{ background: HERO_COLORS.gradient }}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-[20px] border border-white/20 bg-background shadow-lg"
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
          {/* Plaque de niveau — écho discret du médaillon RPG, sans dupliquer son habillage complet */}
          <span
            className="absolute -bottom-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background px-1 text-[10px] font-black text-white shadow-md"
            style={{ background: HERO_COLORS.gradient }}
          >
            {level}
          </span>
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
            <span className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-black/60 text-[10px] text-white">…</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{greeting()}</p>
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-2xl font-bold tracking-tight">{pseudo}</h1>
            <button type="button" onClick={onEdit} className="rounded-full p-1 text-muted-foreground hover:bg-white/10" aria-label="Modifier le pseudo">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs font-semibold" style={{ color: HERO_COLORS.secondary }}>
              Niveau {level}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {xpIntoLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP
            </span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold">
              <Flame className="h-3 w-3 text-orange-400" />
              {streak}j
            </span>
          </div>

          <div className="mt-2">
            <MasteryBar percent={pct} colors={HERO_COLORS} segments={5} height={8} />
          </div>

          {user?.created_at && (
            <p className="mt-3 text-[10px] text-muted-foreground/60">
              Membre depuis {new Date(user.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </p>
          )}
        </div>
      </div>
    </motion.header>
  );
}
