import React from 'react'

export const SKIP = new Set(['the','and','a','an','in','on','of','to','i','you','my','for','that','this','they','how','with','out','now','not','did','know','your','at','is','was','are','were','be','been','it','he','she','we','as','by','from','but','so','if','or','el','la','los','las','de','en','que','un','una','y','se','no','es','por','con','su','para','lo','le','al','me','te','nos'])

// [Corregida 2026-09-03] Subtítulos en blanco, sin resaltado ámbar (US-014).
// hl() quedó como passthrough: devuelve el texto plano como ReactNode[] — React lo
// escapa, así que sigue a salvo de XSS por SRT. Se conserva SKIP y la maquinaria de
// highlight (arriba, sin usarse) por si se quisiera reactivar el resaltado.
export function hl(text: string): React.ReactNode[] {
  return text ? [text] : []
}
