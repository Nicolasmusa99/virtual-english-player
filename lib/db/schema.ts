import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
  // Calendario (G0): "Mi sala de Zoom" del profe (su link personal). Las clases sin link
  // propio usan este. NULL = no cargó ninguno. Solo https de zoom.us.
  zoomUrl: text('zoom_url'),
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

// --- Asignar material a alumnos (lado profe) ---
// Una fila = "el alumno tiene acceso a este video de la biblioteca compartida".
// NO guarda captions: es un PUNTERO. La versión que ve el alumno se resuelve en
// read-time por el teacher_id del ALUMNO contra video_sessions (con fallback al
// dueño), NO por assigned_by → así la reasignación de profe (impago) reapunta sola
// a la copia del profe nuevo y el invariante de captions queda intacto.
//   · student_id / video_id  → cascade: si se borra el alumno o el video, la fila se va.
//   · assigned_by            → set null: auditoría (profe o admin); si ese usuario se
//                              borra no arrastra la asignación (acceso ≠ quién asignó).
//   · PK (student_id, video_id): una asignación por par; re-asignar es idempotente.
export const assignments = pgTable(
  'assignments',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.videoId] })]
)

// --- Calendario de clases (fase calendario, C1) ---
// El profe agenda las clases de SUS alumnos. Dos tablas:
//   · class_series: el HORARIO FIJO semanal ("martes 18:00, 60 min"). NO se guardan
//     las clases una por una: las fechas se calculan en read-time (lib/classSchedule.ts)
//     a partir de la serie + sus excepciones, así editar el horario no deja clases
//     viejas colgadas. weekday/start_minute/starts_on/ends_on están en la hora de
//     CLASS_TZ (Buenos Aires); los instantes reales se calculan de ahí.
//   · class_events: las clases SUELTAS (series_id NULL) y las EXCEPCIONES de una serie
//     (series_id + original_starts_at = qué martes reemplaza): cancelarlo o moverlo.
//     Una excepción por ocurrencia (unique series_id + original_starts_at).
// teacher_id = el profe de la clase. El alumno solo ve las de su profe ACTUAL
// (users.teacher_id), igual que la "versión viva" de los subtítulos.
// Todo en cascada: si se borra el profe, el alumno o la serie, sus clases se van.
export const classStatus = pgEnum('class_status', ['scheduled', 'cancelled'])
export type ClassStatus = (typeof classStatus.enumValues)[number]

export const classSeries = pgTable(
  'class_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // 0 = domingo … 6 = sábado
    startMinute: integer('start_minute').notNull(), // minutos desde 00:00 (18:00 → 1080)
    durationMin: integer('duration_min').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(), // 'YYYY-MM-DD', inclusive
    endsOn: date('ends_on', { mode: 'string' }), // NULL = sin fin; inclusive
    meetUrl: text('meet_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('class_series_student_teacher_idx').on(t.studentId, t.teacherId)]
)

export const classEvents = pgTable(
  'class_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => classSeries.id, { onDelete: 'cascade' }),
    originalStartsAt: timestamp('original_starts_at', { mode: 'date', withTimezone: true }),
    startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull(),
    status: classStatus('status').notNull().default('scheduled'),
    meetUrl: text('meet_url'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('class_events_series_original_uq').on(t.seriesId, t.originalStartsAt),
    index('class_events_student_teacher_starts_idx').on(t.studentId, t.teacherId, t.startsAt),
  ]
)
