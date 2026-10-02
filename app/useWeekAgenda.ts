'use client'
// Calendario (G2; rediseño fase 2) — las clases de una semana del profe (GET
// /api/classes/agenda), con sus alumnos y horarios. Lo usan "Mi agenda" y "Hoy".
// Si se pide otra semana antes de que llegue la anterior, la respuesta vieja se descarta.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeacherClass } from '@/lib/classView'
import { weekRange, type AgendaStudent } from '@/lib/agendaView'
import type { Series } from './useClassEditor'

export type AgendaClass = TeacherClass & { studentId: string }
export type AgendaSeries = Series & { studentId: string }
export type WeekData = { week: string; students: AgendaStudent[]; series: AgendaSeries[]; classes: AgendaClass[]; zoomUrl: string | null }

export function useWeekAgenda(week: string) {
  const [data, setData] = useState<WeekData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const asked = useRef('')

  const reload = useCallback(async () => {
    asked.current = week
    setLoadError(false)
    const { from, to } = weekRange(week)
    try {
      const res = await fetch(`/api/classes/agenda?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      if (asked.current !== week) return // ya se pidió otra semana
      setData({
        week,
        students: Array.isArray(body?.students) ? body.students : [],
        series: Array.isArray(body?.series) ? body.series : [],
        classes: Array.isArray(body?.classes) ? body.classes : [],
        zoomUrl: typeof body?.zoomUrl === 'string' ? body.zoomUrl : null,
      })
    } catch {
      if (asked.current === week) setLoadError(true)
    }
  }, [week])
  useEffect(() => { reload() }, [reload])

  return { data, ready: data !== null && data.week === week, loadError, reload }
}
