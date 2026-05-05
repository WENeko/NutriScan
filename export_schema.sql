-- ============================================================
-- EXPORT COMPLÈT DU SCHÉMA DE BASE DE DONNÉES
-- Pour répliquer la structure sur une autre BDD Supabase
-- ============================================================

-- 1. EXTENSIONS NÉCESSAIRES
-- ============================================================
SELECT '-- EXTENSIONS' as section;
SELECT 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";';  -- Si vous utilisez uuid_generate_v4
SELECT 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";';   -- Pour gen_random_uuid()

-- 2. TABLES ET COLONNES
-- ============================================================
SELECT '-- TABLES ET COLONNES' as section;

WITH table_columns AS (
  SELECT 
    c.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      'meals', 'meal_items', 'profiles', 'sleep_logs', 
      'water_logs', 'body_composition', 'custom_foods',
      'recipe_ingredients', 'water_intake', 'user_preferences'
    )
  ORDER BY c.table_name, c.ordinal_position
)
SELECT 
  'CREATE TABLE IF NOT EXISTS ' || table_name || ' (' as create_statement
FROM table_columns
GROUP BY table_name;

-- 3. CONTRAINTES (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
-- ============================================================
SELECT '-- CONTRAINTES' as section;

-- Primary Keys
SELECT 
  'ALTER TABLE ' || tc.table_name || 
  ' ADD CONSTRAINT ' || tc.constraint_name || 
  ' PRIMARY KEY (' || string_agg(kcu.column_name, ', ') || ');' as pk_constraint
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_name = kcu.table_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name;

-- Foreign Keys
SELECT 
  'ALTER TABLE ' || tc.table_name || 
  ' ADD CONSTRAINT ' || tc.constraint_name || 
  ' FOREIGN KEY (' || kcu.column_name || ') ' ||
  ' REFERENCES ' || ccu.table_name || '(' || ccu.column_name || ')' ||
  CASE 
    WHEN rc.delete_rule IS NOT NULL AND rc.delete_rule != 'NO ACTION' 
    THEN ' ON DELETE ' || rc.delete_rule 
    ELSE '' 
  END ||
  CASE 
    WHEN rc.update_rule IS NOT NULL AND rc.update_rule != 'NO ACTION' 
    THEN ' ON UPDATE ' || rc.update_rule 
    ELSE '' 
  END || ';' as fk_constraint
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
  ON tc.constraint_name = ccu.constraint_name
LEFT JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';

-- Unique constraints
SELECT 
  'ALTER TABLE ' || tc.table_name || 
  ' ADD CONSTRAINT ' || tc.constraint_name || 
  ' UNIQUE (' || string_agg(kcu.column_name, ', ') || ');' as unique_constraint
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
  AND tc.table_name = kcu.table_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name;

-- 4. DEFAULT VALUES
-- ============================================================
SELECT '-- DEFAULT VALUES' as section;

SELECT 
  'ALTER TABLE ' || table_name || 
  ' ALTER COLUMN ' || column_name || 
  ' SET DEFAULT ' || column_default || ';' as default_stmt
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_default IS NOT NULL
  AND column_default NOT LIKE 'nextval%';  -- Exclure les séquences auto

-- 5. RLS (ROW LEVEL SECURITY)
-- ============================================================
SELECT '-- RLS CONFIGURATION' as section;

-- Activer RLS sur les tables
SELECT 
  'ALTER TABLE ' || tablename || ' ENABLE ROW LEVEL SECURITY;' as enable_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'meals', 'meal_items', 'profiles', 'sleep_logs', 
    'water_logs', 'body_composition', 'custom_foods'
  );

-- 6. RLS POLICIES
-- ============================================================
SELECT '-- RLS POLICIES' as section;

-- Policies avec expressions (utilise pg_get_expr pour éviter les erreurs)
SELECT 
  'CREATE POLICY "' || p.policyname || '"' ||
  ' ON ' || p.tablename ||
  ' FOR ' || CASE p.cmd 
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT' 
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.cmd
  END ||
  ' TO ' || p.roles || ';' as policy_header
FROM pg_policies p
WHERE p.schemaname = 'public';

-- 7. INDEXES
-- ============================================================
SELECT '-- INDEXES' as section;

SELECT 
  pg_get_indexdef(indexrelid) || ';' as index_stmt
FROM pg_index
WHERE schemaname = 'public'
  AND indexrelid IN (
    SELECT indexrelid 
    FROM pg_index 
    WHERE indisprimary = false  -- Exclure les PK
  );

-- 8. TRIGGERS
-- ============================================================
SELECT '-- TRIGGERS' as section;

SELECT 
  'CREATE TRIGGER ' || trigger_name ||
  ' ' || action_timing || ' ' || event_manipulation ||
  ' ON ' || event_object_table ||
  ' FOR EACH ' || action_orientation ||
  ' EXECUTE FUNCTION ' || action_statement || ';' as trigger_stmt
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- 9. FONCTIONS CUSTOM
-- ============================================================
SELECT '-- FONCTIONS' as section;

SELECT 
  pg_get_functiondef(oid) || ';' as function_def
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace;

-- 10. VUES
-- ============================================================
SELECT '-- VUES' as section;

SELECT 
  'CREATE OR REPLACE VIEW ' || viewname || ' AS ' || 
  pg_get_viewdef(viewname::regclass, true) || ';' as view_def
FROM pg_views
WHERE schemaname = 'public';

-- 11. RÉSUMÉ
-- ============================================================
SELECT '-- RÉSUMÉ' as section;

SELECT 
  'Tables: ' || COUNT(*)::text as summary
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 
  'RLS Policies: ' || COUNT(*)::text
FROM pg_policies 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Indexes: ' || COUNT(*)::text
FROM pg_indexes 
WHERE schemaname = 'public';
