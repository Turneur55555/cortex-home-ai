import { useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Dumbbell, Maximize2, Play, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import type { ExerciseMediaItem } from "@/hooks/useExerciseCatalogEntry";

// ============================================================
// Hero média de la fiche exercice V2 — le média est l'élément principal de
// la page (photo/GIF/vidéo du dataset + éventuelle photo utilisateur en
// repli), pas une zone décorative. GIF en lecture automatique, vidéo en
// lecture automatique muette (contrôles au tap), plein écran swipeable.
// ============================================================

function mediaTypeOrder(type: ExerciseMediaItem["type"]): number {
  return type === "image" ? 0 : type === "gif" ? 1 : 2;
}

/** Trie primaire d'abord, puis photo → GIF → vidéo. */
function sortMedia(items: ExerciseMediaItem[]): ExerciseMediaItem[] {
  return [...items].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return mediaTypeOrder(a.type) - mediaTypeOrder(b.type);
  });
}

function MediaFrame({
  item,
  className,
  autoPlayVideo = false,
}: {
  item: ExerciseMediaItem;
  className: string;
  autoPlayVideo?: boolean;
}) {
  if (item.type === "video") {
    return (
      <video
        src={item.url}
        className={className}
        autoPlay={autoPlayVideo}
        muted
        loop
        playsInline
        controls={!autoPlayVideo}
      />
    );
  }
  // <img> anime nativement les GIF — pas de logique de lecture séparée.
  return <img src={item.url} alt="" className={className} loading="lazy" />;
}

export function ExerciseMediaSection({
  exerciseName,
  media,
  fallbackImageUrl,
  badges,
}: {
  exerciseName: string;
  media: ExerciseMediaItem[];
  /** Photo utilisateur — utilisée seulement si aucun média catalogue n'existe. */
  fallbackImageUrl?: string | null;
  badges?: React.ReactNode;
}) {
  const items = useMemo(() => sortMedia(media), [media]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const hasCatalogMedia = items.length > 0;
  const active = hasCatalogMedia ? items[Math.min(activeIndex, items.length - 1)] : null;

  if (!hasCatalogMedia && !fallbackImageUrl) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-surface/60 text-muted-foreground">
        <Dumbbell className="h-8 w-8" />
        <span className="text-[11px]">Aucun média disponible pour le moment</span>
        {badges && <div className="mt-1 flex flex-wrap justify-center gap-1.5 px-4">{badges}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/5"
        aria-label="Voir en plein écran"
      >
        {active ? (
          <MediaFrame item={active} className="max-h-72 w-full object-contain" autoPlayVideo />
        ) : (
          <img
            src={fallbackImageUrl ?? undefined}
            alt={exerciseName}
            className="max-h-72 w-full object-contain"
            loading="lazy"
          />
        )}
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
        {active?.type === "video" && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Play className="h-3 w-3 fill-current" /> Vidéo
          </span>
        )}
        {badges && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-3">
            {badges}
          </div>
        )}
      </button>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 transition-all ${
                i === activeIndex ? "ring-primary" : "ring-transparent opacity-70"
              }`}
            >
              <MediaFrame item={item} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <MediaLightbox
          items={hasCatalogMedia ? items : []}
          fallbackImageUrl={fallbackImageUrl}
          exerciseName={exerciseName}
          initialIndex={activeIndex}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Grille "Médias" (onglet dédié) — regroupe Photos / GIF / Vidéos par
// type, chaque miniature ouvre le même plein écran swipeable que le Hero.
// Masquée entièrement par l'appelant quand `media` est vide (aucune donnée
// inventée).
// ============================================================

const MEDIA_GROUP_LABEL: Record<ExerciseMediaItem["type"], string> = {
  image: "Photos",
  gif: "GIF",
  video: "Vidéos",
};

export function ExerciseMediaGrid({
  exerciseName,
  media,
}: {
  exerciseName: string;
  media: ExerciseMediaItem[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const items = useMemo(() => sortMedia(media), [media]);

  if (items.length === 0) return null;

  const groups: Array<[ExerciseMediaItem["type"], ExerciseMediaItem[]]> = (
    ["image", "gif", "video"] as const
  )
    .map(
      (type) =>
        [type, items.filter((m) => m.type === type)] as [
          ExerciseMediaItem["type"],
          ExerciseMediaItem[],
        ],
    )
    .filter(([, list]) => list.length > 0);

  return (
    <div className="space-y-4">
      {groups.map(([type, list]) => (
        <div key={type}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {MEDIA_GROUP_LABEL[type]} ({list.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightboxIndex(items.indexOf(item))}
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-white/10"
              >
                <MediaFrame item={item} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {lightboxIndex != null && (
        <MediaLightbox
          items={items}
          exerciseName={exerciseName}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function MediaLightbox({
  items,
  fallbackImageUrl,
  exerciseName,
  initialIndex,
  onClose,
}: {
  items: ExerciseMediaItem[];
  fallbackImageUrl?: string | null;
  exerciseName: string;
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const hasGallery = items.length > 0;
  const current = hasGallery ? items[index] : null;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!hasGallery) return;
    if (info.offset.x < -80 && index < items.length - 1) setIndex((i) => i + 1);
    else if (info.offset.x > 80 && index > 0) setIndex((i) => i - 1);
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-black/95"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between p-3">
          <span className="text-xs font-medium text-white/70">
            {hasGallery ? `${index + 1} / ${items.length}` : exerciseName}
          </span>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <motion.div
          className="flex flex-1 items-center justify-center overflow-hidden px-4"
          drag={hasGallery && items.length > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.id ?? "fallback"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex max-h-full w-full items-center justify-center"
            >
              {current ? (
                <MediaFrame
                  item={current}
                  className="max-h-[80vh] w-full object-contain"
                  autoPlayVideo
                />
              ) : (
                <img
                  src={fallbackImageUrl ?? undefined}
                  alt={exerciseName}
                  className="max-h-[80vh] w-full object-contain"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
        {current?.attribution && (
          <p className="p-3 text-center text-[10px] text-white/40">{current.attribution}</p>
        )}
      </div>
    </Portal>
  );
}
