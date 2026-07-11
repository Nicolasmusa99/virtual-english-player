import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

// --- Auth.js (NextAuth v5) adapter tables — schema shape required by @auth/drizzle-adapter ---

export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
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
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const videoSessions = pgTable('video_sessions', {
  videoId: uuid('video_id')
    .primaryKey()
    .references(() => videos.id, { onDelete: 'cascade' }),
  srtSource: text('srt_source'), // 'gemini' | 'srt-upload'
  phrases: jsonb('phrases').notNull(), // Phrase[] from lib/srt.ts
  delay: numeric('delay', { mode: 'number' }).notNull().default(0),
  speedIdx: integer('speed_idx').notNull().default(2),
  ccOn: boolean('cc_on').notNull().default(true),
  filter: text('filter').notNull().default('all'), // 'all' | 'sel'
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})
