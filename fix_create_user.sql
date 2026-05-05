-- ============================================================
-- FIX : Ajouter contrainte unique sur profiles.user_id
-- Puis créer l'utilisateur
-- ============================================================

-- 1. Ajouter la contrainte unique sur profiles.user_id (si manquante)
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

-- 2. Désactiver temporairement le trigger (alternative)
-- ALTER TABLE auth.users DISABLE TRIGGER handle_new_user;

-- 3. Créer l'utilisateur
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_sent_at,
  is_super_admin
) VALUES (
  '685302d8-57d4-41a0-b98d-6601951ad52c',
  'heliossmellcom@gmail.com',
  '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Utilisateur"}',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING
RETURNING id, email, created_at;

-- 4. Vérifier la création
SELECT id, email, created_at FROM auth.users 
WHERE id = '685302d8-57d4-41a0-b98d-6601951ad52c';

-- 5. Vérifier que profiles a été créé aussi (par le trigger)
SELECT * FROM public.profiles 
WHERE user_id = '685302d8-57d4-41a0-b98d-6601951ad52c';

-- ============================================================
-- POUR L'AUTRE UTILISATEUR
-- ============================================================

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
  '71ce9a05-54eb-4a31-865a-271e3ce47aa5',
  'etienne.martin55@gmail.com',
  '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Etienne"}'
)
ON CONFLICT (id) DO NOTHING;
