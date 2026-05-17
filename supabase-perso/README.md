# Setup BDD perso — bridge de double sauvegarde

Ce dossier contient tout ce qu'il faut déployer **sur ton projet Supabase personnel** (`gvrrkyjhoxkdxomtyvpr`) pour que la double sauvegarde fonctionne.

## Pourquoi un bridge ?

Le JWT émis par Lovable Supabase est signé avec un secret **différent** de ta BDD perso. Donc, sur la BDD perso, `auth.uid()` renvoie toujours `NULL` quand le client envoie ce token → toutes les policies RLS (`auth.uid() = user_id`) rejettent les inserts.

On contourne ça avec **3 edge functions service-role** qui :
1. Valident un secret partagé (anti-spam).
2. Décodent le JWT Lovable pour extraire le `sub` (userId) et vérifier qu'il matche le payload.
3. Insèrent en bypass RLS (service_role).

---

## Étape 1 — Schéma & policies

Dans ta **BDD perso** → SQL Editor → coller intégralement le contenu de `SETUP_PERSO_COMPLET.sql` → Run.

C'est idempotent, tu peux le rejouer.

## Étape 2 — Secret partagé

Génère un secret aléatoire (min. 32 chars). Exemple :

```bash
openssl rand -hex 32
```

## Étape 3 — Déployer les 3 edge functions

Depuis le dossier `supabase-perso/` :

```bash
# Login sur ton projet perso (PAS Lovable)
supabase login
supabase link --project-ref gvrrkyjhoxkdxomtyvpr

# Ajouter le secret côté serveur
supabase secrets set LOVABLE_BRIDGE_SECRET=<le_secret_généré>

# Déployer les 3 functions (verify_jwt désactivé — on valide en code)
supabase functions deploy create-user-in-personal-db --no-verify-jwt
supabase functions deploy save-meal --no-verify-jwt
supabase functions deploy sync-record --no-verify-jwt
```

## Étape 4 — Configurer le client Lovable

Dans **ce projet Lovable**, ouvre `.env` et ajoute (les autres VITE_PERSONAL_* sont déjà présents) :

```
VITE_PERSONAL_BRIDGE_SECRET="<le_même_secret>"
```

Redéploie le preview (les variables `VITE_*` sont injectées au build).

## Étape 5 — Tester

1. Va dans **Profil → Sources de Données**.
2. Tu verras une carte "Double sauvegarde — BDD perso" avec un bouton **Tester la connexion**.
3. Si tout est vert, sauve un repas. Il doit apparaître dans les deux BDD :

```sql
-- Sur la BDD perso
select id, meal_name, total_calories, timestamp
from meals
order by created_at desc limit 5;

select count(*) from meal_items
where meal_id in (select id from meals order by created_at desc limit 5);
```

---

## Architecture

```text
┌──────────────┐    fetch + JWT + x-shared-secret    ┌─────────────────────┐
│  Browser     │ ───────────────────────────────────▶│  perso/save-meal    │
│  (Lovable)   │                                     │  perso/sync-record  │
└──────┬───────┘                                     │  perso/create-user… │
       │                                             └──────────┬──────────┘
       │ supabase-js                                            │ service_role
       ▼                                                        ▼
┌──────────────┐                                     ┌─────────────────────┐
│  BDD Lovable │  ◀── source de vérité               │  BDD perso          │
└──────────────┘                                     │  (RLS bypass)       │
                                                     └─────────────────────┘
```

Si le bridge perso échoue, la sauvegarde principale (Lovable) reste effective — la double écriture est **best-effort**, jamais bloquante.

## Sécurité

- Le `LOVABLE_BRIDGE_SECRET` côté serveur est **obligatoire** : sans header `x-shared-secret` valide, toutes les requêtes sont rejetées (403).
- Le secret est aussi exposé côté client (`VITE_*`) — c'est donc un bouclier basique. La défense réelle vient de la validation du JWT : on extrait `sub` et on vérifie qu'il matche le `userId` du payload. Un attaquant ne peut pas écrire dans la BDD d'un autre utilisateur sans un JWT valide pour ce user.
- Les functions sont déployées avec `--no-verify-jwt` parce qu'on valide le JWT nous-mêmes (pour pouvoir accepter un JWT signé par Lovable, pas par la BDD perso).

## Fichiers

- `SETUP_PERSO_COMPLET.sql` — schéma + RLS + triggers
- `functions/create-user-in-personal-db/index.ts` — créer un user dans `auth.users` perso
- `functions/save-meal/index.ts` — insert meal + meal_items (atomique avec rollback)
- `functions/sync-record/index.ts` — upsert générique pour profiles, body_composition, water_logs, sleep_logs, custom_foods
