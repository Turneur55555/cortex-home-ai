import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Flame, Pencil, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  pseudo: string;
  email?: string;
  streak: number;
  level: number;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => void;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Bonsoir";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

export function ProfileHeader({ pseudo, email, streak, level, avatarUrl, onEdit, onAvatarChange }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initial = pseudo[0]?.toUpperCase() ?? "?";

  const handleFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onAvatarChange(data.publicUrl);
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
      className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent p-5 backdrop-blur-xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(108,99,255,0.35), transparent 70%)" }}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-lg"
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
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-[10px] text-white">…</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{greeting()}</p>
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-xl font-bold tracking-tight">{pseudo}</h1>
            <button type="button" onClick={onEdit} className="rounded-full p-1 text-muted-foreground hover:bg-white/10" aria-label="Modifier le pseudo">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          {email && <p className="truncate text-[11px] text-muted-foreground">{email}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold">
              <Trophy className="h-3 w-3 text-amber-400" />
              Niveau {level}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold">
              <Flame className="h-3 w-3 text-orange-400" />
              {streak}j
            </span>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
