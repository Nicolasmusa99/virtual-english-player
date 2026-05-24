import React from 'react'

export const SKIP = new Set(['the','and','a','an','in','on','of','to','i','you','my','for','that','this','they','how','with','out','now','not','did','know','your','at','is','was','are','were','be','been','it','he','she','we','as','by','from','but','so','if','or','el','la','los','las','de','en','que','un','una','y','se','no','es','por','con','su','para','lo','le','al','me','te','nos'])

export function hl(text: string): React.ReactNode[] {
  if (!text) return []
  return text.split(' ').flatMap((w, i) => {
    const c = w.replace(/[.,!?;'"—\-¿¡:]/g, '').toLowerCase()
    const node: React.ReactNode = (!SKIP.has(c) && c.length > 3)
      ? <span key={i} style={{ color: '#E8C547' }}>{w}</span>
      : w
    return i === 0 ? [node] : [' ', node]
  })
}
