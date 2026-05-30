import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Service d'authentification Google pour Capacitor (Android)
 * Utilise deep linking pour garder l'utilisateur dans l'app
 */

export const authService = {
  /**
   * Vérifie si l'app s'exécute sur un mobile (iOS/Android)
   */
  isMobile(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Initialise le listener pour les deep links (callback OAuth)
   */
  initializeDeepLinkListener(callback: (url: string) => void) {
    App.addListener('appUrlOpen', (data: any) => {
      const slug = data.url.split('.app').pop();
      if (slug) {
        callback(data.url);
      }
    });
  },

  /**
   * Authentification Google natif pour Android
   * Ouvre le navigateur natif Android mais revient dans l'app via deep linking
   */
  async signInWithGoogleNative() {
    try {
      // Le redirect URI doit être le deep link
      const redirectUrl = 'com.nutriscan.app://auth/callback';

      // Créer la session OAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;

      // Ouvrir Google dans le navigateur natif (pas de webview)
      if (data.url) {
        await Browser.open({
          url: data.url,
          windowName: '_blank',
          toolbarColor: '#ffffff',
        });
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
