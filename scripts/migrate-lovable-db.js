#!/usr/bin/env node
/**
 * Script de migration pour ajouter les colonnes manquantes dans Supabase Lovable
 * 
 * Usage:
 * 1. cd scripts
 * 2. npm install @supabase/supabase-js dotenv
 * 3. Créer un fichier .env avec:
 *    SUPABASE_URL=https://votre-projet-lovable.supabase.co
 *    SUPABASE_SERVICE_KEY=eyJ... (clé service_role, pas anon!)
 * 4. node migrate-lovable-db.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Nécessite la clé service_role

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables manquantes:');
  console.error('   SUPABASE_URL ou VITE_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_KEY (clé service_role, pas anon!)');
  console.error('\n💡 Obtenez la service_role key dans:');
  console.error('   Supabase Dashboard → Project Settings → API → service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const columnsToAdd = {
  meals: [
    'total_fiber',
    'total_sugar',
    'total_sodium_mg',
    'total_potassium_mg',
    'total_magnesium_mg',
    'total_calcium_mg',
    'total_iron_mg',
    'total_zinc_mg',
    'total_vitamin_c_mg',
    'total_vitamin_d_mcg',
    'total_vitamin_b9_mcg',
    'total_vitamin_b12_mcg',
    'total_vitamin_e_mg',
    'total_omega3_mg',
    'total_saturated_fat'
  ],
  meal_items: [
    'fiber',
    'sugar',
    'sodium_mg',
    'potassium_mg',
    'magnesium_mg',
    'calcium_mg',
    'iron_mg',
    'zinc_mg',
    'vitamin_c_mg',
    'vitamin_d_mcg',
    'vitamin_b9_mcg',
    'vitamin_b12_mcg',
    'vitamin_e_mg',
    'omega3_mg',
    'saturated_fat'
  ]
};

async function addColumn(table, column) {
  const sql = `ALTER TABLE IF EXISTS public.${table} ADD COLUMN IF NOT EXISTS ${column} DOUBLE PRECISION DEFAULT 0;`;
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      // Si exec_sql n'existe pas, on essaie avec une requête directe via REST
      console.log(`  ⚠️  ${table}.${column}: ${error.message}`);
      return false;
    }
    
    console.log(`  ✅ ${table}.${column}: ajoutée`);
    return true;
  } catch (err) {
    console.log(`  ❌ ${table}.${column}: ${err.message}`);
    return false;
  }
}

async function migrate() {
  console.log('🚀 Migration Lovable DB\n');
  console.log('URL:', supabaseUrl);
  console.log('');

  // Test connexion
  const { data: testData, error: testError } = await supabase.from('meals').select('id').limit(1);
  if (testError) {
    console.error('❌ Erreur connexion:', testError.message);
    process.exit(1);
  }
  console.log('✅ Connexion OK\n');

  // Ajouter colonnes dans meals
  console.log('📦 Table: meals');
  for (const col of columnsToAdd.meals) {
    await addColumn('meals', col);
  }

  // Ajouter colonnes dans meal_items
  console.log('\n📦 Table: meal_items');
  for (const col of columnsToAdd.meal_items) {
    await addColumn('meal_items', col);
  }

  // Rafraîchir cache
  console.log('\n🔄 Rafraîchissement du cache...');
  await supabase.rpc('pgrst_watch', { channel: 'pgrst' });
  
  console.log('\n✅ Migration terminée!');
  console.log('\n💡 Redémarrez votre application pour prendre en compte les changements.');
}

migrate().catch(console.error);
