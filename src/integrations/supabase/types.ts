export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      body_composition: {
        Row: {
          body_fat_percent: number | null
          created_at: string
          id: string
          muscle_mass_kg: number | null
          recorded_at: string
          source: string
          sport_calories: number | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_percent?: number | null
          created_at?: string
          id?: string
          muscle_mass_kg?: number | null
          recorded_at?: string
          source?: string
          sport_calories?: number | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          body_fat_percent?: number | null
          created_at?: string
          id?: string
          muscle_mass_kg?: number | null
          recorded_at?: string
          source?: string
          sport_calories?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      custom_foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calcium_mg_per_100g: number | null
          calories_per_100g: number
          carbs_per_100g: number
          created_at: string
          fats_per_100g: number
          fiber_per_100g: number | null
          id: string
          iron_mg_per_100g: number | null
          magnesium_mg_per_100g: number | null
          name: string
          omega3_mg_per_100g: number | null
          potassium_mg_per_100g: number | null
          proteins_per_100g: number
          saturated_fat_per_100g: number | null
          serving_size_g: number
          sodium_mg_per_100g: number | null
          sugar_per_100g: number | null
          updated_at: string
          user_id: string
          vitamin_b_per_100g: number | null
          vitamin_b12_mcg_per_100g: number | null
          vitamin_b9_mcg_per_100g: number | null
          vitamin_c_per_100g: number | null
          vitamin_d_per_100g: number | null
          vitamin_e_per_100g: number | null
          zinc_mg_per_100g: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calcium_mg_per_100g?: number | null
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          fats_per_100g?: number
          fiber_per_100g?: number | null
          id?: string
          iron_mg_per_100g?: number | null
          magnesium_mg_per_100g?: number | null
          name: string
          omega3_mg_per_100g?: number | null
          potassium_mg_per_100g?: number | null
          proteins_per_100g?: number
          saturated_fat_per_100g?: number | null
          serving_size_g?: number
          sodium_mg_per_100g?: number | null
          sugar_per_100g?: number | null
          updated_at?: string
          user_id: string
          vitamin_b_per_100g?: number | null
          vitamin_b12_mcg_per_100g?: number | null
          vitamin_b9_mcg_per_100g?: number | null
          vitamin_c_per_100g?: number | null
          vitamin_d_per_100g?: number | null
          vitamin_e_per_100g?: number | null
          zinc_mg_per_100g?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calcium_mg_per_100g?: number | null
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          fats_per_100g?: number
          fiber_per_100g?: number | null
          id?: string
          iron_mg_per_100g?: number | null
          magnesium_mg_per_100g?: number | null
          name?: string
          omega3_mg_per_100g?: number | null
          potassium_mg_per_100g?: number | null
          proteins_per_100g?: number
          saturated_fat_per_100g?: number | null
          serving_size_g?: number
          sodium_mg_per_100g?: number | null
          sugar_per_100g?: number | null
          updated_at?: string
          user_id?: string
          vitamin_b_per_100g?: number | null
          vitamin_b12_mcg_per_100g?: number | null
          vitamin_b9_mcg_per_100g?: number | null
          vitamin_c_per_100g?: number | null
          vitamin_d_per_100g?: number | null
          vitamin_e_per_100g?: number | null
          zinc_mg_per_100g?: number | null
        }
        Relationships: []
      }
      meal_items: {
        Row: {
          calcium_mg: number | null
          calories: number | null
          carbs: number | null
          fats: number | null
          fiber: number | null
          id: string
          iron_mg: number | null
          magnesium_mg: number | null
          meal_id: string
          name: string
          nutrients_custom: Json
          nutrients_std: Json
          omega3_mg: number | null
          potassium_mg: number | null
          proteins: number | null
          quantity: string | null
          saturated_fat: number | null
          sodium_mg: number | null
          sugar: number | null
          unit_count: number | null
          unit_label: string | null
          unit_weight_g: number | null
          vitamin_b_mg: number | null
          vitamin_b12_mcg: number | null
          vitamin_b9_mcg: number | null
          vitamin_c_mg: number | null
          vitamin_d_mcg: number | null
          vitamin_e_mg: number | null
          zinc_mg: number | null
        }
        Insert: {
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          fats?: number | null
          fiber?: number | null
          id?: string
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_id: string
          name: string
          nutrients_custom?: Json
          nutrients_std?: Json
          omega3_mg?: number | null
          potassium_mg?: number | null
          proteins?: number | null
          quantity?: string | null
          saturated_fat?: number | null
          sodium_mg?: number | null
          sugar?: number | null
          unit_count?: number | null
          unit_label?: string | null
          unit_weight_g?: number | null
          vitamin_b_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          zinc_mg?: number | null
        }
        Update: {
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          fats?: number | null
          fiber?: number | null
          id?: string
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_id?: string
          name?: string
          nutrients_custom?: Json
          nutrients_std?: Json
          omega3_mg?: number | null
          potassium_mg?: number | null
          proteins?: number | null
          quantity?: string | null
          saturated_fat?: number | null
          sodium_mg?: number | null
          sugar?: number | null
          unit_count?: number | null
          unit_label?: string | null
          unit_weight_g?: number | null
          vitamin_b_mg?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b9_mcg?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e_mg?: number | null
          zinc_mg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_confirmed: boolean
          is_favorite: boolean
          meal_name: string | null
          raw_ai_analysis: string | null
          source: string
          timestamp: string
          total_calories: number | null
          total_carbs: number | null
          total_fats: number | null
          total_proteins: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_confirmed?: boolean
          is_favorite?: boolean
          meal_name?: string | null
          raw_ai_analysis?: string | null
          source?: string
          timestamp?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fats?: number | null
          total_proteins?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_confirmed?: boolean
          is_favorite?: boolean
          meal_name?: string | null
          raw_ai_analysis?: string | null
          source?: string
          timestamp?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fats?: number | null
          total_proteins?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string | null
          age: number | null
          bmr: number | null
          bmr_method: string | null
          body_fat_percent: number | null
          created_at: string
          custom_nutrients: Json
          date_of_birth: string | null
          email: string | null
          gender: string | null
          goals: Json
          height_cm: number | null
          id: string
          last_weighin_date: string | null
          mass_gain_phase: string | null
          morphotype: string | null
          muscle_mass_kg: number | null
          sport_calories_daily: number | null
          target_body_fat_percent: number | null
          target_muscle_mass_kg: number | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          water_goal_ml: number | null
          weighin_day: number | null
          weighin_frequency: string | null
          weighin_hour: number | null
          weighin_minute: number | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          bmr?: number | null
          bmr_method?: string | null
          body_fat_percent?: number | null
          created_at?: string
          custom_nutrients?: Json
          date_of_birth?: string | null
          email?: string | null
          gender?: string | null
          goals?: Json
          height_cm?: number | null
          id?: string
          last_weighin_date?: string | null
          mass_gain_phase?: string | null
          morphotype?: string | null
          muscle_mass_kg?: number | null
          sport_calories_daily?: number | null
          target_body_fat_percent?: number | null
          target_muscle_mass_kg?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          water_goal_ml?: number | null
          weighin_day?: number | null
          weighin_frequency?: string | null
          weighin_hour?: number | null
          weighin_minute?: number | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          bmr?: number | null
          bmr_method?: string | null
          body_fat_percent?: number | null
          created_at?: string
          custom_nutrients?: Json
          date_of_birth?: string | null
          email?: string | null
          gender?: string | null
          goals?: Json
          height_cm?: number | null
          id?: string
          last_weighin_date?: string | null
          mass_gain_phase?: string | null
          morphotype?: string | null
          muscle_mass_kg?: number | null
          sport_calories_daily?: number | null
          target_body_fat_percent?: number | null
          target_muscle_mass_kg?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          water_goal_ml?: number | null
          weighin_day?: number | null
          weighin_frequency?: string | null
          weighin_hour?: number | null
          weighin_minute?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          calcium_mg_per_100g: number
          carbs_per_100g: number
          created_at: string
          custom_food_id: string
          fats_per_100g: number
          fiber_per_100g: number
          id: string
          iron_mg_per_100g: number | null
          magnesium_mg_per_100g: number
          name: string
          omega3_mg_per_100g: number
          potassium_mg_per_100g: number
          proteins_per_100g: number
          saturated_fat_per_100g: number
          sodium_mg_per_100g: number
          sugar_per_100g: number
          vitamin_b_per_100g: number
          vitamin_b12_mcg_per_100g: number | null
          vitamin_b9_mcg_per_100g: number | null
          vitamin_c_per_100g: number
          vitamin_d_per_100g: number
          vitamin_e_per_100g: number
          weight_g: number
          zinc_mg_per_100g: number | null
        }
        Insert: {
          calcium_mg_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          custom_food_id: string
          fats_per_100g?: number
          fiber_per_100g?: number
          id?: string
          iron_mg_per_100g?: number | null
          magnesium_mg_per_100g?: number
          name: string
          omega3_mg_per_100g?: number
          potassium_mg_per_100g?: number
          proteins_per_100g?: number
          saturated_fat_per_100g?: number
          sodium_mg_per_100g?: number
          sugar_per_100g?: number
          vitamin_b_per_100g?: number
          vitamin_b12_mcg_per_100g?: number | null
          vitamin_b9_mcg_per_100g?: number | null
          vitamin_c_per_100g?: number
          vitamin_d_per_100g?: number
          vitamin_e_per_100g?: number
          weight_g?: number
          zinc_mg_per_100g?: number | null
        }
        Update: {
          calcium_mg_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          custom_food_id?: string
          fats_per_100g?: number
          fiber_per_100g?: number
          id?: string
          iron_mg_per_100g?: number | null
          magnesium_mg_per_100g?: number
          name?: string
          omega3_mg_per_100g?: number
          potassium_mg_per_100g?: number
          proteins_per_100g?: number
          saturated_fat_per_100g?: number
          sodium_mg_per_100g?: number
          sugar_per_100g?: number
          vitamin_b_per_100g?: number
          vitamin_b12_mcg_per_100g?: number | null
          vitamin_b9_mcg_per_100g?: number | null
          vitamin_c_per_100g?: number
          vitamin_d_per_100g?: number
          vitamin_e_per_100g?: number
          weight_g?: number
          zinc_mg_per_100g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_custom_food_id_fkey"
            columns: ["custom_food_id"]
            isOneToOne: false
            referencedRelation: "custom_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_logs: {
        Row: {
          created_at: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          recorded_at: string
          source: string
          stages: Json | null
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          recorded_at?: string
          source?: string
          stages?: Json | null
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          recorded_at?: string
          source?: string
          stages?: Json | null
          start_time?: string | null
          user_id?: string
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          amount_ml: number
          created_at: string
          id: string
          logged_at: string
          user_id: string
        }
        Insert: {
          amount_ml?: number
          created_at?: string
          id?: string
          logged_at?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string
          id?: string
          logged_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
