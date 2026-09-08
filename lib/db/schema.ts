import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

// --- Roles (Fase 1) ---
// Nadie se autoasigna rol: el registro es siempre por invitación desde arriba.
// La columna es NULLABLE a propósito: NULL = "sin rol" = sin acceso (fail-closed).
export const userRole = pgEnum('user_role', ['admin', 'profesor', 'alumno'])
export type Role = (typeof userRole.enumValues)[number]
export function isRole(x: unknown): x is Role {
  return x === 'admin' || x === 'profesor' || x === 'alumno'
}

// --- Biblioteca compartida ---
// Un video publicado tiene UN tipo y UN nivel (listas fijas). NULL en las tres
// columnas de `videos` = no publicado (el discriminador real es publishedAt).
export const sharedType = pgEnum('shared_type', ['pelicula', 'cancion'])
export type SharedType = (typeof sharedType.enumValues)[number]
export function isSharedType(x: unknown): x is SharedType {
  return x === 'pelicula' || x === 'cancion'
}

export const sharedLevel = pgEnum('shared_level', ['beginner', 'medium', 'advance'])
export type SharedLevel = (typeof sharedLevel.enumValues)[number]
export function isSharedLevel(x: unknown): x is SharedLevel {
  return x === 'beginner' || x === 'medium' || x === 'advance'
}

// --- Auth.js (NextAuth v5) adapter tables — schema shape required by @auth/drizzle-adapter ---

export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // Fase 1 — roles y permisos:
  role: userRole('role'), // NULL = sin acceso hasta que un admin/profesor asigne rol
  // Relación profesor→alumno (opción A): el alumno pertenece a UN profesor.
  // NULL = sin profe asignado. El estado "sin profe activo" por impago se derivará
  // de la flag de pago del profesor (Fase de pagos); no se borra teacherId.
  teacherId: uuid('teacher_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
})

export const accounts = pgTable(
  'account',
  {
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
)

// --- App tables: video library ---

export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  originalName: text('original_name').notNull(),
  sizeBytes: numeric('size_bytes', { mode: 'number' }).notNull(),
  durationSec: numeric('duration_sec', { mode: 'number' }),
  mimeType: text('mime_type').notNull(),
  storageUrl: text('storage_url'),
  status: text('status').notNull().default('uploading'), // 'uploading' | 'ready' | 'failed' | 'expired'
  // Biblioteca compartida: NULL = privado (comportamiento actual intacto).
  // Publicar = setear los tres; despublicar = publishedAt→NULL (tipo/nivel se
  // conservan para recordar la clasificación si se republica).
  sharedType: sharedType('shared_type'),
  sharedLevel: sharedLevel('shared_level'),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// PK compuesto (video_id, user_id): una fila de sesión por (video, usuario).
// La fila del DUEÑO es la sesión original; cada profe que edita un video
// compartido obtiene SU propia fila (copy-on-write). El user_id sale SIEMPRE
// de la sesión del server en las rutas, nunca del body: por eso la fila del
// dueño es inalcanzable para un profe. Ver /api/videos/[id]/session.
export const videoSessions = pgTable(
  'video_sessions',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    srtSource: text('srt_source'), // 'gemini' | 'srt-upload'
    phrases: jsonb('phrases').notNull(), // Phrase[] from lib/srt.ts
    delay: numeric('delay', { mode: 'number' }).notNull().default(0),
    speedIdx: integer('speed_idx').notNull().default(2),
    ccOn: boolean('cc_on').notNull().default(true),
    filter: text('filter').notNull().default('all'), // 'all' | 'sel'
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] })]
)
