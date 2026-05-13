import type { MuscleId } from "@/lib/fitness/muscleMapping";

type Props = {
  getColor: (id: MuscleId) => { fill: string; stroke: string };
  onMuscle?: (id: MuscleId, e: React.MouseEvent) => void;
  onLeave?: () => void;
};

export function BackView({ getColor, onMuscle, onLeave }: Props) {
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

      {/* Trapèzes — large forme en losange haut du dos */}
      {m("trapeze", "M50 40 Q54 36 58 38 Q62 40 65 44 Q68 40 72 38 Q76 36 80 40 Q78 46 74 50 Q70 52 65 54 Q60 52 56 50 Q52 46 50 40 Z")}

      {/* Deltoïde postérieur gauche */}
      {m("epaules", "M50 42 Q46 44 42 50 Q38 56 36 62 Q34 68 36 70 Q38 66 42 60 Q46 54 50 48 Z")}
      {/* Deltoïde postérieur droit */}
      {m("epaules", "M80 42 Q84 44 88 50 Q92 56 94 62 Q96 68 94 70 Q92 66 88 60 Q84 54 80 48 Z")}

      {/* Grand dorsal gauche */}
      {m("dos", "M52 54 Q56 52 60 54 Q64 56 65 60 Q65 72 65 82 Q65 90 62 96 Q58 100 54 98 Q50 94 48 86 Q46 78 46 70 Q46 62 48 56 Q50 54 52 54 Z")}
      {/* Grand dorsal droit */}
      {m("dos", "M78 54 Q74 52 70 54 Q66 56 65 60 Q65 72 65 82 Q65 90 68 96 Q72 100 76 98 Q80 94 82 86 Q84 78 84 70 Q84 62 82 56 Q80 54 78 54 Z")}

      {/* Triceps gauche */}
      {m("triceps", "M34 72 Q32 78 32 86 Q32 94 34 100 Q36 106 36 108 Q38 104 40 98 Q42 90 42 82 Q42 76 40 72 Q38 70 36 70 Q34 70 34 72 Z")}
      {/* Triceps droit */}
      {m("triceps", "M96 72 Q98 78 98 86 Q98 94 96 100 Q94 106 94 108 Q92 104 90 98 Q88 90 88 82 Q88 76 90 72 Q92 70 94 70 Q96 70 96 72 Z")}

      {/* Avant-bras postérieur gauche */}
      {m("avant-bras", "M34 110 Q32 118 30 126 Q28 136 28 144 Q28 148 30 148 Q32 146 34 140 Q36 132 38 122 Q40 114 40 110 Q38 108 36 108 Q34 108 34 110 Z")}
      {/* Avant-bras postérieur droit */}
      {m("avant-bras", "M96 110 Q98 118 100 126 Q102 136 102 144 Q102 148 100 148 Q98 146 96 140 Q94 132 92 122 Q90 114 90 110 Q92 108 94 108 Q96 108 96 110 Z")}

      {/* Lombaires / Érecteurs */}
      {m("lombaires", "M56 100 Q60 96 65 96 Q70 96 74 100 Q76 108 76 118 Q76 128 74 136 Q70 140 65 140 Q60 140 56 136 Q54 128 54 118 Q54 108 56 100 Z")}

      {/* Fessier gauche */}
      {m("fessiers", "M52 140 Q56 136 60 140 Q64 144 65 150 Q65 158 62 164 Q58 168 54 166 Q50 162 48 156 Q46 150 48 144 Q50 140 52 140 Z")}
      {/* Fessier droit */}
      {m("fessiers", "M78 140 Q74 136 70 140 Q66 144 65 150 Q65 158 68 164 Q72 168 76 166 Q80 162 82 156 Q84 150 82 144 Q80 140 78 140 Z")}

      {/* Ischio-jambier gauche */}
      {m("ischio", "M52 168 Q50 176 50 188 Q50 200 48 214 Q46 228 46 240 Q48 240 50 236 Q54 226 56 214 Q58 200 60 188 Q62 176 62 168 Q58 164 54 166 Q52 166 52 168 Z")}
      {/* Ischio-jambier droit */}
      {m("ischio", "M78 168 Q80 176 80 188 Q80 200 82 214 Q84 228 84 240 Q82 240 80 236 Q76 226 74 214 Q72 200 70 188 Q68 176 68 168 Q72 164 76 166 Q78 166 78 168 Z")}

      {/* Mollet gauche */}
      {m("mollets", "M46 252 Q44 260 44 272 Q44 282 46 292 Q48 296 50 294 Q52 288 52 278 Q52 266 50 256 Q48 252 46 252 Z")}
      {/* Mollet droit */}
      {m("mollets", "M84 252 Q86 260 86 272 Q86 282 84 292 Q82 296 80 294 Q78 288 78 278 Q78 266 80 256 Q82 252 84 252 Z")}
    </svg>
  );
}
