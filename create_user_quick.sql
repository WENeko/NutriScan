-- ============================================================
-- CRÉATION RAPIDE DE L'UTILISATEUR DANS AUTH.USERS
-- À exécuter dans Supabase SQL Editor de votre BDD perso
-- ============================================================

-- REMPLACEZ CES VALEURS :
-- :user_id → L'UUID de l'utilisateur (depuis les logs ou public.profiles)
-- :email → L'email de l'utilisateur

-- Exemple avec les valeurs de votre screenshot :
-- user_id: '685302d8-57d4-41a0-b98d-6601951ad52c'
-- email: 'heliossmellcom@gmail.com'

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
  '685302d8-57d4-41a0-b98d-6601951ad52c',  -- ← REMPLACEZ PAR VOTRE USER_ID
  'heliossmellcom@gmail.com',                -- ← REMPLACEZ PAR VOTRE EMAIL
  '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12', -- hash temporaire
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

-- ============================================================
-- VÉRIFICATION
-- ============================================================

-- Vérifiez que l'utilisateur a été créé :
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE id = '685302d8-57d4-41a0-b98d-6601951ad52c';  -- ← REMPLACEZ PAR VOTRE USER_ID

-- ============================================================
-- POUR L'AUTRE UTILISATEUR (si besoin)
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
  '71ce9a05-54eb-4a31-865a-271e3ce47aa5',  -- ← 2ème user_id
  'etienne.martin55@gmail.com',            -- ← 2ème email
  '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Etienne"}'
)
ON CONFLICT (id) DO NOTHING;
