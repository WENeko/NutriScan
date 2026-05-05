-- ============================================================
-- RÉACTIVATION RLS ET VÉRIFICATION FINALE
-- À exécuter après confirmation que tout fonctionne
-- ============================================================

-- 1. S'assurer que les UUID sont générés automatiquement
ALTER TABLE meals ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE meal_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sleep_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE water_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE body_composition ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE custom_foods ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Réactiver RLS sur toutes les tables
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;

-- 3. Vérification que tout est en place
SELECT 'meals' as table_name, 
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'meals') as policy_count,
       (SELECT data_type FROM information_schema.columns WHERE table_name = 'meals' AND column_name = 'user_id') as user_id_type
UNION ALL
SELECT 'meal_items', 
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'meal_items'),
       'N/A';
