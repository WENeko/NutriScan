-- ============================================================
-- EXPORT SIMPLIFIÉ DU SCHÉMA - VERSION SQL
-- Génère des commandes CREATE TABLE complètes
-- ============================================================

-- Exécuter ce script dans Supabase SQL Editor
-- Puis copier la sortie pour la réexécuter dans une autre BDD

WITH column_defs AS (
  SELECT 
    c.table_name,
    c.column_name,
    c.data_type || 
      CASE 
        WHEN c.character_maximum_length IS NOT NULL 
        THEN '(' || c.character_maximum_length || ')'
        WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
        THEN '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
        ELSE ''
      END ||
      CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
      CASE WHEN c.column_default IS NOT NULL 
        THEN ' DEFAULT ' || c.column_default 
        ELSE '' 
      END as column_def,
    c.ordinal_position
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      'meals', 'meal_items', 'profiles', 'sleep_logs', 
      'water_logs', 'body_composition', 'custom_foods',
      'recipe_ingredients'
    )
),
table_defs AS (
  SELECT 
    table_name,
    string_agg(
      '  ' || column_name || ' ' || column_def, 
      E'\n,' ORDER BY ordinal_position
    ) as columns_sql
  FROM column_defs
  GROUP BY table_name
)
SELECT 
  'CREATE TABLE IF NOT EXISTS ' || table_name || ' (' || E'\n' ||
  columns_sql || E'\n' ||
  ');' as create_table_sql
FROM table_defs
ORDER BY table_name;

-- Primary Keys
SELECT 
  E'\n' || '-- Primary Keys' as section;

SELECT 
  'ALTER TABLE ' || tc.table_name || 
  ' ADD CONSTRAINT ' || tc.constraint_name || 
  ' PRIMARY KEY (' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) || ');' as pk_sql
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_name = kcu.table_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- Foreign Keys
SELECT 
  E'\n' || '-- Foreign Keys' as section;

SELECT 
  'ALTER TABLE ' || tc.table_name || 
  ' ADD CONSTRAINT ' || tc.constraint_name || 
  ' FOREIGN KEY (' || kcu.column_name || ') ' ||
  ' REFERENCES ' || ccu.table_name || '(' || ccu.column_name || ')' ||
  COALESCE(' ON DELETE ' || NULLIF(rc.delete_rule, 'NO ACTION'), '') ||
  COALESCE(' ON UPDATE ' || NULLIF(rc.update_rule, 'NO ACTION'), '') || ';' as fk_sql
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_name = kcu.table_name
JOIN information_schema.constraint_column_usage ccu 
  ON tc.constraint_name = ccu.constraint_name
LEFT JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- Enable RLS
SELECT 
  E'\n' || '-- Enable RLS' as section;

SELECT 
  'ALTER TABLE ' || tablename || ' ENABLE ROW LEVEL SECURITY;'
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'meals', 'meal_items', 'profiles', 'sleep_logs', 
    'water_logs', 'body_composition', 'custom_foods'
  )
ORDER BY tablename;

-- RLS Policies
SELECT 
  E'\n' || '-- RLS Policies' as section;

SELECT 
  'DROP POLICY IF EXISTS "' || policyname || '" ON ' || tablename || ';' as drop_policy
FROM pg_policies
WHERE schemaname = 'public';

SELECT 
  'CREATE POLICY "' || policyname || '"' ||
  ' ON ' || tablename ||
  ' FOR ' || CASE 
    WHEN cmd = 'r' THEN 'SELECT'
    WHEN cmd = 'a' THEN 'INSERT'
    WHEN cmd = 'w' THEN 'UPDATE'
    WHEN cmd = 'd' THEN 'DELETE'
    WHEN cmd = '*' THEN 'ALL'
    ELSE cmd
  END ||
  ' TO ' || roles ||
  CASE 
    WHEN qual IS NOT NULL AND qual != '' THEN ' USING (' || qual || ')'
    ELSE ''
  END ||
  CASE 
    WHEN with_check IS NOT NULL AND with_check != '' THEN ' WITH CHECK (' || with_check || ')'
    ELSE ''
  END || ';' as create_policy
FROM (
  SELECT 
    policyname,
    tablename,
    cmd,
    roles,
    pg_get_expr(pol.qual, pol.polrelid) as qual,
    pg_get_expr(pol.with_check, pol.polrelid) as with_check
  FROM pg_policies pol
  WHERE schemaname = 'public'
) sub
ORDER BY tablename, policyname;
