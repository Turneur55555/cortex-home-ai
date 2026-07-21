import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  pseudo: string;
  avatarUrl?: string | null;
  onEdit: () => void;
  onAvatarChange: (url: string) => Promise<void>;
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

/**
 * Bloc identité (avatar + pseudo) rendu AU-DESSUS de la ProfileHeroCard,
 * en dehors de la carte. Aligné à gauche pour matcher le bord de la carte.
 */
export function ProfileIdentityStrip({ pseudo, avatarUrl, onEdit, onAvatarChange }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const initial = pseudo[0]?.toUpperCase() ?? "?";

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
    <div className="mb-3 flex items-center gap-3">
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
        <p className="truncate text-base font-bold tracking-tight text-white">{pseudo}</p>
      </button>
    </div>
  );
}
