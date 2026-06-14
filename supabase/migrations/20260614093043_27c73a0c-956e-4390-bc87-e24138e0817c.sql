UPDATE meals AS dup
SET
  model_used = src.model_used,
  confidence_score = src.confidence_score
FROM meals AS src
WHERE dup.user_id = src.user_id
  AND dup.id != src.id
  AND dup.meal_name IS NOT DISTINCT FROM src.meal_name
  AND dup.total_calories = src.total_calories
  AND dup.total_proteins = src.total_proteins
  AND dup.total_carbs = src.total_carbs
  AND dup.total_fats = src.total_fats
  AND dup.confidence_score IS NULL
  AND dup.model_used IS NULL
  AND src.confidence_score IS NOT NULL
  AND src.timestamp < dup.timestamp;