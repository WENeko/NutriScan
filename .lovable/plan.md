## Diagnostic

Le blocage actuel n'est pas un bug du code mais une limite d'architecture :

- Le token d'authentification émis par **Lovable Supabase** est signé avec le secret JWT de Lovable.
- Sur ta **BDD perso**, ce token est invalide → `auth.uid()` renvoie `NULL` → toutes les policies RLS `auth.uid() = user_id` rejettent l'insert.
- Résultat : `personalSupabase.from('meals').insert(...)` échoue silencieusement, donc seule la BDD Lovable reçoit le repas.

Côté code, tout est déjà câblé (`mealPersistenceService`, `databaseSyncService`, client `personalSupabase`, secrets `VITE_PERSONAL_*` présents dans `.env`). Il manque la couche serveur côté BDD perso.

## Stratégie retenue

Utiliser des **edge functions service-role** sur la BDD perso pour contourner RLS, en validant l'identité côté serveur via le JWT Lovable (introspection) + un secret partagé. Le code client garde le même contrat (dual-write) mais passe par `fetch` vers les functions perso au lieu de `from().insert()` direct.

## Plan d'exécution

### 1. BDD perso — schéma & RLS (SQL Editor)

Exécuter un script unique consolidé qui :

- Vérifie / ajoute toutes les colonnes attendues dans `meals`, `meal_items`, `profiles`, `body_composition`, `sleep_logs`, `water_logs`, `custom_foods`, `recipe_ingredients` (aligné sur le schéma Lovable listé plus haut).
- (Re)crée les **policies RLS** propres :
  - `auth.uid() = user_id` pour SELECT/INSERT/UPDATE/DELETE sur les tables user-scoped.
  - Sous-requête EXISTS pour `meal_items` / `recipe_ingredients`.
- Garde la **FK `meals.user_id → auth.users(id)`** active : on créera l'utilisateur via edge function.
- Active RLS partout.
- Crée le trigger `handle_new_user` → insertion auto dans `profiles`.

### 2. BDD perso — Edge functions (déploiement manuel)

Trois functions à déployer **dans le projet Supabase perso** (pas Lovable) avec `verify_jwt = false` :

| Function | Rôle |
|---|---|
| `create-user-in-personal-db` | Crée l'utilisateur dans `auth.users` perso avec l'UUID Lovable. Idempotent. |
| `save-meal` | Insert `meals` + `meal_items` en bypass RLS (service_role). |
| `sync-record` (générique) | Upsert pour `body_composition`, `water_logs`, `sleep_logs`, `profiles`, `custom_foods`. |

Chaque function :
- Lit `Authorization: Bearer <jwt Lovable>` + `x-shared-secret`.
- Valide le secret partagé (env var `LOVABLE_BRIDGE_SECRET`) pour empêcher tout appel anonyme.
- Décode le JWT pour extraire `sub` → `userId` ; vérifie qu'il matche le payload.
- Utilise `SUPABASE_SERVICE_ROLE_KEY` (perso) pour insérer.

### 3. Secrets

- Côté **BDD perso** : `LOVABLE_BRIDGE_SECRET` (à générer, ~32 chars random).
- Côté **Lovable** (ce projet) : même valeur dans `VITE_PERSONAL_BRIDGE_SECRET` (ajouté au `.env` via secrets — exposé client, donc utilisé seulement comme bouclier basique contre les scans automatiques ; la vraie défense reste la validation du JWT).

### 4. Code client (ce projet)

Réécriture de `src/services/mealPersistenceService.ts` :

```text
saveMealWithDualWrite(meal, items, userId)
  ├── 1. Insert Lovable (chemin actuel, inchangé)        ← source de vérité
  └── 2. fetch(PERSO/functions/v1/save-meal)
         headers: Authorization Bearer <session.access_token>
                  x-shared-secret <bridge_secret>
         body:    { userId, meal, items }
         → log succès/échec, ne casse jamais le flux principal
```

Idem pour :
- `ensureUserInPersonalDb` → reste, mais appelle la nouvelle function.
- `databaseSyncService` → utilise `sync-record` pour profil/poids/eau/sommeil.

Suppression des appels directs `personalSupabase.from(...).insert(...)` qui sont voués à échouer à cause de RLS. Le client `personalSupabase` est conservé uniquement pour les **lectures** publiques éventuelles (ou supprimé).

### 5. Observabilité

- Logs structurés `[DualWrite]` dans `appLogger` (succès/échec + statut HTTP).
- Bannière debug en dev : badge "Perso ✓/✗" sur la page meal après save.
- Bouton "Tester la connexion BDD perso" dans `DataSourcesSettings` qui ping `save-meal` avec un payload dryRun.

### 6. Migration des données existantes (optionnel)

Script Node `scripts/backfill-perso.js` qui :
- Lit tous les meals Lovable de l'utilisateur courant.
- Les rejoue via l'edge function `save-meal` perso.
- Idempotent (skip si un meal avec même `id` existe déjà).

## Détails techniques

**Pourquoi pas l'auth Supabase parallèle ?** Connecter l'utilisateur aux deux projets Supabase obligerait à dupliquer le mot de passe, gérer deux sessions, deux refresh tokens, deux flows OAuth Google. Beaucoup plus de surface de bug pour le même résultat.

**Pourquoi le secret partagé même si JWT validé ?** Le JWT Lovable n'est pas vérifiable cryptographiquement côté perso (clé publique non partagée). On le décode pour extraire `sub` mais on ne peut pas garantir son authenticité → le shared-secret côté serveur (env var, jamais exposé) ferme le trou. À terme, exposer la JWKS Lovable permettrait une vraie vérif.

**Variables d'env à fournir sur perso** :
```
LOVABLE_BRIDGE_SECRET=<32 chars>
SUPABASE_URL=<auto>
SUPABASE_SERVICE_ROLE_KEY=<auto>
```

## Livrables après approbation

1. `supabase-perso/migrations/SETUP_PERSO_COMPLET.sql` (à exécuter dans SQL Editor perso).
2. `supabase-perso/functions/create-user-in-personal-db/index.ts`
3. `supabase-perso/functions/save-meal/index.ts`
4. `supabase-perso/functions/sync-record/index.ts`
5. `README_PERSO_SETUP.md` — étapes pas-à-pas (créer secret, déployer functions via CLI Supabase, exécuter SQL, ajouter `VITE_PERSONAL_BRIDGE_SECRET`).
6. Refacto `mealPersistenceService.ts` + `databaseSyncService.ts` côté Lovable.
7. Bouton de test dans `DataSourcesSettings.tsx`.

## Hors scope

- Synchronisation bidirectionnelle (perso → Lovable).
- Résolution de conflits si éditions simultanées.
- Auth parallèle native sur la BDD perso.
