-- ============================================================
-- FONCTION PSQL POUR SAUVER UN REPAS (contourne RLS)
-- ============================================================

-- Supprimer l'ancienne version si elle existe (pour éviter conflit de signature)
DROP FUNCTION IF EXISTS public.save_meal_with_items(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, INTEGER, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.save_meal_with_items(UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB);

-- Cette fonction s'exécute avec les privilèges du créateur (postgres)
-- et ignore les policies RLS grâce à SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.save_meal_with_items(
  p_user_id UUID,
  p_name TEXT,
  p_meal_type TEXT,
  p_eaten_at TIMESTAMP WITH TIME ZONE,
  p_total_calories NUMERIC DEFAULT NULL,
  p_total_protein NUMERIC DEFAULT NULL,
  p_total_carbs NUMERIC DEFAULT NULL,
  p_total_fat NUMERIC DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- <-- IMPORTANT : exécute avec les droits du créateur
AS $$
DECLARE
  v_meal_id UUID;
  v_item JSONB;
  v_result JSONB;
BEGIN
  -- Vérifier si l'utilisateur existe dans auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    -- Créer l'utilisateur avec des valeurs minimales
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at)
    VALUES (
      p_user_id, 
      p_user_id::text || '@placeholder.com',
      '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insérer le repas (avec les vrais noms de colonnes)
  INSERT INTO meals (
    user_id, meal_name, 
    total_calories, total_proteins, total_carbs, total_fats, 
    timestamp, image_url, raw_ai_analysis, is_confirmed, source
  ) VALUES (
    p_user_id, p_name,
    p_total_calories, p_total_protein, p_total_carbs, p_total_fat,
    p_eaten_at, p_image_url, NULL, true, 'ai'
  )
  RETURNING id INTO v_meal_id;

  -- Insérer les items (sans user_id qui n'existe pas dans meal_items)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO meal_items (
      meal_id, name, quantity, unit_count, unit_label, unit_weight_g,
      calories, proteins, carbs, fats
    ) VALUES (
      v_meal_id,
      v_item->>'name',
      COALESCE((v_item->>'quantity')::numeric, 1),
      COALESCE((v_item->>'unit_count')::numeric, 1),
      COALESCE(v_item->>'unit_label', 'unit'),
      COALESCE((v_item->>'unit_weight_g')::numeric, 0),
      COALESCE((v_item->>'calories')::numeric, 0),
      COALESCE((v_item->>'protein')::numeric, 0),
      COALESCE((v_item->>'carbs')::numeric, 0),
      COALESCE((v_item->>'fat')::numeric, 0)
    );
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'meal_id', v_meal_id,
    'items_count', jsonb_array_length(p_items)
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- Accorder les permissions pour appeler la fonction
GRANT EXECUTE ON FUNCTION public.save_meal_with_items TO anon;
GRANT EXECUTE ON FUNCTION public.save_meal_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_meal_with_items TO public;

-- Test
-- SELECT save_meal_with_items(
--   '685302d8-57d4-41a0-b98d-6601951ad52c'::uuid,
--   'Test Meal',
--   'lunch',
--   NOW(),
--   500,
--   20,
--   60,
--   15,
--   NULL,
--   '[{"name": "Rice", "quantity": 1, "unit_count": 1, "unit_label": "cup", "unit_weight_g": 200, "calories": 200, "protein": 4, "carbs": 45, "fat": 0.5}]'::jsonb
-- );
