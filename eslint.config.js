import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Bloquer les console.log en production (seul console.error toléré)
      "no-console": ["warn", { allow: ["error"] }],
      // Bloquer les any explicites
      "@typescript-eslint/no-explicit-any": "warn",
      // Bloquer les variables non utilisées (avec exception pour _prefix)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],
    },
  },
  eslintPluginPrettier,
  {
    // Fichiers générés automatiquement (Supabase CLI, Lovable) : jamais
    // repassés par un formatter, donc en désaccord permanent avec Prettier
    // sans que ça reflète un problème de qualité. On coupe uniquement
    // prettier/prettier ici — toutes les vraies règles de qualité
    // (no-explicit-any, no-unused-vars, no-console, etc.) restent actives
    // et remonteraient normalement si ces fichiers en contenaient.
    files: ["src/integrations/supabase/types.ts", "src/integrations/lovable/index.ts"],
    rules: {
      "prettier/prettier": "off",
    },
  },
  {
    // Edge functions Deno (supabase/functions/**) : hors du projet
    // TypeScript principal (voir tsconfig.json → "include"), formatées par
    // `deno fmt` selon une convention différente de la config Prettier du
    // front. Même traitement : seul prettier/prettier est coupé, les
    // vraies règles de qualité restent actives sur ces fichiers.
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "prettier/prettier": "off",
    },
  },
);
