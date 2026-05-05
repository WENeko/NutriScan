-- ============================================================
-- SOLUTIONS POUR L'ERREUR RLS "new row violates row-level security policy"
-- ============================================================

-- ============================================================
-- OPTION 1: Vérifier si l'utilisateur existe dans auth.users
-- ============================================================
-- Remplacez 'VOTRE_USER_ID_ICI' par l'UUID de l'utilisateur qui échoue

SELECT * FROM auth.users WHERE id = 'VOTRE_USER_ID_ICI';

-- Si aucun résultat, l'utilisateur n'existe pas dans la BDD perso
-- C'est la cause la plus fréquente de l'erreur RLS

-- ============================================================
-- OPTION 2: Créer l'utilisateur dans auth.users (si manquant)
-- ============================================================
-- À exécuter seulement si l'utilisateur n'existe pas
-- Nécessite les droits admin ou service_role

-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
-- VALUES (
--   'VOTRE_USER_ID_ICI'::uuid,  -- L'UUID de l'utilisateur Lovable
--   'user@example.com',          -- L'email de l'utilisateur
--   'disabled',                  -- Mot de passe désactivé (auth externe)
--   now(),
--   now(),
--   now()
-- );

-- ============================================================
-- OPTION 3: Solution temporaire - Désactiver RLS pour test
-- ============================================================
-- ⚠️ TEMPORAIRE uniquement - À ne pas utiliser en production !

-- Désactiver RLS pour identifier si c'est bien la cause
-- ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE meal_items DISABLE ROW LEVEL SECURITY;

-- Réactiver après test
-- ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- OPTION 4: Policy permissive temporaire (pour debug)
-- ============================================================
-- Créer une policy qui permet tout pendant le debug

-- DROP POLICY IF EXISTS "Allow all for debugging" ON meals;
-- CREATE POLICY "Allow all for debugging" ON meals
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- OPTION 5: Vérifier la correspondance exacte des UUID
-- ============================================================
-- La policy compare auth.uid() = user_id
-- Les deux doivent être des UUID valides et identiques

-- Vérifier le format:
-- SELECT 
--   'user_id dans meals' as champ,
--   user_id,
--   pg_typeof(user_id) as type
-- FROM meals 
-- WHERE user_id = 'VOTRE_USER_ID_ICI'
-- UNION ALL
-- SELECT 
--   'id dans auth.users',
--   id::text,
--   pg_typeof(id)
-- FROM auth.users 
-- WHERE id = 'VOTRE_USER_ID_ICI';

-- ============================================================
-- OPTION 6: Recréer les policies avec debug
-- ============================================================

-- Supprimer les anciennes policies
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON meals;
DROP POLICY IF EXISTS "Enable select for own meals" ON meals;
DROP POLICY IF EXISTS "Enable update for own meals" ON meals;

-- Recréer avec des noms uniques pour debug
CREATE POLICY "Debug insert meals" ON meals
  FOR INSERT TO authenticated 
  WITH CHECK (
    -- Log pour debug (ne fonctionnera pas mais aide à diagnostiquer)
    user_id IS NOT NULL AND 
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  );

CREATE POLICY "Debug select meals" ON meals
  FOR SELECT TO authenticated 
  USING (auth.uid() = user_id);

-- ============================================================
-- DIAGNOSTIC FINAL
-- ============================================================
-- Exécutez ce test après avoir essayé d'insérer un repas:

-- Voir les erreurs RLS récentes dans les logs
-- (nécessite pg_admin ou superuser)

-- Alternative: créer une fonction de test
CREATE OR REPLACE FUNCTION test_rls_insert(test_user_id uuid)
RETURNS TABLE (
  auth_uid uuid,
  provided_user_id uuid,
  match boolean,
  can_insert boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.uid(),
    test_user_id,
    auth.uid() = test_user_id,
    EXISTS (
      SELECT 1 FROM auth.users WHERE id = test_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage: SELECT * FROM test_rls_insert('VOTRE_USER_ID'::uuid);
