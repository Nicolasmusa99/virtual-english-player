// @vitest-environment node
// F1 — URL base de la app (lib/appUrl.ts). De acá salen los links que van por mail,
// así que lo central es que NUNCA dependa de nada que mande el cliente.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appBaseUrl, appUrl } from '@/lib/appUrl'

const ENV_KEYS = ['APP_BASE_URL', 'AUTH_URL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
const ORIGINAL = { ...process.env }

beforeEach(() => { for (const k of ENV_KEYS) delete process.env[k] })
afterEach(() => { process.env = { ...ORIGINAL } })

describe('appBaseUrl — orden de resolución', () => {
  it('APP_BASE_URL gana sobre todo lo demás', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.vercel.app'
    process.env.AUTH_URL = 'https://auth.example'
    process.env.APP_BASE_URL = 'https://mi-dominio.com'
    expect(appBaseUrl()).toBe('https://mi-dominio.com')
  })

  it('AUTH_URL se usa si no hay APP_BASE_URL', () => {
    process.env.AUTH_URL = 'https://auth.example'
    expect(appBaseUrl()).toBe('https://auth.example')
  })

  it('en producción prefiere el dominio ESTABLE, no la URL del deploy', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'virtual-english-player.vercel.app'
    process.env.VERCEL_URL = 'virtual-english-player-abc123.vercel.app' // cambia en cada deploy
    expect(appBaseUrl()).toBe('https://virtual-english-player.vercel.app')
  })

  it('en preview usa la URL de ESE deploy', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'virtual-english-player.vercel.app'
    process.env.VERCEL_URL = 'preview-abc123.vercel.app'
    // Clave: un preview NO puede mandar links que apunten a producción.
    expect(appBaseUrl()).toBe('https://preview-abc123.vercel.app')
  })

  it('sin nada configurado, cae a localhost (desarrollo)', () => {
    expect(appBaseUrl()).toBe('http://localhost:3000')
  })

  it('saca la barra final para no duplicarla al concatenar', () => {
    process.env.APP_BASE_URL = 'https://mi-dominio.com///'
    expect(appBaseUrl()).toBe('https://mi-dominio.com')
  })
})

describe('appUrl', () => {
  it('arma la URL absoluta con o sin barra inicial', () => {
    process.env.APP_BASE_URL = 'https://mi-dominio.com'
    expect(appUrl('/set-password?token=abc')).toBe('https://mi-dominio.com/set-password?token=abc')
    expect(appUrl('set-password')).toBe('https://mi-dominio.com/set-password')
  })
})

describe('SEGURIDAD — host header poisoning', () => {
  it('appBaseUrl no recibe ningún parámetro: es imposible alimentarla con el Host del request', () => {
    // Si alguna vez alguien le agrega un argumento (p. ej. `req`), este test cae y
    // obliga a revisar: un link de reset armado con el Host del atacante le entrega
    // el token de la víctima cuando la víctima lo clickea.
    expect(appBaseUrl.length).toBe(0)
  })
})
