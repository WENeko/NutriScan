# Déploiement de l'Edge Function

## Méthode 1 : Depuis votre terminal local (RECOMMANDÉE)

```bash
# 1. Allez à la racine du projet
cd /Users/heliossmell/Library/CloudStorage/OneDrive-Personnel/NutriScan/calorie-capture-clever

# 2. Connectez-vous à Supabase
supabase login

# 3. Déployez la fonction sur votre BDD perso
supabase functions deploy create-user-in-personal-db --project-ref gvrrkyjhoxkdxomtyvpr

# 4. Définissez le secret SERVICE_ROLE_KEY
# Récupérez la clé dans Supabase Dashboard → Project Settings → API → service_role key
supabase secrets set --project-ref gvrrkyjhoxkdxomtyvpr SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Méthode 2 : Si vous n'avez pas Supabase CLI

### Option A : Utiliser npx (sans installation)
```bash
cd /Users/heliossmell/Library/CloudStorage/OneDrive-Personnel/NutriScan/calorie-capture-clever
npx supabase login
npx supabase functions deploy create-user-in-personal-db --project-ref gvrrkyjhoxkdxomtyvpr
```

### Option B : Utiliser l'API REST directement
Si le déploiement ne fonctionne pas, vous pouvez créer la fonction via l'API Supabase Management API, mais c'est plus complexe.

## Méthode 3 : Créer l'utilisateur manuellement (test rapide)

Si l'edge function pose problème, créez l'utilisateur directement dans SQL :

```sql
-- Dans Supabase SQL Editor de votre BDD perso
-- Remplacez par votre vrai user_id et email

INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  'VOTRE_USER_ID_ICI',
  'votre-email@example.com',
  '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12', -- hash dummy
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"source":"lovable"}'
)
ON CONFLICT (id) DO NOTHING;
```

## Vérification

Après déploiement, vérifiez que la fonction est accessible :
```bash
curl -X POST \
  https://gvrrkyjhoxkdxomtyvpr.supabase.co/functions/v1/create-user-in-personal-db \
  -H "Authorization: Bearer VOTRE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","email":"test@test.com"}'
```
