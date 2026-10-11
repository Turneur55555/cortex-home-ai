import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/** Couverture d'un livre ; visuel de remplacement (titre) quand il n'y a pas d'image. */
export function BookCover({
  src,
  title,
  className,
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-card to-background shadow-card",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={`Couverture de ${title}`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
          <BookOpen className="h-5 w-5 text-primary/70" />
          <span className="line-clamp-4 text-[11px] font-semibold leading-tight text-muted-foreground">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
