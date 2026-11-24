import type { NextConfig } from 'next'

// Cabeceras de seguridad para todas las respuestas (2026-11).
//   · X-Frame-Options / frame-ancestors: nadie puede meter la app dentro de un iframe
//     (clickjacking). La app no se embebe en ningún lado: el escenario y los ejercicios
//     son ventanas, no iframes.
//   · nosniff: el navegador respeta el tipo de archivo declarado.
//   · Referrer-Policy: al salir a otro sitio (Zoom) no viaja la dirección interna.
//   · HSTS: siempre https.
//   · Permissions-Policy: la app no usa cámara, micrófono ni ubicación.
// Falta a propósito una Content-Security-Policy completa (script-src): hay que probarla
// contra Google, Vercel Blob, el wasm de audio y PostHog antes de activarla.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // (2026-11-23) /api/transcribe saca el audio del video con el ffmpeg de ffmpeg-static
  // (lib/audio.ts) antes de mandarlo a Groq. El binario no se empaqueta y se incluye
  // tal cual en la función de esa ruta.
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: { '/api/transcribe': ['./node_modules/ffmpeg-static/ffmpeg'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
export default nextConfig
