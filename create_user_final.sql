-- ============================================================
-- CRÉATION FINALE DE L'UTILISATEUR
-- La contrainte unique existe déjà, on crée juste le user
-- ============================================================

-- Utilisateur 1
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_sent_at
) VALUES (
  '685302d8-57d4-41a0-b98d-6601951ad52c',
  'heliossmellcom@gmail.com',
  '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Utilisateur"}',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Utilisateur 2
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

-- ============================================================
-- VÉRIFICATION
-- ============================================================

SELECT id, email, created_at 
FROM auth.users 
WHERE id IN ('685302d8-57d4-41a0-b98d-6601951ad52c', '71ce9a05-54eb-4a31-865a-271e3ce47aa5');

-- Vérifier que les profils ont été créés automatiquement
SELECT * FROM public.profiles 
WHERE user_id IN ('685302d8-57d4-41a0-b98d-6601951ad52c', '71ce9a05-54eb-4a31-865a-271e3ce47aa5');
