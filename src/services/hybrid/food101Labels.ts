/**
 * Noms des 101 classes du dataset Food-101, dans l'ordre alphabétique officiel
 * (identique à l'ordre des dossiers du dataset, utilisé comme ordre des classes
 * lors de l'entraînement du modèle Laya-Vision).
 *
 * Les indices 0→100 correspondent à ces plats ; les indices 101→499 réservés
 * aux extensions (Nutrition5k / Food2K) n'ont pas encore de libellé embarqué et
 * sont affichés comme « aliment détecté #N ».
 */
export const FOOD101_LABELS: string[] = [
  "apple_pie", "baby_back_ribs", "baklava", "beef_carpaccio", "beef_tartare",
  "beet_salad", "beignets", "bibimbap", "bread_pudding", "breakfast_burrito",
  "bruschetta", "caesar_salad", "cannoli", "caprese_salad", "carrot_cake",
  "ceviche", "cheesecake", "cheese_plate", "chicken_curry", "chicken_quesadilla",
  "chicken_wings", "chocolate_cake", "chocolate_mousse", "churros", "clam_chowder",
  "club_sandwich", "crab_cakes", "creme_brulee", "croque_madame", "cup_cakes",
  "deviled_eggs", "donuts", "dumplings", "edamame", "eggs_benedict",
  "escargots", "falafel", "filet_mignon", "fish_and_chips", "foie_gras",
  "french_fries", "french_onion_soup", "french_toast", "fried_calamari", "fried_rice",
  "frozen_yogurt", "garlic_bread", "gnocchi", "greek_salad", "grilled_cheese_sandwich",
  "grilled_salmon", "guacamole", "gyoza", "hamburger", "hot_and_sour_soup",
  "hot_dog", "huevos_rancheros", "hummus", "ice_cream", "lasagna",
  "lobster_bisque", "lobster_roll_sandwich", "macaroni_and_cheese", "macarons", "miso_soup",
  "mussels", "nachos", "omelette", "onion_rings", "oysters",
  "pad_thai", "paella", "pancakes", "panna_cotta", "peking_duck",
  "pho", "pizza", "pork_chop", "poutine", "prime_rib",
  "pulled_pork_sandwich", "ramen", "ravioli", "red_velvet_cake", "risotto",
  "samosa", "sashimi", "scallops", "seaweed_salad", "shrimp_and_grits",
  "spaghetti_bolognese", "spaghetti_carbonara", "spring_rolls", "steak", "strawberry_shortcake",
  "sushi", "tacos", "takoyaki", "tiramisu", "tuna_tartare", "waffles",
];

/** Libellé lisible pour un indice de classe du modèle Laya-Vision. */
export function labelForClassIndex(index: number): string {
  if (index >= 0 && index < FOOD101_LABELS.length) return FOOD101_LABELS[index];
  return `aliment_${index}`;
}
