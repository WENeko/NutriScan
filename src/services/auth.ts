import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Service d'authentification Google pour Capacitor (Android)
 * Utilise Supabase OAuth avec deep linking pour garder l'utilisateur dans l'app
 */

export const authService = {
  /**
   * Vérifie si l'app s'exécute sur un mobile (iOS/Android)
   */
  isMobile(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Authentification Google natif pour Android
   * Ouvre le navigateur natif Android mais revient dans l'app via deep linking
   */
  async signInWithGoogleNative() {
    try {
      // Créer une session d'écoute pour les redirects
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Deep link vers l'app au lieu du site web
          redirectTo: `com.nutriscan.app://auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;

      // Ouvrir Google dans le navigateur natif (pas de webview)
      if (data.url) {
        await Browser.open({ url: data.url });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Erreur Google Native:', error);
      throw error;
    }
  },

  /**
   * Authentification Google web (fallback pour navigateur)
   * Utilisé sur web ou si on n'est pas sur mobile
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
      await supabase.auth.signOut();
      return { success: true };
    } catch (error: any) {
      console.error('Erreur déconnexion:', error);
      throw error;
    }
  },
};
