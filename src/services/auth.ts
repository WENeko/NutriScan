import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Service d'authentification Google pour Capacitor (Android)
 * Flux: App -> Browser natif -> Google -> Supabase -> Deep link -> App
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
   * Écoute com.nutriscan.app://auth/callback depuis Supabase
   */
  initializeDeepLinkListener() {
    App.addListener('appUrlOpen', async (data: any) => {
      console.log('🔗 Deep link reçu:', data.url);
      
      try {
        // Vérifier la session Supabase (automatiquement mise à jour)
        const { data: session, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Erreur session:', error);
          if (authCallback) authCallback(false);
        } else if (session.session?.user) {
          console.log('✅ Utilisateur connecté:', session.session.user.email);
          if (authCallback) authCallback(true);
        } else {
          console.log('⚠️ Pas de session détectée');
          if (authCallback) authCallback(false);
        }
      } catch (err) {
        console.error('❌ Erreur deep link:', err);
        if (authCallback) authCallback(false);
      }
    });
  },

  /**
   * Authentification Google natif pour Android
   * 1. Ouvre Google dans le navigateur natif
   * 2. Google redirige vers Supabase
   * 3. Supabase redirige vers com.nutriscan.app://auth/callback
   * 4. Deep link listener détecte et connecte l'utilisateur
   */
  async signInWithGoogleNative() {
    return new Promise<{ success: boolean }>((resolve) => {
      try {
        // Définir le callback pour quand l'utilisateur revient
        authCallback = (success: boolean) => {
          authCallback = null;
          resolve({ success });
        };

        // Supabase gère automatiquement le redirect vers le deep link
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        }).then(async (result) => {
          if (result.data?.url) {
            console.log('🌐 Ouverture du navigateur...');
            // Ouvrir Google dans le navigateur natif
            await Browser.open({
              url: result.data.url,
              windowName: '_blank',
            });
          }
        }).catch((error) => {
          console.error('❌ Erreur OAuth:', error);
          if (authCallback) authCallback(false);
          resolve({ success: false });
        });
      } catch (error: any) {
        console.error('❌ Erreur Google Native:', error);
        if (authCallback) authCallback(false);
        resolve({ success: false });
      }
    });
  },

  /**
   * Authentification Google web (navigateur normal)
   */
  async signInWithGoogleWeb() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('❌ Erreur Google Web:', error);
      throw error;
    }
  },

  /**
   * Point d'entrée unique pour Google Sign In
   * Détecte automatiquement mobile ou web
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
      console.error('❌ Erreur déconnexion:', error);
      throw error;
    }
  },
};
