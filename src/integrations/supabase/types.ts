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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      body_tracking: {
        Row: {
          body_fat: number | null
          chest: number | null
          created_at: string
          date: string
          hips: number | null
          id: string
          left_arm: number | null
          left_thigh: number | null
          muscle_mass: number | null
          notes: string | null
          right_arm: number | null
          right_thigh: number | null
          user_id: string
          waist: number | null
          weight: number | null
        }
        Insert: {
          body_fat?: number | null
          chest?: number | null
          created_at?: string
          date: string
          hips?: number | null
          id?: string
          left_arm?: number | null
          left_thigh?: number | null
          muscle_mass?: number | null
          notes?: string | null
          right_arm?: number | null
          right_thigh?: number | null
          user_id: string
          waist?: number | null
          weight?: number | null
        }
        Update: {
          body_fat?: number | null
          chest?: number | null
          created_at?: string
          date?: string
          hips?: number | null
          id?: string
          left_arm?: number | null
          left_thigh?: number | null
          muscle_mass?: number | null
          notes?: string | null
          right_arm?: number | null
          right_thigh?: number | null
          user_id?: string
          waist?: number | null
          weight?: number | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          alerts: Json | null
          analysis: string | null
          created_at: string
          id: string
          key_insights: Json | null
          module: string
          name: string
          storage_path: string
          summary: string | null
          user_id: string
        }
        Insert: {
          alerts?: Json | null
          analysis?: string | null
          created_at?: string
          id?: string
          key_insights?: Json | null
          module: string
          name: string
          storage_path: string
          summary?: string | null
          user_id: string
        }
        Update: {
          alerts?: Json | null
          analysis?: string | null
          created_at?: string
          id?: string
          key_insights?: Json | null
          module?: string
          name?: string
          storage_path?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          image_path: string | null
          name: string
          notes: string | null
          reps: number | null
          sets: number | null
          user_id: string
          weight: number | null
          workout_id: string
        }
        Insert: {
          id?: string
          image_path?: string | null
          name: string
          notes?: string | null
          reps?: number | null
          sets?: number | null
          user_id: string
          weight?: number | null
          workout_id: string
        }
        Update: {
          id?: string
          image_path?: string | null
          name?: string
          notes?: string | null
          reps?: number | null
          sets?: number | null
          user_id?: string
          weight?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          alert_days_before: number
          category: string
          confidence_score: number | null
          created_at: string
          expiration_date: string | null
          flagged: boolean
          id: string
          location: string | null
          module: string
          name: string
          notes: string | null
          quantity: number
          storage_path: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          alert_days_before?: number
          category: string
          confidence_score?: number | null
          created_at?: string
          expiration_date?: string | null
          flagged?: boolean
          id?: string
          location?: string | null
          module: string
          name: string
          notes?: string | null
          quantity?: number
          storage_path?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          alert_days_before?: number
          category?: string
          confidence_score?: number | null
          created_at?: string
          expiration_date?: string | null
          flagged?: boolean
          id?: string
          location?: string | null
          module?: string
          name?: string
          notes?: string | null
          quantity?: number
          storage_path?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string
          date: string
          fats: number | null
          id: string
          meal: string | null
          name: string
          proteins: number | null
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date: string
          fats?: number | null
          id?: string
          meal?: string | null
          name: string
          proteins?: number | null
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          date?: string
          fats?: number | null
          id?: string
          meal?: string | null
          name?: string
          proteins?: number | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_goals: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string
          fats: number | null
          proteins: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fats?: number | null
          proteins?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fats?: number | null
          proteins?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
          window_start?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      users_profiles: {
        Row: {
          created_at: string
          id: string
          premium: boolean
        }
        Insert: {
          created_at?: string
          id: string
          premium?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          premium?: boolean
        }
        Relationships: []
      }
      workouts: {
        Row: {
          created_at: string
          date: string
          duration_minutes: number | null
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          duration_minutes?: number | null
          id?: string
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          name?: string
          notes?: string | null
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
