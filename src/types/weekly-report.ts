export interface WeeklyReportSummary {
  sessions_count: number
  total_training_time: number
  weekly_frequency: number
  avg_calories: number
  avg_proteins: number
  current_weight: number | null
  weight_evolution: number | null
  goals_respect_pct: number
}

export interface FitnessData {
  top_exercises: Array<{ name: string; sets: number; reps: number }>
  total_volume: number
  charge_progression: Array<{ exercise: string; delta_pct: number }>
  personal_records: Array<{ exercise: string; weight: number; reps: number }>
  recovery_analysis: string
  most_worked_muscles: string[]
  neglected_muscles: string[]
}

export interface NutritionData {
  avg_calories: number
  avg_proteins: number
  avg_carbs: number
  avg_fats: number
  goals_respect_pct: number
  best_days: string[]
  worst_days: string[]
}

export interface BodyData {
  weight_start: number | null
  weight_end: number | null
  weight_delta: number | null
  measurements_evolution: Record<string, number>
  physical_progress_estimate: string
}

export interface AIAnalysis {
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  recommendations: string[]
}

export interface WeeklyReport {
  id: string
  user_id: string
  week_start: string
  week_end: string
  summary: WeeklyReportSummary
  fitness_data: FitnessData
  nutrition_data: NutritionData
  body_data: BodyData
  ai_analysis: AIAnalysis
  pdf_url: string | null
  status: 'generating' | 'ready' | 'error'
  created_at: string
}
