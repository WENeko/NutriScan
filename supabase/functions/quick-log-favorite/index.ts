import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claimsData.claims.sub as string;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const favoriteMealId = String(body?.favorite_meal_id ?? '');
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(favoriteMealId)) {
      return json({ error: { favorite_meal_id: ['UUID requis'] } }, 400);
    }

    // 1. Récupérer le repas favori (RLS : appartient forcément à l'utilisateur)
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select('*')
      .eq('id', favoriteMealId)
      .eq('user_id', userId)
      .maybeSingle();

    if (mealError) return json({ error: mealError.message }, 500);
    if (!meal) return json({ error: 'Repas favori introuvable' }, 404);

    const { data: items, error: itemsError } = await supabase
      .from('meal_items')
      .select('*')
      .eq('meal_id', favoriteMealId);
    if (itemsError) return json({ error: itemsError.message }, 500);

    // 2. Insérer une nouvelle entrée pour maintenant
    const { data: newMeal, error: insertError } = await supabase
      .from('meals')
      .insert({
        user_id: userId,
        timestamp: new Date().toISOString(),
        meal_name: meal.meal_name,
        image_url: meal.image_url,
        total_calories: meal.total_calories,
        total_proteins: meal.total_proteins,
        total_carbs: meal.total_carbs,
        total_fats: meal.total_fats,
        is_confirmed: true,
        is_favorite: false,
        source: 'widget',
        parent_meal_id: meal.id,
        model_used: meal.model_used,
      })
      .select('id')
      .single();

    if (insertError) return json({ error: insertError.message }, 500);

    if (items?.length) {
      const clones = items.map((it: any) => ({
        meal_id: newMeal.id,
        name: it.name,
        quantity: it.quantity,
        calories: it.calories,
        proteins: it.proteins,
        carbs: it.carbs,
        fats: it.fats,
        unit_count: it.unit_count,
        unit_weight_g: it.unit_weight_g,
        unit_label: it.unit_label,
        nutrients_std: it.nutrients_std,
        nutrients_custom: it.nutrients_custom,
      }));
      const { error: itemsInsertError } = await supabase.from('meal_items').insert(clones);
      if (itemsInsertError) return json({ error: itemsInsertError.message }, 500);
    }

    // 3. Totaux du jour (bornes fournies par le widget, fuseau local de l'appareil)
    let dailyTotals: Record<string, number> | undefined;
    const dayStart = typeof body?.day_start === 'string' ? body.day_start : null;
    const dayEnd = typeof body?.day_end === 'string' ? body.day_end : null;
    if (dayStart && dayEnd) {
      const { data: dayMeals } = await supabase
        .from('meals')
        .select('total_calories, total_proteins, total_carbs, total_fats')
        .eq('user_id', userId)
        .gte('timestamp', dayStart)
        .lt('timestamp', dayEnd);
      const sum = (k: string) =>
        Math.round((dayMeals ?? []).reduce((acc: number, m: any) => acc + (Number(m[k]) || 0), 0));
      dailyTotals = {
        calories: sum('total_calories'),
        proteins: sum('total_proteins'),
        carbs: sum('total_carbs'),
        fats: sum('total_fats'),
      };
    }

    return json({
      success: true,
      meal_id: newMeal.id,
      name: meal.meal_name,
      daily_totals: dailyTotals,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
