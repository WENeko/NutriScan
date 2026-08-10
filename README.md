# NutriScan AI (90)

Projet : NutriVibe - Analyseur de macros par IA Agis comme un développeur Fullstack expert. Je veux créer une application web (mobile-first) qui utilise l'IA pour analyser les repas en photo. Voici la structure de la base de données dont j'ai besoin : 

1. Table Users : id, email, created_at. goals : un objet JSON contenant les objectifs quotidiens (calories, protéines, glucides, lipides). 

2. Table Meals : id, user_id (FK), timestamp. image_url : URL de la photo stockée. raw_ai_analysis : Le texte brut renvoyé par l'IA. total_calories, total_proteins, total_carbs, total_fats. is_confirmed : Booléen (pour savoir si l'utilisateur a validé les chiffres de l'IA). 

3. Table MealItems (Détails du repas) : id, meal_id (FK). name (ex: "Poulet grillé"), quantity (ex: "150g"), calories, proteins, carbs, fats. Logique de calcul attendue : L'IA doit renvoyer un JSON structuré. Pour le calcul des calories totales, utilise la formule standard : Calories = (4 \times Protéines) + (4 \times Glucides) + (9 \times Lipides) 

Interface : Un bouton "Scanner mon repas" (Accès caméra). Une vue "Dashboard" avec des barres de progression circulaires pour les objectifs du jour. Une liste historique des repas avec possibilité de modifier les valeurs si l'IA se trompe.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://calorie-capture-clever.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/08e0d47b-4aba-4de9-868f-20245065ca4e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `stable-fix-12-avril` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
