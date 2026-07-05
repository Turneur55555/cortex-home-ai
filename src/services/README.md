# Services Layer — Pattern Convention

The `src/services/` directory owns **all direct Supabase calls** for a given
domain. Hooks under `src/hooks/` consume services and add React Query
caching, optimistic updates, and component-friendly ergonomics.

## Rule

| Layer | Imports `supabase` directly? | React-aware? | Purpose |
| --- | --- | --- | --- |
| `services/{domain}.ts` | ✅ Yes | ❌ No (pure functions) | I/O + validation |
| `hooks/use{Domain}.ts`  | ❌ No (uses service)   | ✅ Yes (React Query) | State, cache, mutations |
| `components/`           | ❌ No                  | ✅ Yes               | Render only |

## Example

```ts
// src/services/profile.ts — pure async functions, framework-free
export async function fetchProfile(userId: string) { ... }
export async function upsertDisplayName(userId: string, name: string) { ... }
```

```ts
// src/hooks/useProfile.ts — wraps the service with React Query
import { fetchProfile, upsertDisplayName } from "@/services/profile";
export function useProfile(fallback: string) {
  const { data } = useQuery({ queryFn: () => fetchProfile(uid) });
  ...
}
```

## Why

- **Testable**: services can be unit-tested without React/RTL.
- **Reusable**: services can be called from server functions, Edge functions, scripts.
- **Single source of truth**: schema typing + business validation lives in one place.

## Existing services

- `homeCategories.ts`, `homeSubcategories.ts` — Maison module
- `foodSuggestion.ts` — type partagé FoodSuggestion (catalogue USDA/Supabase, aucune API OFF)
- `profile.ts` — user profile

Hooks that still call `supabase` directly (to migrate when touched):
`use-fitness`, `use-pantry`, `use-stocks`, `useGoals`, `useStreak`,
`useUserActivity`, `useUserBadges`, `useUserStats`, `useUserPreferences`,
`useBadgeSystem`, `useImageUpload`, `useFoodSearch`,
`useRecoveryMap`, `use-documents`, `use-user-pdfs`.
