#!/bin/bash
# ============================================================
# EXPORT DU SCHÉMA COMPLET AVEC PG_DUMP
# Plus fiable que les requêtes SQL complexes
# ============================================================

# REMPLACEZ CES VALEURS :
DB_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
OUTPUT_FILE="schema_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Export du schéma vers $OUTPUT_FILE..."

# Export uniquement le schéma (pas les données)
pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  "$DB_URL" > "$OUTPUT_FILE"

echo "✅ Schéma exporté dans : $OUTPUT_FILE"
echo ""
echo "Pour l'importer dans une autre BDD :"
echo "psql 'postgresql://postgres:[NEW_PASSWORD]@db.[NEW_PROJECT].supabase.co:5432/postgres' < $OUTPUT_FILE"
