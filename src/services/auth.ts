import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Service d'authentification Google pour Capacitor (Android)
 * Flux: App -> Browser natif -> Google -> Supabase callback -> App
 */

let authCallback: ((success: boolean) => void) | null = null;

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
  initializeDeepLinkListener() {
    App.addListener('appUrlOpen', async (data: any) => {
      console.log('Deep link reçu:', data.url);
      
      // Cherche les params d'authentification dans l'URL
      const url = new URL(data.url);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      const type = url.searchParams.get('type');

      // Si c'est un callback OAuth, créer la session
      if (type === 'recovery' || accessToken) {
        try {
          // Supabase gère automatiquement la session
          const { data: session, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Erreur session:', error);
            if (authCallback) authCallback(false);
          } else if (session.session) {
            console.log('Utilisateur connecté:', session.session.user.email);
            if (authCallback) authCallback(true);
          }
        } catch (err) {
          console.error('Erreur deep link:', err);
          if (authCallback) authCallback(false);
        }
      }
    });
  },

  /**
   * Authentification Google natif pour Android
   */
  async signInWithGoogleNative() {
    return new Promise<{ success: boolean }>((resolve) => {
      try {
        // Définir le callback pour quand l'utilisateur revient
        authCallback = (success: boolean) => {
          resolve({ success });
        };

        // Le redirect doit pointer vers le site web (où Supabase gère le callback)
        // Puis le site redirige vers le deep link
        const redirectUrl = `${window.location.origin}/auth/callback`;

        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        }).then(async (result) => {
          if (result.data?.url) {
            // Ouvrir Google dans le navigateur natif
            await Browser.open({
              url: result.data.url,
              windowName: '_blank',
            });
          }
        }).catch((error) => {
          console.error('Erreur OAuth:', error);
          resolve({ success: false });
        });
      } catch (error: any) {
        console.error('Erreur Google Native:', error);
        resolve({ success: false });
      }
    });
  },

  /**
   * Authentification Google web
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
