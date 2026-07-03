export function PdfSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-4 py-3">
      <div className="h-9 w-9 shrink-0 rounded-xl bg-white/[0.07]" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/5 rounded bg-white/[0.07]" />
        <div className="h-2.5 w-2/5 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}
