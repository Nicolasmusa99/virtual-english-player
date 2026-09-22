import {
  boolean,
  index,
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
  // ⚠️ NINGUNA credencial vive en esta tabla (ver `userCredentials` más abajo): el
  // adapter de Auth.js y cualquier lectura genérica traen TODAS sus columnas.
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

// --- Login con email+contraseña: la contraseña (F3, reemplaza user.password_hash de F0) ---
// Tabla APARTE a propósito. En F0 el hash vivía en `user`, y la verificación en vivo
// de F3 mostró que eso lo filtraba: el adapter de Auth.js hace SELECT de todas las
// columnas de `user` (getSessionAndUser, getUser, getUserByEmail…) y esa fila
// terminaba en /api/auth/session. Separada, ninguna lectura genérica del usuario
// puede volver a arrastrar el hash: para leerlo hay que ir a buscarlo explícitamente
// (lib/users.ts → getUserForLogin, el único lugar que lo hace).
//   · user_id PK → 1 a 1 con `user`; CASCADE: se borra el usuario, se va su credencial.
//   · SIN fila = la persona todavía no puso contraseña → entra solo con Google.
//   · password_hash: bcrypt cost 12. La contraseña en claro no se guarda ni se loguea
//     NUNCA, y no es recuperable (solo reemplazable por link).
export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// --- Login con email+contraseña: tokens de los links por mail (F0) ---
// 'invite'  = "poné tu primera contraseña" (alta por invitación), vence en 7 días.
// 'reset'   = "olvidé mi contraseña", vence en 1 HORA (corto a propósito).
export const passwordTokenPurpose = pgEnum('password_token_purpose', ['invite', 'reset'])
export type PasswordTokenPurpose = (typeof passwordTokenPurpose.enumValues)[number]

// Tabla PROPIA, deliberadamente separada de `verificationToken` (la del adapter de
// Auth.js): aquella pertenece al Email provider, cuyo link LOGUEA directo. Acá el
// link NO es una puerta de entrada, solo habilita el formulario de poner contraseña
// — si no, un link de invitación robado (7 días) sería un bypass de login.
//   · token_hash: sha256 del token; el token CRUDO nunca se guarda ni se loguea.
//     Hash rápido (no bcrypt) a propósito: son 256 bits aleatorios, no adivinables
//     por diccionario, y así el lookup es por índice único en O(1).
//   · used_at: NULL = sin usar. El consumo es un UPDATE atómico
//     (SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL RETURNING *)
//     → un solo uso garantizado incluso con dos requests simultáneos.
//   · user_id → cascade: si se borra el usuario, sus tokens se van con él.
export const passwordTokens = pgTable(
  'password_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: passwordTokenPurpose('purpose').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('password_tokens_user_id_idx').on(t.userId)]
)

// --- Login con contraseña: freno a la fuerza bruta (F3) ---
// Una fila por "clave" que se está frenando: 'email:<normalizado>' o 'ip:<dirección>'.
// Serverless = sin memoria compartida entre instancias, por eso el contador vive acá.
// La tabla queda acotada por diseño: una fila por email/IP que FALLÓ, y el login
// exitoso borra la del email.
//   · fails / first_fail_at: ventana deslizante (se reinicia si la ventana venció).
//   · locked_until: mientras esté en el futuro, esa clave no puede intentar.
export const loginThrottle = pgTable('login_throttle', {
  key: text('key').primaryKey(),
  fails: integer('fails').notNull().default(0),
  firstFailAt: timestamp('first_fail_at', { mode: 'date' }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { mode: 'date' }),
})
