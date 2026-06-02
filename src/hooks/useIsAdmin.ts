import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Indique si l'utilisateur courant possède le rôle admin. */
export function useIsAdmin(userId: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setIsAdmin(!!data);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { isAdmin, loading };
}
