import { describe, expect, it } from 'vitest'
import { isVercelBlobUrl } from '@/lib/blobUrl'

describe('isVercelBlobUrl', () => {
  it('acepta una URL https de Vercel Blob', () => {
    expect(isVercelBlobUrl('https://abc123.public.blob.vercel-storage.com/videos/1/a.mp4')).toBe(true)
  })
  it.each([
    'http://abc123.public.blob.vercel-storage.com/a.mp4',
    'https://evil.com/a.mp4',
    'https://abc.public.blob.vercel-storage.com.evil.com/a.mp4',
    'https://user:pw@abc.public.blob.vercel-storage.com/a.mp4',
    'https://abc.public.blob.vercel-storage.com:8443/a.mp4',
    'https://169.254.169.254/latest/meta-data',
    'http://localhost:3000/api/users',
    'no es una url', '', null, 42,
  ])('rechaza %s', (x) => { expect(isVercelBlobUrl(x)).toBe(false) })
})
