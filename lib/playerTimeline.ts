// Player del profe (P1) — barra de tiempo de abajo del video: funciones puras.
// Sin React ni DOM: se testean solas (tests/lib/player-timeline.test.ts).
import type { Phrase } from '@/lib/srt'

// Mientras se arrastra la bolita, como mucho un salto cada tantos ms (el stage recibe
// los saltos por BroadcastChannel: sin freno serían cientos por segundo).
export const SEEK_THROTTLE_MS = 80
// Con el stage abierto el tiempo llega ~4 veces por segundo; entre mensaje y mensaje la
// barra avanza sola. Nunca más de este margen (si el stage se colgó, la barra se frena).
export const MAX_EXTRAPOLATE_S = 1

export type PhraseSegment = { idx: number; left: number; width: number; sel: boolean }

// Tramos de cada frase sobre la barra, en % del largo del video. Sin duración → ninguno.
export function phraseSegments(phrases: Phrase[], duration: number): PhraseSegment[] {
  if (!(duration > 0)) return []
  const pct = (t: number) => Math.min(100, Math.max(0, (t / duration) * 100))
  return phrases.map((p, idx) => {
    const left = pct(p.start)
    return { idx, left, width: Math.max(0, pct(p.end) - left), sel: p.sel }
  })
}

// Qué frase suena en el segundo `t` del video (mismo criterio que los subtítulos:
// t - delay dentro de [start, end]). -1 si no hay ninguna.
export function phraseIndexAt(phrases: Phrase[], t: number, delay: number): number {
  const x = t - delay
  return phrases.findIndex(p => x >= p.start && x <= p.end)
}

// Número de la frase dentro de las seleccionadas (1, 2, 3…), o null si no está elegida.
export function selNumber(phrases: Phrase[], idx: number): number | null {
  if (!phrases[idx]?.sel) return null
  return phrases.slice(0, idx + 1).filter(p => p.sel).length
}

// Tiempo "ahora" con el stage abierto: el último que mandó + lo que pasó desde entonces
// (a la velocidad elegida), sin pasarse del margen ni del final del video.
export function extrapolateTime(
  last: { t: number; at: number; playing: boolean; rate: number; duration: number },
  now: number,
): number {
  if (!last.playing) return last.t
  const elapsed = Math.min(MAX_EXTRAPOLATE_S, Math.max(0, (now - last.at) / 1000))
  const t = last.t + elapsed * last.rate
  return last.duration > 0 ? Math.min(last.duration, t) : t
}
