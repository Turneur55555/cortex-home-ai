import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import type { WeeklyReport } from '@/types/weekly-report'

export function useWeeklyReports() {
  return useQuery({
    queryKey: ['weekly_reports'],
    queryFn: async (): Promise<WeeklyReport[]> => {
      const { data, error } = await (supabase as any)
        .from('weekly_reports')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(12)
      if (error) throw error
      return (data ?? []) as WeeklyReport[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useWeeklyReport(id: string) {
  return useQuery({
    queryKey: ['weekly_reports', id],
    queryFn: async (): Promise<WeeklyReport | null> => {
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as WeeklyReport | null
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  })
}

export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (weekStart?: string) => {
      const { data, error } = await supabase.functions.invoke('generate-weekly-report', {
        body: { week_start: weekStart },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Rapport généré avec succès !')
      qc.invalidateQueries({ queryKey: ['weekly_reports'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
