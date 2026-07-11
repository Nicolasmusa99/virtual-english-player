import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { videos } from '@/lib/db/schema'
import { getOwnedVideo, getUsedBytes, QUOTA_BYTES } from '@/lib/library'

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = session.user.id

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { videoId } = JSON.parse(clientPayload ?? '{}')
        const video = await getOwnedVideo(userId, videoId)
        if (!video) throw new Error('Video no encontrado')

        const used = await getUsedBytes(userId)
        if (used + Number(video.sizeBytes) > QUOTA_BYTES) {
          throw new Error('Tu biblioteca alcanzó el límite de espacio.')
        }

        return {
          allowedContentTypes: ['video/mp4', 'video/x-msvideo', 'video/x-matroska', 'video/quicktime', 'video/webm'],
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ videoId }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { videoId } = JSON.parse(tokenPayload ?? '{}')
        await db.update(videos)
          .set({ storageUrl: blob.url, status: 'ready', updatedAt: new Date() })
          .where(eq(videos.id, videoId))
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
