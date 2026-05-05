-- ============================================================
-- FIX RLS POLICIES - Cast explicite text → uuid
-- Exécutez ce SQL dans l'éditeur SQL de votre Supabase perso
-- ============================================================

-- Activer RLS
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON meals;
DROP POLICY IF EXISTS "Enable select for own meals" ON meals;
DROP POLICY IF EXISTS "Enable update for own meals" ON meals;
DROP POLICY IF EXISTS "Enable insert for meal owners" ON meal_items;
DROP POLICY IF EXISTS "Enable select for meal owners" ON meal_items;

-- Créer les policies avec cast ::uuid (car user_id est TEXT mais auth.uid() retourne UUID)
CREATE POLICY "Enable insert for authenticated users only" 
ON meals FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id::uuid);

CREATE POLICY "Enable select for own meals" 
ON meals FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id::uuid);

CREATE POLICY "Enable update for own meals" 
ON meals FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id::uuid) 
WITH CHECK (auth.uid() = user_id::uuid);

-- Policy pour meal_items (vérifier via la table meals)
CREATE POLICY "Enable insert for meal owners" 
ON meal_items FOR INSERT 
TO authenticated 
WITH CHECK (
  meal_id IN (
    SELECT id FROM meals WHERE auth.uid() = user_id::uuid
  )
);

CREATE POLICY "Enable select for meal owners" 
ON meal_items FOR SELECT 
TO authenticated 
USING (
  meal_id IN (
    SELECT id FROM meals WHERE auth.uid() = user_id::uuid
  )
);
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable insert for meal owners" 
ON meal_items FOR INSERT 
TO authenticated 
WITH CHECK (
  meal_id IN (
    SELECT id FROM meals WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Enable select for meal owners" 
ON meal_items FOR SELECT 
TO authenticated 
USING (
  meal_id IN (
    SELECT id FROM meals WHERE user_id = auth.uid()
  )
);
