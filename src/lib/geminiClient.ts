// Direct Gemini API Client
// Replaces Lovable AI gateway with direct Google Generative AI calls
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("VITE_GEMINI_API_KEY is not configured. AI analysis will not work.");
}

export const client = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Define the schema for meal analysis response
const mealAnalysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    meal_name: {
      type: SchemaType.STRING,
      description: "Plain text meal name (e.g., 'Chicken with rice')"
    },
    confidence_score: {
      type: SchemaType.NUMBER,
      description: "Confidence score between 0 and 1"
    },
    suggested_timestamp: {
      type: SchemaType.STRING,
      description: "ISO 8601 timestamp if detected in input"
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Food item name"
          },
          quantity: {
            type: SchemaType.NUMBER,
            description: "Estimated weight in grams"
          },
          calories: { type: SchemaType.NUMBER },
          proteins: { type: SchemaType.NUMBER },
          carbs: { type: SchemaType.NUMBER },
          fats: { type: SchemaType.NUMBER },
          fiber: { type: SchemaType.NUMBER },
          sugar: { type: SchemaType.NUMBER },
          saturated_fat: { type: SchemaType.NUMBER },
          sodium_mg: { type: SchemaType.NUMBER },
          potassium_mg: { type: SchemaType.NUMBER },
          magnesium_mg: { type: SchemaType.NUMBER },
          calcium_mg: { type: SchemaType.NUMBER },
          iron_mg: { type: SchemaType.NUMBER },
          zinc_mg: { type: SchemaType.NUMBER },
          vitamin_c_mg: { type: SchemaType.NUMBER },
          vitamin_d_mcg: { type: SchemaType.NUMBER },
          vitamin_b_mg: { type: SchemaType.NUMBER },
          vitamin_b9_mcg: { type: SchemaType.NUMBER },
          vitamin_b12_mcg: { type: SchemaType.NUMBER },
          vitamin_e_mg: { type: SchemaType.NUMBER },
          omega3_mg: { type: SchemaType.NUMBER },
          unit_count: {
            type: SchemaType.NUMBER,
            description: "Number of units (for items counted by units like eggs)"
          },
          unit_label: {
            type: SchemaType.STRING,
            description: "Unit label (e.g., 'egg', 'slice', 'portion')"
          },
          unit_weight_g: {
            type: SchemaType.NUMBER,
            description: "Average weight of one unit in grams"
          }
        },
        required: ["name", "quantity", "calories", "proteins", "carbs", "fats"]
      }
    }
  },
  required: ["meal_name", "confidence_score", "items"]
};

export interface MealAnalysisResult {
  meal_name: string;
  confidence_score: number;
  suggested_timestamp?: string;
  items: Array<{
    name: string;
    quantity: number;
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
    fiber?: number;
    sugar?: number;
    saturated_fat?: number;
    sodium_mg?: number;
    potassium_mg?: number;
    magnesium_mg?: number;
    calcium_mg?: number;
    iron_mg?: number;
    zinc_mg?: number;
    vitamin_c_mg?: number;
    vitamin_d_mcg?: number;
    vitamin_b_mg?: number;
    vitamin_b9_mcg?: number;
    vitamin_b12_mcg?: number;
    vitamin_e_mg?: number;
    omega3_mg?: number;
    unit_count?: number;
    unit_label?: string;
    unit_weight_g?: number;
  }>;
}

export async function analyzeMealWithGemini(
  input: {
    image?: string;
    text?: string;
    localTime?: string;
    requestedMicros?: string[];
  },
  customFoodsContext?: string
): Promise<MealAnalysisResult> {
  if (!client) {
    throw new Error("Gemini API key not configured");
  }

  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const microsList = input.requestedMicros?.join(", ") || 
    "fiber,sugar,saturated_fat,sodium_mg,potassium_mg,magnesium_mg,calcium_mg,iron_mg,zinc_mg,vitamin_c_mg,vitamin_d_mcg,vitamin_b9_mcg,vitamin_b12_mcg,vitamin_e_mg";

  const systemPrompt = `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient. 
Si c'est une image, sois pessimiste sur les graisses cachées (+5-10g de lipides si l'aspect est brillant/frit). 
Utilise les éléments visuels (couverts, assiette) pour estimer les portions. 
Si un élément est ambigu, propose l'option la plus calorique par défaut.

IMPORTANT - Extraction temporelle :
Si le texte contient une indication de temps (ex: "hier à 22h"), retourne-la dans le champ "suggested_timestamp" au format ISO 8601.

IMPORTANT - Détection des aliments comptables en unités :
Pour CHAQUE aliment, détermine s'il se consomme/gère naturellement en unités plutôt qu'en poids brut.

RÈGLE PRINCIPALE : Si l'utilisateur mentionne un nombre SANS unité de poids ou volume après (g, kg, ml, cl, L), c'est un indice TRÈS FORT que cet aliment se compte en unités. Exemples :
- "2 tranches de jambon" → unit_count=2, unit_label="tranche"
- "3 oeufs" → unit_count=3, unit_label="oeuf"
- "1 portion de Kiri" → unit_count=1, unit_label="portion"
- "200g de riz" → poids brut (unité de poids mentionnée = PAS d'unités)

En résumé : nombre + nom d'aliment SANS g/kg/ml/cl/L = TOUJOURS utiliser unit_count/unit_label/unit_weight_g.

Si l'aliment se compte en unités, remplis ces 3 champs :
- "unit_count": nombre d'unités (entier)
- "unit_weight_g": poids moyen d'UNE unité en grammes
- "unit_label": libellé court de l'unité
Le champ "quantity" doit être = unit_count * unit_weight_g.
Si l'aliment ne se compte PAS en unités (riz, pâtes, sauce, huile, etc.), ne mets PAS ces champs.

IMPORTANT - MICRONUTRIMENTS DYNAMIQUES :
Pour chaque aliment, tu DOIS extraire les valeurs pour les clés suivantes (valeurs totales pour la portion estimée) :
${microsList}

Si tu ne connais pas la valeur pour une clé, mets 0. Ne crée pas d'autres clés de micronutriments.
${customFoodsContext ? `\n\nUTILISE CES DONNÉES DE LA BIBLIOTHÈQUE EN PRIORITÉ :\n${customFoodsContext}` : ""}`;

  const userMessage = input.image
    ? [
        { type: "text", text: "Analyse ce repas et extrais les nutriments demandés." },
        { type: "image_url", image_url: { url: input.image } }
      ]
    : `Analyse : "${input.text}"${input.localTime ? `\nHeure locale: ${input.localTime}.` : ""}`;

  try {
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: Array.isArray(userMessage)
            ? userMessage.map(p =>
                p.type === "text"
                  ? { text: p.text }
                  : { inlineData: { mimeType: "image/jpeg", data: p.image_url.url.split(",")[1] } }
              )
            : [{ text: userMessage }]
        }
      ],
      generationConfig: {
        responseSchema: mealAnalysisSchema,
        responseType: "application/json"
      },
      systemInstruction: systemPrompt
    });

    const analysisText = response.response.text();
    const result = JSON.parse(analysisText);

    return result as MealAnalysisResult;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw error;
  }
}