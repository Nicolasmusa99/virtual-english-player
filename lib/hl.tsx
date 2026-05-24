export const SKIP = new Set(['the','and','a','an','in','on','of','to','i','you','my','for','that','this','they','how','with','out','now','not','did','know','your','at','is','was','are','were','be','been','it','he','she','we','as','by','from','but','so','if','or','el','la','los','las','de','en','que','un','una','y','se','no','es','por','con','su','para','lo','le','al','me','te','nos'])

export function hl(text: string): string {
  return text.split(' ').map(w => {
    const c = w.replace(/[.,!?;'"—\-¿¡:]/g, '').toLowerCase()
    return (!SKIP.has(c) && c.length > 3) ? `<span style="color:#E8C547">${w}</span>` : w
  }).join(' ')
}
