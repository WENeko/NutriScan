import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-community/firebase-authentication';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Service d'authentification Google pour Capacitor (Android)
 * Gère l'OAuth Google natif et synchronise avec Supabase
 */

export const authService = {
  /**
   * Vérifie si l'app s'exécute sur un mobile (iOS/Android)
   */
  isMobile(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Authentification Google native pour Android
   * Ouvre le picker Google natif, pas de redirection web
   */
  async signInWithGoogleNative() {
    try {
      // Initialiser Firebase si nécessaire
      await FirebaseAuthentication.initializeGoogle();

      // Signer avec Google (picker natif Android)
      const result = await FirebaseAuthentication.signInWithGoogle();

      if (!result.user) {
        throw new Error('Pas de session Google créée');
      }

      // Récupérer le token ID
      const idToken = result.user.idToken || result.user.authentication?.idToken || '';
      if (!idToken) {
        throw new Error('Token Google non disponible');
      }

      // Synchroniser avec Supabase via le token Google
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;
      return { success: true, user: data.user };
    } catch (error: any) {
      console.error('Erreur Google Native:', error);
      throw error;
    }
  },

  /**
   * Authentification Google web (fallback pour navigateur)
   * Utilisé sur web ou si Firebase n'est pas disponible
   */
  async signInWithGoogleWeb() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Erreur Google Web:', error);
      throw error;
    }
  },

  /**
   * Point d'entrée unique pour Google Sign In
   * Détecte automatiquement si c'est mobile ou web
   */
  async signInWithGoogle() {
    try {
      if (this.isMobile()) {
        return await this.signInWithGoogleNative();
      } else {
        return await this.signInWithGoogleWeb();
      }
    } catch (error: any) {
      toast({
        title: 'Erreur Google',
        description: error.message || 'Impossible de se connecter avec Google',
        variant: 'destructive',
      });
      throw error;
    }
  },

  /**
   * Déconnexion
   */
  async signOut() {
    try {
      if (this.isMobile()) {
        await FirebaseAuthentication.signOut();
      }
      await supabase.auth.signOut();
      return { success: true };
    } catch (error: any) {
      console.error('Erreur déconnexion:', error);
      throw error;
    }
  },
};
