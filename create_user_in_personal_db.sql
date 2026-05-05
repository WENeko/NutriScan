-- ============================================================
-- CRÉER L'UTILISATEUR DANS auth.users DE LA BDD PERSO
-- Nécessaire pour que RLS fonctionne (auth.uid() doit retourner l'UUID)
-- ============================================================

-- ============================================================
-- ÉTAPE 1 : VÉRIFIER SI L'UTILISATEUR EXISTE
-- ============================================================

-- Remplacez 'VOTRE_USER_ID' par l'UUID de l'utilisateur depuis les logs
-- Exemple: '685302d8-57d4-41a0-b98d-6601951ad52c'

SELECT 
  id, 
  email, 
  email_confirmed_at,
  created_at
FROM auth.users 
WHERE id = 'VOTRE_USER_ID';

-- Si aucun résultat, l'utilisateur n'existe pas et doit être créé

-- ============================================================
-- ÉTAPE 2 : CRÉER L'UTILISATEUR (Méthode SQL - nécessite droits admin)
-- ============================================================

-- ⚠️ Cette requête nécessite des privilèges élevés (service_role ou superuser)
-- Si elle échoue avec "permission denied", utilisez la Méthode API ci-dessous

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
  'VOTRE_USER_ID',           -- L'UUID de l'utilisateur (même que Lovable)
  'email@example.com',       -- L'email de l'utilisateur
  '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',  -- Mot de passe hashé (ou utiliser 'disabled')
  now(),                     -- Email confirmé
  now(),                     -- Date de création
  now(),                     -- Date de mise à jour
  '{"provider":"email","providers":["email"]}',  -- Métadonnées
  '{"name":"Nom Utilisateur"}'  -- Métadonnées utilisateur
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ÉTAPE 3 : VÉRIFIER LA CRÉATION
-- ============================================================

SELECT id, email, created_at FROM auth.users WHERE id = 'VOTRE_USER_ID';

-- ============================================================
-- MÉTHODE ALTERNATIVE : VIA L'API SUPABASE (si SQL échoue)
-- ============================================================

/*
Si vous n'avez pas les droits pour insérer dans auth.users, utilisez :

1. Supabase Dashboard → Authentication → Users → New user
2. Ou utilisez l'API avec service_role key:

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  'https://gvrrkyjhoxkdxomtyvpr.supabase.co',
  'VOTRE_SERVICE_ROLE_KEY'  -- ⚠️ Ne jamais exposer cette clé côté client!
)

await supabase.auth.admin.createUser({
  id: 'VOTRE_USER_ID',
  email: 'email@example.com',
  password: 'motdepasse',
  email_confirm: true
})
*/

-- ============================================================
-- MÉTHODE ALTERNATIVE 2 : UTILISER UNE EDGE FUNCTION
-- ============================================================

/*
Créez une edge function dans la BDD perso avec ce code:

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )
  
  const { id, email } = await req.json()
  
  const { data, error } = await supabase.auth.admin.createUser({
    id,
    email,
    password: 'temppassword123',
    email_confirm: true
  })
  
  return new Response(JSON.stringify({ data, error }))
})
*/

-- ============================================================
-- DIAGNOSTIC : POURQUOI ÇA ÉCHOUE ENCORE ?
-- ============================================================

-- Si après création de l'utilisateur, RLS échoue toujours :

-- 1. Vérifiez que l'email est confirmé (sinon auth.uid() retourne NULL)
SELECT id, email_confirmed_at FROM auth.users WHERE id = 'VOTRE_USER_ID';

-- 2. Vérifiez que le JWT est valide et non expiré
-- (dans l'app, vérifiez les logs "Session Lovable trouvée")

-- 3. Vérifiez que l'utilisateur est bien dans auth.users et pas seulement dans public.profiles
SELECT 'auth.users' as source, count(*) FROM auth.users WHERE id = 'VOTRE_USER_ID'
UNION ALL
SELECT 'public.profiles', count(*) FROM public.profiles WHERE user_id = 'VOTRE_USER_ID';

-- 4. Test direct de la policy
-- Créez une fonction pour tester:
CREATE OR REPLACE FUNCTION test_auth_uid()
RETURNS TABLE(uid uuid, test_user_id uuid) AS $$
BEGIN
  RETURN QUERY SELECT auth.uid(), 'VOTRE_USER_ID'::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exécutez: SELECT * FROM test_auth_uid();
-- Doit retourner deux UUID identiques
