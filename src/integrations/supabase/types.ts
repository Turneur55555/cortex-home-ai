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
      badges_catalog: {
        Row: {
          badge_key: string
          category: string | null
          created_at: string
          description: string
          icon: string
          id: string
          is_coming_soon: boolean
          is_secret: boolean
          label: string
          rarity: string
          requirement_type: string
          requirement_value: number
          secret_hint: string | null
          sort_order: number
          xp_reward: number
        }
        Insert: {
          badge_key: string
          category?: string | null
          created_at?: string
          description: string
          icon?: string
          id?: string
          is_coming_soon?: boolean
          is_secret?: boolean
          label: string
          rarity?: string
          requirement_type: string
          requirement_value: number
          secret_hint?: string | null
          sort_order?: number
          xp_reward?: number
        }
        Update: {
          badge_key?: string
          category?: string | null
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_coming_soon?: boolean
          is_secret?: boolean
          label?: string
          rarity?: string
          requirement_type?: string
          requirement_value?: number
          secret_hint?: string | null
          sort_order?: number
          xp_reward?: number
        }
        Relationships: []
      }
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
          source_document_id: string | null
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
          source_document_id?: string | null
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
          source_document_id?: string | null
          user_id?: string
          waist?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_tracking_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_activity: {
        Row: {
          active_calories: number | null
          avg_hr: number | null
          created_at: string
          date: string
          distance_m: number | null
          id: string
          max_hr: number | null
          resting_hr: number | null
          source: string
          steps: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_calories?: number | null
          avg_hr?: number | null
          created_at?: string
          date: string
          distance_m?: number | null
          id?: string
          max_hr?: number | null
          resting_hr?: number | null
          source?: string
          steps?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_calories?: number | null
          avg_hr?: number | null
          created_at?: string
          date?: string
          distance_m?: number | null
          id?: string
          max_hr?: number | null
          resting_hr?: number | null
          source?: string
          steps?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          alerts: Json | null
          created_at: string
          extracted_items: Json
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
          created_at?: string
          extracted_items?: Json
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
          created_at?: string
          extracted_items?: Json
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
      error_logs: {
        Row: {
          col: number | null
          context: Json | null
          created_at: string
          id: string
          level: string
          line: number | null
          message: string
          route: string | null
          source: string | null
          stack: string | null
          support_id: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          col?: number | null
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          line?: number | null
          message: string
          route?: string | null
          source?: string | null
          stack?: string | null
          support_id: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          col?: number | null
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          line?: number | null
          message?: string
          route?: string | null
          source?: string | null
          stack?: string | null
          support_id?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      exercise_catalog: {
        Row: {
          created_at: string
          group_name: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      exercise_reference: {
        Row: {
          category: string | null
          created_at: string
          discipline_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          discipline_id?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          discipline_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      exercise_sets: {
        Row: {
          completed: boolean
          created_at: string
          exercise_id: string
          id: string
          reps: number | null
          rest_seconds: number | null
          rpe: number | null
          set_number: number
          updated_at: string
          user_id: string
          weight: number | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          exercise_id: string
          id?: string
          reps?: number | null
          rest_seconds?: number | null
          rpe?: number | null
          set_number: number
          updated_at?: string
          user_id: string
          weight?: number | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          exercise_id?: string
          id?: string
          reps?: number | null
          rest_seconds?: number | null
          rpe?: number | null
          set_number?: number
          updated_at?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          exercise_reference_id: string | null
          id: string
          image_path: string | null
          muscle_groups: string[] | null
          name: string
          notes: string | null
          reps: number | null
          sets: number | null
          superset_group: number | null
          user_id: string
          weight: number | null
          workout_id: string
        }
        Insert: {
          exercise_reference_id?: string | null
          id?: string
          image_path?: string | null
          muscle_groups?: string[] | null
          name: string
          notes?: string | null
          reps?: number | null
          sets?: number | null
          superset_group?: number | null
          user_id: string
          weight?: number | null
          workout_id: string
        }
        Update: {
          exercise_reference_id?: string | null
          id?: string
          image_path?: string | null
          muscle_groups?: string[] | null
          name?: string
          notes?: string | null
          reps?: number | null
          sets?: number | null
          superset_group?: number | null
          user_id?: string
          weight?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_exercise_reference_id_fkey"
            columns: ["exercise_reference_id"]
            isOneToOne: false
            referencedRelation: "exercise_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      food_barcodes: {
        Row: {
          barcode: string
          created_at: string
          food_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          food_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_barcodes_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_custom_foods: {
        Row: {
          brand: string | null
          calories: number | null
          carbs: number | null
          created_at: string
          default_serving_grams: number | null
          fats: number | null
          food_id: string | null
          id: string
          name: string
          proteins: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          created_at?: string
          default_serving_grams?: number | null
          fats?: number | null
          food_id?: string | null
          id?: string
          name: string
          proteins?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          created_at?: string
          default_serving_grams?: number | null
          fats?: number | null
          food_id?: string | null
          id?: string
          name?: string
          proteins?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_custom_foods_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_favorites: {
        Row: {
          created_at: string
          food_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_favorites_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_preferences: {
        Row: {
          allergies: string[]
          created_at: string
          foods_to_avoid: string[]
          goal: string | null
          no_meat_dairy_mix: boolean
          other_rules: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[]
          created_at?: string
          foods_to_avoid?: string[]
          goal?: string | null
          no_meat_dairy_mix?: boolean
          other_rules?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[]
          created_at?: string
          foods_to_avoid?: string[]
          goal?: string | null
          no_meat_dairy_mix?: boolean
          other_rules?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      food_quality_scores: {
        Row: {
          computed_at: string
          confidence_score: number
          flags: Json | null
          food_id: string
          kcal_declared: number | null
          kcal_delta_pct: number | null
          kcal_theoretical: number | null
          quality_score: number
        }
        Insert: {
          computed_at?: string
          confidence_score: number
          flags?: Json | null
          food_id: string
          kcal_declared?: number | null
          kcal_delta_pct?: number | null
          kcal_theoretical?: number | null
          quality_score: number
        }
        Update: {
          computed_at?: string
          confidence_score?: number
          flags?: Json | null
          food_id?: string
          kcal_declared?: number | null
          kcal_delta_pct?: number | null
          kcal_theoretical?: number | null
          quality_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_quality_scores_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: true
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_search_history: {
        Row: {
          created_at: string
          food_id: string | null
          hit_count: number
          id: string
          last_used_at: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id?: string | null
          hit_count?: number
          id?: string
          last_used_at?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string | null
          hit_count?: number
          id?: string
          last_used_at?: string
          query?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_search_history_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_servings: {
        Row: {
          created_at: string
          food_id: string
          grams: number
          id: string
          is_default: boolean
          label: string
          quantity: number
          unit: string
        }
        Insert: {
          created_at?: string
          food_id: string
          grams: number
          id?: string
          is_default?: boolean
          label: string
          quantity: number
          unit: string
        }
        Update: {
          created_at?: string
          food_id?: string
          grams?: number
          id?: string
          is_default?: boolean
          label?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_servings_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_synonyms: {
        Row: {
          alias: string
          alias_normalized: string
          canonical_term: string | null
          created_at: string
          food_id: string | null
          id: string
          language: string | null
        }
        Insert: {
          alias: string
          alias_normalized: string
          canonical_term?: string | null
          created_at?: string
          food_id?: string | null
          id?: string
          language?: string | null
        }
        Update: {
          alias?: string
          alias_normalized?: string
          canonical_term?: string | null
          created_at?: string
          food_id?: string | null
          id?: string
          language?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_synonyms_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          brand: string | null
          calories: number | null
          carbs: number | null
          category: string | null
          created_at: string
          fats: number | null
          fiber: number | null
          id: string
          image_url: string | null
          language: string | null
          micros: Json | null
          name: string
          name_normalized: string
          proteins: number | null
          saturated_fat: number | null
          sodium: number | null
          source: string
          source_id: string | null
          sugar: number | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          fiber?: number | null
          id?: string
          image_url?: string | null
          language?: string | null
          micros?: Json | null
          name: string
          name_normalized: string
          proteins?: number | null
          saturated_fat?: number | null
          sodium?: number | null
          source: string
          source_id?: string | null
          sugar?: number | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          calories?: number | null
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          fiber?: number | null
          id?: string
          image_url?: string | null
          language?: string | null
          micros?: Json | null
          name?: string
          name_normalized?: string
          proteins?: number | null
          saturated_fat?: number | null
          sodium?: number | null
          source?: string
          source_id?: string | null
          sugar?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed_at: string | null
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          is_completed: boolean
          start_value: number | null
          target_date: string
          target_value: number | null
          title: string
          updated_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_completed?: boolean
          start_value?: number | null
          target_date: string
          target_value?: number | null
          title: string
          updated_at?: string
          user_id: string
          xp_reward?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_completed?: boolean
          start_value?: number | null
          target_date?: string
          target_value?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
      }
      nutrition: {
        Row: {
          base_calories: number | null
          base_carbs: number | null
          base_fats: number | null
          base_proteins: number | null
          calories: number | null
          carbs: number | null
          consumed_grams_per_unit: number | null
          consumed_quantity: number | null
          consumed_unit: string | null
          created_at: string
          date: string
          fats: number | null
          id: string
          meal: string | null
          name: string
          percentage_consumed: number | null
          proteins: number | null
          serving_count: number | null
          source_document_id: string | null
          user_id: string
        }
        Insert: {
          base_calories?: number | null
          base_carbs?: number | null
          base_fats?: number | null
          base_proteins?: number | null
          calories?: number | null
          carbs?: number | null
          consumed_grams_per_unit?: number | null
          consumed_quantity?: number | null
          consumed_unit?: string | null
          created_at?: string
          date: string
          fats?: number | null
          id?: string
          meal?: string | null
          name: string
          percentage_consumed?: number | null
          proteins?: number | null
          serving_count?: number | null
          source_document_id?: string | null
          user_id: string
        }
        Update: {
          base_calories?: number | null
          base_carbs?: number | null
          base_fats?: number | null
          base_proteins?: number | null
          calories?: number | null
          carbs?: number | null
          consumed_grams_per_unit?: number | null
          consumed_quantity?: number | null
          consumed_unit?: string | null
          created_at?: string
          date?: string
          fats?: number | null
          id?: string
          meal?: string | null
          name?: string
          percentage_consumed?: number | null
          proteins?: number | null
          serving_count?: number | null
          source_document_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
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
      supplement_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          source_document_id: string | null
          supplement_id: string
          taken: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          source_document_id?: string | null
          supplement_id: string
          taken?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          source_document_id?: string | null
          supplement_id?: string
          taken?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_logs_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_logs_supplement_id_fkey"
            columns: ["supplement_id"]
            isOneToOne: false
            referencedRelation: "supplements"
            referencedColumns: ["id"]
          },
        ]
      }
      supplements: {
        Row: {
          created_at: string
          dosage: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          sort_order: number
          source_document_id: string | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          sort_order?: number
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          sort_order?: number
          source_document_id?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplements_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity: {
        Row: {
          created_at: string
          id: string
          label: string
          metadata: Json
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_key: string
          description: string
          icon: string
          id: string
          label: string
          rarity: string
          unlocked_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          badge_key: string
          description?: string
          icon?: string
          id?: string
          label: string
          rarity?: string
          unlocked_at?: string
          user_id: string
          xp_reward?: number
        }
        Update: {
          badge_key?: string
          description?: string
          icon?: string
          id?: string
          label?: string
          rarity?: string
          unlocked_at?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
      }
      user_exercise_illustrations: {
        Row: {
          created_at: string
          exercise_name: string
          id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_name: string
          id?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_name?: string
          id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_pdfs: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          accent_color: string
          ai_preferences: Json
          animations_enabled: boolean
          created_at: string
          height_cm: number | null
          notifications_enabled: boolean
          theme: string
          units: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          ai_preferences?: Json
          animations_enabled?: boolean
          created_at?: string
          height_cm?: number | null
          notifications_enabled?: boolean
          theme?: string
          units?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string
          ai_preferences?: Json
          animations_enabled?: boolean
          created_at?: string
          height_cm?: number | null
          notifications_enabled?: boolean
          theme?: string
          units?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          level: number
          total_actions: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          level?: number
          total_actions?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          level?: number
          total_actions?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      users_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          ai_analysis: Json
          body_data: Json
          created_at: string
          fitness_data: Json
          id: string
          nutrition_data: Json
          pdf_url: string | null
          status: string
          summary: Json
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          ai_analysis?: Json
          body_data?: Json
          created_at?: string
          fitness_data?: Json
          id?: string
          nutrition_data?: Json
          pdf_url?: string | null
          status?: string
          summary?: Json
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          ai_analysis?: Json
          body_data?: Json
          created_at?: string
          fitness_data?: Json
          id?: string
          nutrition_data?: Json
          pdf_url?: string | null
          status?: string
          summary?: Json
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      workout_segments: {
        Row: {
          completed: boolean
          created_at: string
          discipline: string | null
          exercise_id: string | null
          id: string
          label: string
          metric_key: string | null
          metrics: Json
          position: number
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          discipline?: string | null
          exercise_id?: string | null
          id?: string
          label: string
          metric_key?: string | null
          metrics?: Json
          position?: number
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          discipline?: string | null
          exercise_id?: string | null
          id?: string
          label?: string
          metric_key?: string | null
          metrics?: Json
          position?: number
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_segments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_segments_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_template_exercises: {
        Row: {
          created_at: string
          default_reps: number | null
          default_sets: number | null
          default_weight: number | null
          id: string
          name: string
          notes: string | null
          position: number
          superset_group: number | null
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          default_weight?: number | null
          id?: string
          name: string
          notes?: string | null
          position?: number
          superset_group?: number | null
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_reps?: number | null
          default_sets?: number | null
          default_weight?: number | null
          id?: string
          name?: string
          notes?: string | null
          position?: number
          superset_group?: number | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          source_document_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          source_document_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          source_document_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          date: string
          discipline: string
          duration_minutes: number | null
          gym_location: string
          id: string
          metadata: Json
          name: string
          notes: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          discipline?: string
          duration_minutes?: number | null
          gym_location?: string
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          discipline?: string
          duration_minutes?: number | null
          gym_location?: string
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_level_from_xp: { Args: { _xp: number }; Returns: number }
      deposit_document_analysis: {
        Args: { p_document_id: string; p_modules: Json }
        Returns: Json
      }
      get_user_streak_days: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unlock_user_badge: {
        Args: { _badge_key: string }
        Returns: {
          badge_key: string
          description: string
          icon: string
          id: string
          label: string
          rarity: string
          unlocked_at: string
          user_id: string
          xp_reward: number
        }
        SetofOptions: {
          from: "*"
          to: "user_badges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      goal_type: "workouts_weekly" | "protein_daily" | "weight_loss" | "custom"
      reminder_priority: "low" | "medium" | "high" | "urgent"
      reminder_recurrence: "none" | "daily" | "weekly" | "monthly" | "yearly"
      reminder_status: "todo" | "in_progress" | "done"
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
    Enums: {
      goal_type: ["workouts_weekly", "protein_daily", "weight_loss", "custom"],
      reminder_priority: ["low", "medium", "high", "urgent"],
      reminder_recurrence: ["none", "daily", "weekly", "monthly", "yearly"],
      reminder_status: ["todo", "in_progress", "done"],
    },
  },
} as const
