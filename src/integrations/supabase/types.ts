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
      achievement_criteria: {
        Row: {
          description: string | null
          id_prefix: string
          requirement_type: string
        }
        Insert: {
          description?: string | null
          id_prefix: string
          requirement_type: string
        }
        Update: {
          description?: string | null
          id_prefix?: string
          requirement_type?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          diff: Json | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          diff?: Json | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          diff?: Json | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      affiliations_mutuelle: {
        Row: {
          cle: string
          couvert: boolean
          date_naissance: string | null
          date_sortie: string | null
          etablissement: string | null
          etablissements: string | null
          id: string
          matricule: string | null
          motif_dispense: string | null
          motif_sortie: string | null
          nom: string | null
          num_ss: string | null
          prenom: string | null
          sirets: string | null
          statut: string
          updated_at: string
        }
        Insert: {
          cle: string
          couvert?: boolean
          date_naissance?: string | null
          date_sortie?: string | null
          etablissement?: string | null
          etablissements?: string | null
          id?: string
          matricule?: string | null
          motif_dispense?: string | null
          motif_sortie?: string | null
          nom?: string | null
          num_ss?: string | null
          prenom?: string | null
          sirets?: string | null
          statut: string
          updated_at?: string
        }
        Update: {
          cle?: string
          couvert?: boolean
          date_naissance?: string | null
          date_sortie?: string | null
          etablissement?: string | null
          etablissements?: string | null
          id?: string
          matricule?: string | null
          motif_dispense?: string | null
          motif_sortie?: string | null
          nom?: string | null
          num_ss?: string | null
          prenom?: string | null
          sirets?: string | null
          statut?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          function_name: string
          id: string
          result: Json
          user_id: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          function_name: string
          id?: string
          result: Json
          user_id?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          function_name?: string
          id?: string
          result?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      arrets_maladie: {
        Row: {
          created_at: string
          date_debut: string
          date_fin: string | null
          dossier_id: string
          id: string
          salarie_nom: string
          statut: string
          type: string
        }
        Insert: {
          created_at?: string
          date_debut: string
          date_fin?: string | null
          dossier_id: string
          id?: string
          salarie_nom: string
          statut?: string
          type?: string
        }
        Update: {
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dossier_id?: string
          id?: string
          salarie_nom?: string
          statut?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "arrets_maladie_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      badges_catalog: {
        Row: {
          badge_key: string
          created_at: string
          description: string
          icon: string
          id: string
          label: string
          rarity: string
          requirement_type: string
          requirement_value: number
          sort_order: number
          xp_reward: number
        }
        Insert: {
          badge_key: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          label: string
          rarity?: string
          requirement_type: string
          requirement_value: number
          sort_order?: number
          xp_reward?: number
        }
        Update: {
          badge_key?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          label?: string
          rarity?: string
          requirement_type?: string
          requirement_value?: number
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
      ca_praticiens: {
        Row: {
          ca: number | null
          centre: string
          cle: string
          id: string
          periode: string
          perte_profit: number | null
          praticien: string | null
          rpps: string
          specialite: string | null
          updated_at: string
        }
        Insert: {
          ca?: number | null
          centre: string
          cle: string
          id?: string
          periode: string
          perte_profit?: number | null
          praticien?: string | null
          rpps: string
          specialite?: string | null
          updated_at?: string
        }
        Update: {
          ca?: number | null
          centre?: string
          cle?: string
          id?: string
          periode?: string
          perte_profit?: number | null
          praticien?: string | null
          rpps?: string
          specialite?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contrats: {
        Row: {
          created_at: string
          date_debut: string
          date_fin: string | null
          dossier_id: string
          id: string
          salaire_brut: number
          salarie_nom: string
          statut: string
          type: string
        }
        Insert: {
          created_at?: string
          date_debut: string
          date_fin?: string | null
          dossier_id: string
          id?: string
          salaire_brut: number
          salarie_nom: string
          statut?: string
          type: string
        }
        Update: {
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dossier_id?: string
          id?: string
          salaire_brut?: number
          salarie_nom?: string
          statut?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      controle_lignes: {
        Row: {
          acompte: number | null
          anomalies: Json
          brut: number | null
          ca: number | null
          categorie: string | null
          centre: string | null
          charges: number | null
          commentaire: string | null
          created_at: string
          date_entree: string | null
          date_naissance: string | null
          date_sortie: string | null
          emploi: string | null
          heures_m: number | null
          heures_m1: number | null
          heures_reel: number | null
          id: string
          import_id: string
          matricule: string
          ms_hors_ts: number | null
          mutuelle_m: number | null
          mutuelle_m1: number | null
          net: number | null
          num_ss: string | null
          pas: number | null
          pct_specifique: number | null
          periode: string | null
          rpps: string | null
          salaire_m: number | null
          salaire_m1: number | null
          salarie: string | null
          siret: string | null
          taux_m: number | null
          taux_m1: number | null
          type_contrat: string | null
        }
        Insert: {
          acompte?: number | null
          anomalies?: Json
          brut?: number | null
          ca?: number | null
          categorie?: string | null
          centre?: string | null
          charges?: number | null
          commentaire?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          emploi?: string | null
          heures_m?: number | null
          heures_m1?: number | null
          heures_reel?: number | null
          id?: string
          import_id: string
          matricule: string
          ms_hors_ts?: number | null
          mutuelle_m?: number | null
          mutuelle_m1?: number | null
          net?: number | null
          num_ss?: string | null
          pas?: number | null
          pct_specifique?: number | null
          periode?: string | null
          rpps?: string | null
          salaire_m?: number | null
          salaire_m1?: number | null
          salarie?: string | null
          siret?: string | null
          taux_m?: number | null
          taux_m1?: number | null
          type_contrat?: string | null
        }
        Update: {
          acompte?: number | null
          anomalies?: Json
          brut?: number | null
          ca?: number | null
          categorie?: string | null
          centre?: string | null
          charges?: number | null
          commentaire?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          emploi?: string | null
          heures_m?: number | null
          heures_m1?: number | null
          heures_reel?: number | null
          id?: string
          import_id?: string
          matricule?: string
          ms_hors_ts?: number | null
          mutuelle_m?: number | null
          mutuelle_m1?: number | null
          net?: number | null
          num_ss?: string | null
          pas?: number | null
          pct_specifique?: number | null
          periode?: string | null
          rpps?: string | null
          salaire_m?: number | null
          salaire_m1?: number | null
          salarie?: string | null
          siret?: string | null
          taux_m?: number | null
          taux_m1?: number | null
          type_contrat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "controle_lignes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_controles: {
        Row: {
          commentaire: string | null
          created_at: string
          created_by: string | null
          ecart_global: number | null
          fichier: string
          file_type: string
          id: string
          import_id: string | null
          masse_salariale: number | null
          nb_anomalies: number
          nb_critiques: number
          nb_salaries: number
          periode: string | null
          periode_label: string | null
          resultat: string
          updated_at: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          ecart_global?: number | null
          fichier: string
          file_type?: string
          id?: string
          import_id?: string | null
          masse_salariale?: number | null
          nb_anomalies?: number
          nb_critiques?: number
          nb_salaries?: number
          periode?: string | null
          periode_label?: string | null
          resultat?: string
          updated_at?: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          ecart_global?: number | null
          fichier?: string
          file_type?: string
          id?: string
          import_id?: string | null
          masse_salariale?: number | null
          nb_anomalies?: number
          nb_critiques?: number
          nb_salaries?: number
          periode?: string | null
          periode_label?: string | null
          resultat?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cp_controles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_controles_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: true
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_historique: {
        Row: {
          created_by: string | null
          id: string
          period: string
          sans_mutuelle: Json
          saved_at: string
          taux_problemes: Json
          total_anomalies: number
          total_salaries: number
        }
        Insert: {
          created_by?: string | null
          id?: string
          period: string
          sans_mutuelle?: Json
          saved_at?: string
          taux_problemes?: Json
          total_anomalies?: number
          total_salaries?: number
        }
        Update: {
          created_by?: string | null
          id?: string
          period?: string
          sans_mutuelle?: Json
          saved_at?: string
          taux_problemes?: Json
          total_anomalies?: number
          total_salaries?: number
        }
        Relationships: [
          {
            foreignKeyName: "cp_historique_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      data_backups: {
        Row: {
          created_at: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      disciplines: {
        Row: {
          accent_class: string
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          accent_class: string
          created_at?: string
          icon: string
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          accent_class?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
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
      dossier_documents: {
        Row: {
          categorie: string | null
          created_at: string | null
          dossier_id: string | null
          id: string
          nom: string
          storage_path: string
          taille: number | null
          type_mime: string | null
        }
        Insert: {
          categorie?: string | null
          created_at?: string | null
          dossier_id?: string | null
          id?: string
          nom: string
          storage_path: string
          taille?: number | null
          type_mime?: string | null
        }
        Update: {
          categorie?: string | null
          created_at?: string | null
          dossier_id?: string | null
          id?: string
          nom?: string
          storage_path?: string
          taille?: number | null
          type_mime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_documents_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          created_at: string
          id: string
          nb_salaries: number
          nom: string
          priorite: string
          prochaine_echeance: string | null
          progression: number
          responsable_id: string | null
          siret: string | null
          statut: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nb_salaries?: number
          nom: string
          priorite?: string
          prochaine_echeance?: string | null
          progression?: number
          responsable_id?: string | null
          siret?: string | null
          statut?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nb_salaries?: number
          nom?: string
          priorite?: string
          prochaine_echeance?: string | null
          progression?: number
          responsable_id?: string | null
          siret?: string | null
          statut?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dsn: {
        Row: {
          created_at: string
          date_depot: string | null
          date_limite: string
          dossier_id: string
          id: string
          periode: string
          statut: string
          type: string
        }
        Insert: {
          created_at?: string
          date_depot?: string | null
          date_limite: string
          dossier_id: string
          id?: string
          periode: string
          statut?: string
          type?: string
        }
        Update: {
          created_at?: string
          date_depot?: string | null
          date_limite?: string
          dossier_id?: string
          id?: string
          periode?: string
          statut?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsn_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      echeances: {
        Row: {
          created_at: string
          date_echeance: string
          dossier_id: string | null
          id: string
          montant: number | null
          statut: string
          titre: string
          type: string
        }
        Insert: {
          created_at?: string
          date_echeance: string
          dossier_id?: string | null
          id?: string
          montant?: number | null
          statut?: string
          titre: string
          type?: string
        }
        Update: {
          created_at?: string
          date_echeance?: string
          dossier_id?: string | null
          id?: string
          montant?: number | null
          statut?: string
          titre?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "echeances_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
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
      exercise_history: {
        Row: {
          exercise_name: string
          id: string
          last_reps: number | null
          last_sets: number | null
          last_used_at: string
          last_weight: number | null
          usage_count: number
          user_id: string
        }
        Insert: {
          exercise_name: string
          id?: string
          last_reps?: number | null
          last_sets?: number | null
          last_used_at?: string
          last_weight?: number | null
          usage_count?: number
          user_id: string
        }
        Update: {
          exercise_name?: string
          id?: string
          last_reps?: number | null
          last_sets?: number | null
          last_used_at?: string
          last_weight?: number | null
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      exercise_reference: {
        Row: {
          aliases: string[] | null
          category: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          discipline_id: string
          id: string
          is_active: boolean
          media: Json | null
          name: string
          sort_order: number | null
        }
        Insert: {
          aliases?: string[] | null
          category?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discipline_id: string
          id?: string
          is_active?: boolean
          media?: Json | null
          name: string
          sort_order?: number | null
        }
        Update: {
          aliases?: string[] | null
          category?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discipline_id?: string
          id?: string
          is_active?: boolean
          media?: Json | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_reference_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_sets: {
        Row: {
          completed: boolean
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          reps: number | null
          rest_seconds: number | null
          set_number: number
          tempo: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          reps?: number | null
          rest_seconds?: number | null
          set_number: number
          tempo?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rest_seconds?: number | null
          set_number?: number
          tempo?: string | null
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
          barcode: string | null
          brand: string | null
          calcium_mg: number | null
          calories: number | null
          carbs_g: number | null
          category: string | null
          copper_mg: number | null
          created_at: string
          fat_g: number | null
          fiber_g: number | null
          id: string
          image_url: string | null
          iron_mg: number | null
          language: string | null
          magnesium_mg: number | null
          manganese_mg: number | null
          micros: Json | null
          name: string
          normalized_name: string
          phosphorus_mg: number | null
          potassium_mg: number | null
          protein_g: number | null
          saturated_fat_g: number | null
          search_tsv: unknown
          selenium_ug: number | null
          serving_type: string | null
          sodium_mg: number | null
          source: string
          source_id: string | null
          subcategory: string | null
          sugars_g: number | null
          updated_at: string
          user_id: string | null
          verified: boolean
          vitamin_a_ug: number | null
          vitamin_b1_mg: number | null
          vitamin_b12_ug: number | null
          vitamin_b2_mg: number | null
          vitamin_b3_mg: number | null
          vitamin_b5_mg: number | null
          vitamin_b6_mg: number | null
          vitamin_b9_ug: number | null
          vitamin_c_mg: number | null
          vitamin_d_ug: number | null
          vitamin_e_mg: number | null
          vitamin_k_ug: number | null
          water_g: number | null
          zinc_mg: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          copper_mg?: number | null
          created_at?: string
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          image_url?: string | null
          iron_mg?: number | null
          language?: string | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          micros?: Json | null
          name: string
          normalized_name: string
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          search_tsv?: unknown
          selenium_ug?: number | null
          serving_type?: string | null
          sodium_mg?: number | null
          source: string
          source_id?: string | null
          subcategory?: string | null
          sugars_g?: number | null
          updated_at?: string
          user_id?: string | null
          verified?: boolean
          vitamin_a_ug?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_ug?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b9_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_ug?: number | null
          water_g?: number | null
          zinc_mg?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          copper_mg?: number | null
          created_at?: string
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          image_url?: string | null
          iron_mg?: number | null
          language?: string | null
          magnesium_mg?: number | null
          manganese_mg?: number | null
          micros?: Json | null
          name?: string
          normalized_name?: string
          phosphorus_mg?: number | null
          potassium_mg?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          search_tsv?: unknown
          selenium_ug?: number | null
          serving_type?: string | null
          sodium_mg?: number | null
          source?: string
          source_id?: string | null
          subcategory?: string | null
          sugars_g?: number | null
          updated_at?: string
          user_id?: string | null
          verified?: boolean
          vitamin_a_ug?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12_ug?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5_mg?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b9_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          vitamin_e_mg?: number | null
          vitamin_k_ug?: number | null
          water_g?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed_at: string | null
          created_at: string
          goal_type: string
          id: string
          is_completed: boolean
          start_value: number | null
          target_date: string
          target_value: number | null
          title: string
          updated_at: string
          user_id: string
          xp_awarded: boolean
          xp_reward: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          goal_type?: string
          id?: string
          is_completed?: boolean
          start_value?: number | null
          target_date: string
          target_value?: number | null
          title: string
          updated_at?: string
          user_id: string
          xp_awarded?: boolean
          xp_reward?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          goal_type?: string
          id?: string
          is_completed?: boolean
          start_value?: number | null
          target_date?: string
          target_value?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          xp_awarded?: boolean
          xp_reward?: number
        }
        Relationships: []
      }
      health_data_imports: {
        Row: {
          created_at: string
          data_type: string | null
          id: string
          image_path: string
          image_url: string | null
          ocr_text: string | null
          parsed_data: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_type?: string | null
          id?: string
          image_path: string
          image_url?: string | null
          ocr_text?: string | null
          parsed_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_type?: string | null
          id?: string
          image_path?: string
          image_url?: string | null
          ocr_text?: string | null
          parsed_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historique_imports: {
        Row: {
          categorie: string | null
          centre: string | null
          created_at: string | null
          created_by: string | null
          diff_salaire: number | null
          diff_taux: number | null
          dossier_id: string | null
          emploi: string | null
          error_reason: string | null
          file_type: string | null
          has_error: boolean | null
          heures_m: number | null
          heures_m1: number | null
          id: string
          matricule: string
          periode: string
          periode_label: string
          salaire_m: number | null
          salaire_m1: number | null
          salarie: string
          taux_m: number | null
          taux_m1: number | null
        }
        Insert: {
          categorie?: string | null
          centre?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_salaire?: number | null
          diff_taux?: number | null
          dossier_id?: string | null
          emploi?: string | null
          error_reason?: string | null
          file_type?: string | null
          has_error?: boolean | null
          heures_m?: number | null
          heures_m1?: number | null
          id?: string
          matricule: string
          periode: string
          periode_label: string
          salaire_m?: number | null
          salaire_m1?: number | null
          salarie: string
          taux_m?: number | null
          taux_m1?: number | null
        }
        Update: {
          categorie?: string | null
          centre?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_salaire?: number | null
          diff_taux?: number | null
          dossier_id?: string | null
          emploi?: string | null
          error_reason?: string | null
          file_type?: string | null
          has_error?: boolean | null
          heures_m?: number | null
          heures_m1?: number | null
          id?: string
          matricule?: string
          periode?: string
          periode_label?: string
          salaire_m?: number | null
          salaire_m1?: number | null
          salarie?: string
          taux_m?: number | null
          taux_m1?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historique_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_imports_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          file_hash: string | null
          id: string
          nb_lignes: number
          nom_fichier: string
          periode: string | null
          type: string
          updated_at: string
          uploaded_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_hash?: string | null
          id?: string
          nb_lignes?: number
          nom_fichier: string
          periode?: string | null
          type?: string
          updated_at?: string
          uploaded_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_hash?: string | null
          id?: string
          nb_lignes?: number
          nom_fichier?: string
          periode?: string | null
          type?: string
          updated_at?: string
          uploaded_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          custom_name: string | null
          date: string
          id: string
          meal: string
          recipe_id: string | null
          servings: number
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          date: string
          id?: string
          meal: string
          recipe_id?: string | null
          servings?: number
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          date?: string
          id?: string
          meal?: string
          recipe_id?: string | null
          servings?: number
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
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
          user_id?: string
        }
        Relationships: []
      }
      nutrition_favorites: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string
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
          fats?: number | null
          id?: string
          meal?: string | null
          name: string
          proteins?: number | null
          user_id?: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string
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
          activity_factor: number | null
          calories: number | null
          carbs: number | null
          created_at: string
          fats: number | null
          fiber_g: number | null
          objective: string | null
          proteins: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_factor?: number | null
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fats?: number | null
          fiber_g?: number | null
          objective?: string | null
          proteins?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_factor?: number | null
          calories?: number | null
          carbs?: number | null
          created_at?: string
          fats?: number | null
          fiber_g?: number | null
          objective?: string | null
          proteins?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_weeks: {
        Row: {
          created_at: string
          id: string
          intensity_pct: number | null
          is_deload: boolean
          phase: string
          program_id: string
          target_rpe: number | null
          user_id: string
          volume_multiplier: number
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          intensity_pct?: number | null
          is_deload?: boolean
          phase?: string
          program_id: string
          target_rpe?: number | null
          user_id: string
          volume_multiplier?: number
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          intensity_pct?: number | null
          is_deload?: boolean
          phase?: string
          program_id?: string
          target_rpe?: number | null
          user_id?: string
          volume_multiplier?: number
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
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
      recipe_ingredients: {
        Row: {
          created_at: string
          food_id: string | null
          grams: number | null
          id: string
          item_id: string | null
          name: string
          quantity: number | null
          recipe_id: string
          sort_order: number
          unit: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          food_id?: string | null
          grams?: number | null
          id?: string
          item_id?: string | null
          name: string
          quantity?: number | null
          recipe_id: string
          sort_order?: number
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          food_id?: string | null
          grams?: number | null
          id?: string
          item_id?: string | null
          name?: string
          quantity?: number | null
          recipe_id?: string
          sort_order?: number
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories: number | null
          carbs_g: number | null
          category: string | null
          created_at: string
          description: string | null
          fat_g: number | null
          fiber_g: number | null
          id: string
          image_path: string | null
          instructions: string | null
          is_public: boolean
          name: string
          prep_minutes: number | null
          protein_g: number | null
          saturated_fat_g: number | null
          servings: number
          source: string
          sugars_g: number | null
          tags: string[] | null
          total_weight_g: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          image_path?: string | null
          instructions?: string | null
          is_public?: boolean
          name: string
          prep_minutes?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          servings?: number
          source?: string
          sugars_g?: number | null
          tags?: string[] | null
          total_weight_g?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          id?: string
          image_path?: string | null
          instructions?: string | null
          is_public?: boolean
          name?: string
          prep_minutes?: number | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          servings?: number
          source?: string
          sugars_g?: number | null
          tags?: string[] | null
          total_weight_g?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      regles_analyse: {
        Row: {
          categorie: string
          created_at: string
          id: string
          regles: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          categorie: string
          created_at?: string
          id?: string
          regles?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          categorie?: string
          created_at?: string
          id?: string
          regles?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          body: string | null
          created_at: string
          done: boolean
          due_at: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_catalog: {
        Row: {
          active: boolean
          category: string
          description: string | null
          diminishing_curve: number[] | null
          diminishing_group: string | null
          source_key: string
          updated_at: string
          weekly_cap: number | null
          xp_amount: number
        }
        Insert: {
          active?: boolean
          category: string
          description?: string | null
          diminishing_curve?: number[] | null
          diminishing_group?: string | null
          source_key: string
          updated_at?: string
          weekly_cap?: number | null
          xp_amount: number
        }
        Update: {
          active?: boolean
          category?: string
          description?: string | null
          diminishing_curve?: number[] | null
          diminishing_group?: string | null
          source_key?: string
          updated_at?: string
          weekly_cap?: number | null
          xp_amount?: number
        }
        Relationships: []
      }
      saved_meal_items: {
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
          fats: number | null
          food_id: string | null
          id: string
          name: string
          proteins: number | null
          saved_meal_id: string
          serving_count: number | null
          sort_order: number
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
          fats?: number | null
          food_id?: string | null
          id?: string
          name: string
          proteins?: number | null
          saved_meal_id: string
          serving_count?: number | null
          sort_order?: number
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
          fats?: number | null
          food_id?: string | null
          id?: string
          name?: string
          proteins?: number | null
          saved_meal_id?: string
          serving_count?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          created_at: string
          id: string
          meal: string | null
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          meal?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          index: number
          name: string
          slug: string
          starts_at: string
          status: string
          theme: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          index: number
          name: string
          slug: string
          starts_at: string
          status?: string
          theme?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          index?: number
          name?: string
          slug?: string
          starts_at?: string
          status?: string
          theme?: string | null
        }
        Relationships: []
      }
      shopping_list: {
        Row: {
          added_at: string
          done: boolean
          id: string
          item_id: string | null
          name: string
          quantity: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          done?: boolean
          id?: string
          item_id?: string | null
          name: string
          quantity?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          done?: boolean
          id?: string
          item_id?: string | null
          name?: string
          quantity?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      silae_sync_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          records_synced: number
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: []
      }
      sp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          season_id: string
          source: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          season_id: string
          source: string
          user_id: string
          workout_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          season_id?: string
          source?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sp_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sp_events_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      stc: {
        Row: {
          created_at: string
          date_sortie: string
          dossier_id: string
          id: string
          montant: number | null
          motif: string
          salarie_nom: string
          statut: string
        }
        Insert: {
          created_at?: string
          date_sortie: string
          dossier_id: string
          id?: string
          montant?: number | null
          motif: string
          salarie_nom: string
          statut?: string
        }
        Update: {
          created_at?: string
          date_sortie?: string
          dossier_id?: string
          id?: string
          montant?: number | null
          motif?: string
          salarie_nom?: string
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "stc_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_history: {
        Row: {
          action_type: string
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          meal_name: string | null
          quantity_after: number | null
          quantity_before: number | null
          room_id: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          meal_name?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          room_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          meal_name?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          room_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      supplement_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          supplement_id: string
          taken: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          supplement_id: string
          taken?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          supplement_id?: string
          taken?: boolean
          user_id?: string
        }
        Relationships: [
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
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      taches: {
        Row: {
          assignee_id: string | null
          categorie: string
          created_at: string
          description: string | null
          dossier_id: string | null
          echeance: string | null
          id: string
          priorite: string
          statut: string
          titre: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          categorie?: string
          created_at?: string
          description?: string | null
          dossier_id?: string | null
          echeance?: string | null
          id?: string
          priorite?: string
          statut?: string
          titre: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          categorie?: string
          created_at?: string
          description?: string | null
          dossier_id?: string | null
          echeance?: string | null
          id?: string
          priorite?: string
          statut?: string
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taches_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      taches_recurrentes: {
        Row: {
          active: boolean
          assignee_id: string | null
          categorie: string
          created_at: string | null
          date_debut: string
          date_fin: string | null
          derniere_generation: string | null
          description: string | null
          dossier_id: string | null
          frequence: string
          id: string
          jour_de_semaine: number | null
          jour_du_mois: number | null
          mois_de_annee: number | null
          priorite: string
          titre: string
        }
        Insert: {
          active?: boolean
          assignee_id?: string | null
          categorie?: string
          created_at?: string | null
          date_debut?: string
          date_fin?: string | null
          derniere_generation?: string | null
          description?: string | null
          dossier_id?: string | null
          frequence: string
          id?: string
          jour_de_semaine?: number | null
          jour_du_mois?: number | null
          mois_de_annee?: number | null
          priorite?: string
          titre: string
        }
        Update: {
          active?: boolean
          assignee_id?: string | null
          categorie?: string
          created_at?: string | null
          date_debut?: string
          date_fin?: string | null
          derniere_generation?: string | null
          description?: string | null
          dossier_id?: string | null
          frequence?: string
          id?: string
          jour_de_semaine?: number | null
          jour_du_mois?: number | null
          mois_de_annee?: number | null
          priorite?: string
          titre?: string
        }
        Relationships: [
          {
            foreignKeyName: "taches_recurrentes_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          created_at: string
          days_per_week: number | null
          goal: string
          id: string
          name: string
          notes: string | null
          periodization_model: string
          start_date: string | null
          status: string
          total_weeks: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_per_week?: number | null
          goal?: string
          id?: string
          name: string
          notes?: string | null
          periodization_model?: string
          start_date?: string | null
          status?: string
          total_weeks?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_per_week?: number | null
          goal?: string
          id?: string
          name?: string
          notes?: string | null
          periodization_model?: string
          start_date?: string | null
          status?: string
          total_weeks?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string
          user_id: string
          xp_reward?: number
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
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
          exercise_reference_id: string | null
          id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_name: string
          exercise_reference_id?: string | null
          id?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_name?: string
          exercise_reference_id?: string | null
          id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exercise_illustrations_exercise_reference_id_fkey"
            columns: ["exercise_reference_id"]
            isOneToOne: false
            referencedRelation: "exercise_reference"
            referencedColumns: ["id"]
          },
        ]
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
          file_size: number
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
          id: string
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
          id?: string
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
          id?: string
          notifications_enabled?: boolean
          theme?: string
          units?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_season_progress: {
        Row: {
          ps: number
          season_id: string
          tier: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ps?: number
          season_id: string
          tier?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ps?: number
          season_id?: string
          tier?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_season_progress_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string | null
          fitness_data: Json
          id: string
          nutrition_data: Json
          pdf_url: string | null
          status: string | null
          summary: Json
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          ai_analysis?: Json
          body_data?: Json
          created_at?: string | null
          fitness_data?: Json
          id?: string
          nutrition_data?: Json
          pdf_url?: string | null
          status?: string | null
          summary?: Json
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          ai_analysis?: Json
          body_data?: Json
          created_at?: string | null
          fitness_data?: Json
          id?: string
          nutrition_data?: Json
          pdf_url?: string | null
          status?: string | null
          summary?: Json
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      workout_analyses: {
        Row: {
          created_at: string
          id: string
          summary: Json
          user_id: string
          workout_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          summary: Json
          user_id: string
          workout_id: string
        }
        Update: {
          created_at?: string
          id?: string
          summary?: Json
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_analyses_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: true
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "workout_segments_discipline_fkey"
            columns: ["discipline"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
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
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          created_at: string
          date: string
          discipline: string
          duration_minutes: number | null
          gym_location: string
          id: string
          level_after: number | null
          level_before: number | null
          metadata: Json
          name: string
          notes: string | null
          status: string
          user_id: string
          xp_after: number | null
          xp_before: number | null
        }
        Insert: {
          created_at?: string
          date: string
          discipline?: string
          duration_minutes?: number | null
          gym_location?: string
          id?: string
          level_after?: number | null
          level_before?: number | null
          metadata?: Json
          name: string
          notes?: string | null
          status?: string
          user_id: string
          xp_after?: number | null
          xp_before?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          discipline?: string
          duration_minutes?: number | null
          gym_location?: string
          id?: string
          level_after?: number | null
          level_before?: number | null
          metadata?: Json
          name?: string
          notes?: string | null
          status?: string
          user_id?: string
          xp_after?: number | null
          xp_before?: number | null
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          dedup_key: string | null
          id: string
          source: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          dedup_key?: string | null
          id?: string
          source: string
          user_id: string
          workout_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          dedup_key?: string | null
          id?: string
          source?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_briefing_matinal: {
        Row: {
          arrets_actifs: number | null
          dossiers_actifs: number | null
          dsn_48h: number | null
          dsn_aujourdhui: number | null
          stc_en_cours: number | null
          taches_urgentes: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _seed_home_categories_for_user: {
        Args: { uid: string }
        Returns: undefined
      }
      award_character_xp: {
        Args: {
          _amount: number
          _dedup_key?: string
          _source: string
          _user_id: string
          _workout_id?: string
        }
        Returns: undefined
      }
      award_diminishing_reward: {
        Args: {
          _dedup_key: string
          _occurrence_index: number
          _source_key: string
          _user_id: string
        }
        Returns: undefined
      }
      award_reward_event: {
        Args: { _dedup_key?: string; _source_key: string; _workout_id?: string }
        Returns: undefined
      }
      award_season_points: {
        Args: {
          _amount: number
          _season_id: string
          _source: string
          _user_id: string
          _workout_id?: string
        }
        Returns: undefined
      }
      claim_achievement: {
        Args: { _achievement_id: string; _xp_reward: number }
        Returns: undefined
      }
      cleanup_expired_cache: { Args: never; Returns: undefined }
      cleanup_old_pdfs: { Args: never; Returns: undefined }
      compute_achievement_stats: { Args: { _uid: string }; Returns: Json }
      compute_fitness_stats: { Args: { _uid: string }; Returns: Json }
      compute_level_from_xp: { Args: { _xp: number }; Returns: number }
      compute_season_tier: { Args: { _ps: number }; Returns: number }
      create_saved_meal: {
        Args: { p_items?: Json; p_meal?: string; p_name: string }
        Returns: string
      }
      daitch_mokotoff: { Args: { "": string }; Returns: string[] }
      dmetaphone: { Args: { "": string }; Returns: string }
      dmetaphone_alt: { Args: { "": string }; Returns: string }
      f_unaccent: { Args: { "": string }; Returns: string }
      frequent_foods: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          calories: number
          carbs: number
          cnt: number
          fats: number
          name: string
          proteins: number
        }[]
      }
      generer_taches_recurrentes: { Args: never; Returns: number }
      get_user_streak_days: { Args: never; Returns: number }
      log_saved_meal: {
        Args: { p_date?: string; p_meal?: string; p_meal_id: string }
        Returns: number
      }
      recompute_recipe_nutrition: {
        Args: { p_recipe: string }
        Returns: undefined
      }
      revoke_character_xp_for_workout: {
        Args: { _workout_id: string }
        Returns: undefined
      }
      run_weekly_backups: { Args: never; Returns: number }
      soundex: { Args: { "": string }; Returns: string }
      text_soundex: { Args: { "": string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      unlock_user_badge: { Args: { _badge_key: string }; Returns: undefined }
    }
    Enums: {
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
      reminder_priority: ["low", "medium", "high", "urgent"],
      reminder_recurrence: ["none", "daily", "weekly", "monthly", "yearly"],
      reminder_status: ["todo", "in_progress", "done"],
    },
  },
} as const
