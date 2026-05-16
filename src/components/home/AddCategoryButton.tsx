import { Plus } from "lucide-react";

interface AddCategoryButtonProps {
  onClick: () => void;
}

export function AddCategoryButton({ onClick }: AddCategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ajouter une catégorie"
      className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary shadow-glow transition-all duration-200 active:scale-90 hover:scale-105"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <Plus className="h-6 w-6 text-primary-foreground" />
    </button>
  );
}
