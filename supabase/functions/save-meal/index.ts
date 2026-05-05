// Edge function pour sauvegarder un repas dans la BDD perso
// Cette fonction contourne le problème de JWT en utilisant service_role

import { createClient } from "npm:@supabase/supabase-js@2";

// @ts-ignore
const serve = (Deno as any).serve;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const body = await req.json();
    const { meal, items, userId } = body;

    if (!meal || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing meal or userId" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Vérifier que l'utilisateur existe dans auth.users
    const { data: existingUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userError || !existingUser?.user) {
      // Créer l'utilisateur s'il n'existe pas
      await supabaseAdmin.auth.admin.createUser({
        id: userId,
        email: meal.user_email || `${userId}@placeholder.com`,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
    }

    // Insérer le repas
    const { data: insertedMeal, error: mealError } = await supabaseAdmin
      .from("meals")
      .insert({ ...meal, user_id: userId })
      .select()
      .single();

    if (mealError) {
      return new Response(
        JSON.stringify({ error: mealError.message, details: mealError }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Insérer les items
    if (items && items.length > 0) {
      const itemsWithIds = items.map((item: any) => ({
        ...item,
        meal_id: insertedMeal.id,
        user_id: userId,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("meal_items")
        .insert(itemsWithIds);

      if (itemsError) {
        return new Response(
          JSON.stringify({ error: itemsError.message, details: itemsError }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, meal: insertedMeal }),
      { status: 201, headers: { "Content-Control-Allow-Origin": "*" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
