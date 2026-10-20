// Player del profe — la ayuda de los atajos de teclado y de los modos (paso 5): los textos y
// la regla de cuándo NO disparar un atajo. Sin React: tests/lib/shortcuts.test.ts.
// La LÓGICA de los atajos y de los modos sigue en app/page.tsx; esto solo la explica.

export type Shortcut = { keys: string; name: string; what: string; help: string }

// En el mismo orden que el handler de app/page.tsx.
export const SHORTCUTS: Shortcut[] = [
  { keys: 'Espacio', name: 'Espacio', what: 'Play o pausa', help: 'Arranca o frena el video.' },
  { keys: '→', name: 'Flecha derecha', what: 'Frase siguiente', help: 'Mantené apretado → para avanzar rápido, de frase en frase.' },
  { keys: '←', name: 'Flecha izquierda', what: 'Frase anterior', help: 'Mantené apretado ← para retroceder rápido, de frase en frase.' },
  { keys: '↓', name: 'Flecha abajo', what: 'Repetir la frase', help: 'Vuelve al principio de la frase que está sonando.' },
  { keys: '↑', name: 'Flecha arriba', what: 'Retroceder un poco', help: 'Vuelve hasta 2 segundos, sin salir de la frase.' },
]

export const SHORTCUTS_NOTE = 'Los atajos no andan mientras escribís en un campo.'

export type Mode = 'autoPause' | 'practice' | 'loop' | 'hide'

// Qué hace cada modo (tooltip del botón).
export const MODE_HELP: Record<Mode, string> = {
  autoPause: 'Pausa sola al terminar cada frase, para repetir o explicar.',
  practice: 'Reproduce solo las frases que elegiste (tildadas).',
  loop: 'Repite la frase actual una y otra vez hasta que lo saques.',
  hide: 'Esconde el texto para escuchar sin leer.',
}
// Práctica sin frases tildadas está desactivado: se dice por qué.
export const PRACTICE_NEEDS_SELECTION = 'Para usarlo, tildá al menos una frase.'

// Marca para los elementos donde el teclado es suyo (el botón de ayuda y su panel, un
// tooltip): ahí no se dispara ningún atajo de reproducción.
export const KB_IGNORE_ATTR = 'data-kb-ignore'

// ¿Este evento de teclado NO tiene que disparar un atajo del player? Cuando se escribe
// (input, textarea, select, contenteditable) o el foco está en la ayuda.
export function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null
  if (!el || typeof el.tagName !== 'string') return false
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return true
  return typeof el.closest === 'function' && el.closest(`[${KB_IGNORE_ATTR}]`) !== null
}
