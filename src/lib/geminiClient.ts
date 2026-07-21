// Direct Gemini API Client (BYOK only — no bundled key)
// The Gemini API key is provided per-user via the Providers settings and
// stored in Supabase. It is never read from client-side env vars.
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const client: GoogleGenerativeAI | null = null;

// Define the schema for meal analysis response
const mealAnalysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    meal_name: { type: SchemaType.STRING },
    confidence_score: { type: SchemaType.NUMBER },
    suggested_timestamp: { type: SchemaType.STRING },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          quantity: { type: SchemaType.NUMBER },
          calories: { type: SchemaType.NUMBER },
          proteins: { type: SchemaType.NUMBER },
          carbs: { type: SchemaType.NUMBER },
          fats: { type: SchemaType.NUMBER },
        },
        required: ["name", "quantity", "calories", "proteins", "carbs", "fats"],
      },
    },
  },
  required: ["meal_name", "confidence_score", "items"],
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
    [key: string]: unknown;
  }>;
}

export async function analyzeMealWithGemini(): Promise<MealAnalysisResult> {
  throw new Error(
    "Direct Gemini client is disabled. Configure a provider API key in Settings; analysis is routed through the shared AI routing engine.",
  );
}

// Kept for type re-exports.
export { mealAnalysisSchema };
