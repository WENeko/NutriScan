/**
 * Script de migration des utilisateurs de Supabase Lovable vers Supabase Personnel
 * 
 * Usage:
 * 1. Configurer les variables d'environnement dans un fichier .env:
 *    - VITE_SUPABASE_URL (Lovable)
 *    - VITE_SUPABASE_PUBLISHABLE_KEY (Lovable)
 *    - VITE_PERSONAL_SUPABASE_URL
 *    - VITE_PERSONAL_SUPABASE_ANON_KEY
 * 
 * 2. Exécuter: node scripts/migrate-users.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration Supabase Lovable (source)
const lovableUrl = process.env.VITE_SUPABASE_URL;
const lovableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Configuration Supabase Personnel (destination)
const personalUrl = process.env.VITE_PERSONAL_SUPABASE_URL;
const personalKey = process.env.VITE_PERSONAL_SUPABASE_ANON_KEY;

if (!lovableUrl || !lovableKey) {
  console.error('❌ Variables Lovable manquantes (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)');
  process.exit(1);
}

if (!personalUrl || !personalKey) {
  console.error('❌ Variables Personnel manquantes (VITE_PERSONAL_SUPABASE_URL, VITE_PERSONAL_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabaseLovable = createClient(lovableUrl, lovableKey);
const supabasePersonal = createClient(personalUrl, personalKey);

async function migrateUsers() {
  console.log('🚀 Démarrage migration utilisateurs...\n');

  try {
    // 1. Récupérer tous les profils de Lovable
    console.log('📥 Récupération des profils depuis Lovable...');
    const { data: profiles, error: fetchError } = await supabaseLovable
      .from('profiles')
      .select('*');

    if (fetchError) {
      console.error('❌ Erreur récupération profils:', fetchError);
      process.exit(1);
    }

    if (!profiles || profiles.length === 0) {
      console.log('⚠️ Aucun profil trouvé dans Lovable');
      process.exit(0);
    }

    console.log(`✅ ${profiles.length} profils trouvés dans Lovable\n`);

    // 2. Pour chaque profil, créer dans la BDD perso
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const profile of profiles) {
      try {
        console.log(`🔄 Migration: ${profile.email || profile.user_id}...`);

        // Insérer dans la BDD perso (upsert pour éviter les doublons)
        const { error: insertError } = await supabasePersonal
          .from('profiles')
          .upsert({
            user_id: profile.user_id,
            email: profile.email,
            goals: profile.goals || { calories: 2000, proteins: 150, carbs: 250, fats: 70 },
            created_at: profile.created_at || new Date().toISOString(),
            updated_at: profile.updated_at || new Date().toISOString(),
            // Champs additionnels si présents
            water_goal_ml: profile.water_goal_ml || 2000,
            body_fat_percent: profile.body_fat_percent,
            muscle_mass_kg: profile.muscle_mass_kg,
            sport_calories_daily: profile.sport_calories_daily || 0
          }, {
            onConflict: 'user_id',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.error(`  ❌ Erreur insertion: ${insertError.message}`);
          errorCount++;
          errors.push({ user: profile.user_id, error: insertError.message });
        } else {
          console.log(`  ✅ Profil migré avec succès`);
          successCount++;
        }

      } catch (err) {
        console.error(`  ❌ Erreur traitement ${profile.user_id}:`, err.message);
        errorCount++;
        errors.push({ user: profile.user_id, error: err.message });
      }
    }

    // 3. Résumé
    console.log('\n' + '='.repeat(50));
    console.log('📊 RÉSUMÉ MIGRATION');
    console.log('='.repeat(50));
    console.log(`✅ Succès: ${successCount}/${profiles.length}`);
    console.log(`❌ Erreurs: ${errorCount}/${profiles.length}`);

    if (errors.length > 0) {
      console.log('\n🔍 Détails des erreurs:');
      errors.forEach(e => console.log(`   - ${e.user}: ${e.error}`));
    }

    console.log('\n⚠️  IMPORTANT:');
    console.log('   Les utilisateurs doivent aussi exister dans auth.users de la BDD perso.');
    console.log('   Ce script ne migre que les profils (table profiles), pas les comptes auth.');
    console.log('   Pour créer les comptes auth, utilisez l\'API Admin de Supabase ou invitez les utilisateurs.');

  } catch (err) {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  }
}

// Alternative: Migration avec création de comptes auth (nécessite service_role key)
async function migrateWithAuth() {
  console.log('🔐 Migration avec création de comptes auth...');
  console.log('⚠️  Cette fonction nécessite la SERVICE_ROLE_KEY de la BDD perso');
  console.log('   et doit être exécutée avec précaution.\n');
  
  // Cette partie nécessite des privilèges élevés et n'est pas implémentée
  // pour des raisons de sécurité. Utilisez plutôt l'invitation d'utilisateurs.
}

// Exécuter
migrateUsers().catch(console.error);
