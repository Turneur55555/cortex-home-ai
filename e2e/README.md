# Tests E2E (Playwright)

Tests de bout en bout couvrant les parcours critiques d'ICORTEX.

## Deux familles de specs

| Spec | Backend | Exécutée en CI ? |
|---|---|---|
| `05-offline-sync.spec.ts` | **simulé** (`supabase-stub.ts`) | ✅ oui — `quality.yml`, job `e2e-offline` |
| `01-auth.spec.ts` | Supabase **réel** | ❌ non |
| `02-navigation.spec.ts` | Supabase **réel** | ❌ non |
| `04-signout.spec.ts` | Supabase **réel** | ❌ non |
| `auth-persistence.spec.ts` | Supabase **réel** | ❌ non |

### Pourquoi les specs « backend réel » ne tournent pas en CI

L'application est épinglée sur **un seul** projet Supabase, celui de production
(`src/config/supabase-project.ts` : les variables `VITE_SUPABASE_*` sont
ignorées si elles pointent ailleurs, et `supabase-project-ref.yml` interdit
toute autre référence). Il n'existe donc **aucun projet Supabase de test**.

Ces specs appellent `signUp` / `signIn` : les brancher sur la CI créerait de
vrais comptes et de vraies lignes dans la base de production à chaque PR. Elles
restent lançables à la main (voir ci-dessous), en connaissance de cause.

**Pour les intégrer un jour à la CI**, il faut une décision produit préalable :
provisionner un second projet Supabase (staging), autorisé explicitement par
`src/config/supabase-project.ts` et `scripts/check-supabase-project.mjs`, avec
ses propres migrations et secrets. C'est un chantier d'infrastructure, hors du
périmètre « qualité/CI ».

### Ce que couvre — et ne couvre pas — la spec offline

`05-offline-sync.spec.ts` intercepte toutes les requêtes sortantes
(`supabase-stub.ts`) : rien ne sort vers la production, et toute requête non
prévue est bloquée puis remontée comme un échec. Elle valide le **client** :
routage authentifié, création offline, mise en file IndexedDB, déclenchement
réel de la synchronisation au retour réseau, forme de l'upsert poussé.

Elle ne valide **rien côté serveur** (RLS, contraintes SQL, triggers,
PostgREST/GoTrue réels) : cette couverture reste celle de `rls-tests.yml` et
des tests d'intégration env-gated (`src/lib/security/rls.test.ts`,
`src/lib/nutrition/nutritionMealCheck.test.ts`).

## Lancer

```bash
# 1. Installer les navigateurs (une fois)
npx playwright install chromium

# 2. La spec offline seule (aucun backend requis)
npx playwright test e2e/05-offline-sync.spec.ts

# 3. Toutes les specs — ⚠️ écrit dans la base de PRODUCTION
npx playwright test

# Mode UI interactif
npx playwright test --ui
```

Le serveur de dev démarre automatiquement (`webServer` de `playwright.config.ts`,
`npm run dev`) ; un serveur déjà lancé est réutilisé.

## Variables d'environnement

- `E2E_EMAIL` / `E2E_PASSWORD` : utiliser un compte existant au lieu d'en créer
  un (specs « backend réel » uniquement).
- `E2E_BASE_URL` : tester contre une URL déjà servie plutôt que
  `localhost:8080` (désactive le démarrage automatique du serveur).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE` : chemin d'un Chromium déjà installé, pour
  les environnements qui en fournissent un hors du cache Playwright.

Les tests ciblent les éléments via `data-testid` ou leur rôle/libellé
accessible, pour être robustes aux changements visuels.
