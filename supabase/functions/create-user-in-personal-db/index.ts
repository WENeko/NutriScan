// Edge function pour créer un utilisateur dans la BDD perso
// Déployez cette fonction sur votre BDD perso

import { createClient } from "npm:@supabase/supabase-js@2";

interface CreateUserRequest {
  id: string;  // UUID de l'utilisateur (depuis Lovable)
  email: string;
  name?: string;
}

// @ts-ignore - Deno est disponible dans l'environnement edge function
const serve = (Deno as any).serve;

serve(async (req: Request) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Créer client admin avec service_role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { id, email, name }: CreateUserRequest = await req.json();

    if (!id || !email) {
      return new Response(
        JSON.stringify({ error: "id and email are required" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    // Vérifier si l'utilisateur existe déjà
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(id);
    
    if (existingUser?.user) {
      return new Response(
        JSON.stringify({ 
          message: "User already exists", 
          user: existingUser.user 
        }),
        { 
          status: 200, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    // Créer l'utilisateur avec l'ID spécifique
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      id,
      email,
      password: crypto.randomUUID(), // Mot de passe aléatoire, l'utilisateur ne se connectera pas directement
      email_confirm: true,
      user_metadata: {
        name: name || email.split("@")[0],
        source: "lovable_sync"
      }
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "User created successfully", 
        user: data.user 
      }),
      { 
        status: 201, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );
  }
});
