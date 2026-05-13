import type { MuscleId } from "@/lib/fitness/muscleMapping";

type Props = {
  getColor: (id: MuscleId) => { fill: string; stroke: string };
  onMuscle?: (id: MuscleId, e: React.MouseEvent) => void;
  onLeave?: () => void;
};

export function FrontView({ getColor, onMuscle, onLeave }: Props) {
  const m = (id: MuscleId, d: string) => {
    const c = getColor(id);
    return (
      <path
        key={id + d.slice(0, 20)}
        d={d}
        data-muscle-id={id}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth="0.8"
        style={{ cursor: "pointer", transition: "all 0.25s ease" }}
        onClick={(e) => onMuscle?.(id, e)}
        onMouseMove={(e) => onMuscle?.(id, e)}
        onMouseLeave={onLeave}
      />
    );
  };

  return (
    <svg viewBox="0 0 130 300" width="100%">
      {/* Silhouette base */}
      <path
        d={`
          M65 8 C56 8 50 14 50 22 C50 30 56 36 65 36 C74 36 80 30 80 22 C80 14 74 8 65 8 Z
          M58 36 Q55 38 52 42 Q48 46 42 50 Q36 54 32 60 Q30 64 30 70 Q30 78 32 86
          Q34 94 34 102 Q34 108 32 116 Q30 124 28 132 Q26 140 26 148
          M72 36 Q75 38 78 42 Q82 46 88 50 Q94 54 98 60 Q100 64 100 70 Q100 78 98 86
          Q96 94 96 102 Q96 108 98 116 Q100 124 102 132 Q104 140 104 148
          M52 42 Q56 44 60 46 Q65 48 70 46 Q74 44 78 42
          M56 82 Q58 88 58 96 Q58 106 56 116 Q54 128 52 140 Q50 152 50 160
          Q50 168 52 176 Q54 184 54 192 Q54 204 52 216 Q50 228 48 240
          Q46 252 44 264 Q42 276 42 288 Q42 294 44 298
          M74 82 Q72 88 72 96 Q72 106 74 116 Q76 128 78 140 Q80 152 80 160
          Q80 168 78 176 Q76 184 76 192 Q76 204 78 216 Q80 228 82 240
          Q84 252 86 264 Q88 276 88 288 Q88 294 86 298
        `}
        fill="#1A202C"
        stroke="#4B5563"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* === MUSCLES === */}

      {/* Trapèzes */}
      {m("trapeze", "M50 40 Q55 38 60 42 Q63 44 65 46 Q67 44 70 42 Q75 38 80 40 Q76 46 72 48 Q68 48 65 48 Q62 48 58 48 Q54 46 50 40 Z")}

      {/* Deltoïde gauche */}
      {m("epaules", "M50 42 Q46 44 42 50 Q38 56 36 62 Q34 66 34 70 Q36 68 38 64 Q40 58 44 54 Q48 50 50 48 Z")}
      {/* Deltoïde droit */}
      {m("epaules", "M80 42 Q84 44 88 50 Q92 56 94 62 Q96 66 96 70 Q94 68 92 64 Q90 58 86 54 Q82 50 80 48 Z")}

      {/* Pectoral gauche */}
      {m("pectoraux", "M52 50 Q56 48 62 50 Q64 52 65 54 Q65 60 65 66 Q65 70 62 72 Q58 74 54 72 Q50 68 48 62 Q46 56 48 52 Q50 50 52 50 Z")}
      {/* Pectoral droit */}
      {m("pectoraux", "M78 50 Q74 48 68 50 Q66 52 65 54 Q65 60 65 66 Q65 70 68 72 Q72 74 76 72 Q80 68 82 62 Q84 56 82 52 Q80 50 78 50 Z")}

      {/* Biceps gauche */}
      {m("biceps", "M34 72 Q32 76 32 82 Q32 90 34 98 Q36 104 36 108 Q38 104 40 98 Q42 90 42 82 Q42 76 40 72 Q38 70 36 70 Q34 70 34 72 Z")}
      {/* Biceps droit */}
      {m("biceps", "M96 72 Q98 76 98 82 Q98 90 96 98 Q94 104 94 108 Q92 104 90 98 Q88 90 88 82 Q88 76 90 72 Q92 70 94 70 Q96 70 96 72 Z")}

      {/* Avant-bras gauche */}
      {m("avant-bras", "M34 110 Q32 116 30 124 Q28 134 28 142 Q28 148 30 148 Q32 148 34 142 Q36 134 38 124 Q40 116 40 110 Q38 108 36 108 Q34 108 34 110 Z")}
      {/* Avant-bras droit */}
      {m("avant-bras", "M96 110 Q98 116 100 124 Q102 134 102 142 Q102 148 100 148 Q98 148 96 142 Q94 134 92 124 Q90 116 90 110 Q92 108 94 108 Q96 108 96 110 Z")}

      {/* Abdominaux — 6 sections */}
      {m("abdos", "M58 74 Q62 72 65 72 Q65 80 65 82 Q62 82 58 82 Q56 78 58 74 Z")}
      {m("abdos", "M72 74 Q68 72 65 72 Q65 80 65 82 Q68 82 72 82 Q74 78 72 74 Z")}
      {m("abdos", "M57 84 Q62 82 65 82 Q65 92 65 94 Q62 94 57 94 Q55 90 57 84 Z")}
      {m("abdos", "M73 84 Q68 82 65 82 Q65 92 65 94 Q68 94 73 94 Q75 90 73 84 Z")}
      {m("abdos", "M56 96 Q62 94 65 94 Q65 104 65 108 Q62 110 56 108 Q54 102 56 96 Z")}
      {m("abdos", "M74 96 Q68 94 65 94 Q65 104 65 108 Q68 110 74 108 Q76 102 74 96 Z")}

      {/* Oblique gauche */}
      {m("obliques", "M48 64 Q50 68 52 74 Q54 82 54 92 Q54 102 52 112 Q50 108 48 100 Q46 90 46 80 Q46 72 48 64 Z")}
      {/* Oblique droit */}
      {m("obliques", "M82 64 Q80 68 78 74 Q76 82 76 92 Q76 102 78 112 Q80 108 82 100 Q84 90 84 80 Q84 72 82 64 Z")}

      {/* Quadriceps gauche */}
      {m("quadriceps", "M52 160 Q50 168 50 180 Q50 196 48 212 Q46 228 46 240 Q48 240 50 238 Q54 230 56 220 Q58 210 60 196 Q62 182 62 170 Q62 162 60 156 Q56 154 52 160 Z")}
      {/* Quadriceps droit */}
      {m("quadriceps", "M78 160 Q80 168 80 180 Q80 196 82 212 Q84 228 84 240 Q82 240 80 238 Q76 230 74 220 Q72 210 70 196 Q68 182 68 170 Q68 162 70 156 Q74 154 78 160 Z")}

      {/* Mollet gauche */}
      {m("mollets", "M46 252 Q44 260 44 270 Q44 280 46 290 Q48 296 50 294 Q52 288 52 278 Q52 268 50 258 Q48 252 46 252 Z")}
      {/* Mollet droit */}
      {m("mollets", "M84 252 Q86 260 86 270 Q86 280 84 290 Q82 296 80 294 Q78 288 78 278 Q78 268 80 258 Q82 252 84 252 Z")}
    </svg>
  );
}
