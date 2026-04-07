/**
 * Drizzle ORM Schema — 服务端 SQLite 业务数据库
 *
 * Phase 1: 账号体系
 *   - users / sessions / accounts / verificationTokens
 *
 * Phase 2: 课程与场景 — 服务端真源
 *   - stages / scenes
 *
 * Phase 3: 聊天/大纲/播放/Agent/媒体 — 服务端真源
 *   - chatSessions / stageOutlines / playbackState / generatedAgents / mediaFiles
 *   - 媒体实体文件存服务端文件系统，mediaFiles 只存元数据
 *
 * 设计决策：
 *   - 复杂 JSON 字段（messages / outlines / config / params）使用 JSON TEXT
 *   - 所有业务表通过 stages.id 级联删除
 *   - provider key / 模型配置 不纳入此表，保持服务端配置优先原则
 */

import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

// ─── Users ─────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp' }),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  nickname: text('nickname').default(''),
  bio: text('bio').default(''),
  avatar: text('avatar').default('/avatars/user.png'),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Accounts (Auth.js adapter 要求) ───────────────────────────────
export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

// ─── Sessions ──────────────────────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
});

// ─── Verification Tokens ───────────────────────────────────────────
export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// ─── Stages (课程) ─────────────────────────────────────────────────
export const stages = sqliteTable(
  'stages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').default(''),
    language: text('language').default('zh-CN'),
    style: text('style').default('professional'),
    viewportPreset: text('viewport_preset'),
    viewportSize: integer('viewport_size'),
    viewportRatio: real('viewport_ratio'),
    currentSceneId: text('current_scene_id'),
    agentIds: text('agent_ids', { mode: 'json' }).$type<string[]>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('stages_user_id_idx').on(table.userId),
    index('stages_updated_at_idx').on(table.updatedAt),
  ],
);

// ─── Scenes (场景/页面) ────────────────────────────────────────────
export const scenes = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    stageId: text('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull().default(''),
    order: integer('order').notNull().default(0),
    content: text('content', { mode: 'json' }).$type<Record<string, unknown>>(),
    actions: text('actions', { mode: 'json' }).$type<unknown[]>(),
    whiteboards: text('whiteboards', { mode: 'json' }).$type<unknown[]>(),
    multiAgent: text('multi_agent', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('scenes_stage_id_idx').on(table.stageId),
    index('scenes_stage_order_idx').on(table.stageId, table.order),
  ],
);

// ─── Chat Sessions (聊天会话) ─────────────────────────────────────
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    stageId: text('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull().default(''),
    status: text('status').notNull().default('idle'),
    messages: text('messages', { mode: 'json' }).$type<unknown[]>(),
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
    toolCalls: text('tool_calls', { mode: 'json' }).$type<unknown[]>(),
    sceneId: text('scene_id'),
    lastActionIndex: integer('last_action_index'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('chat_sessions_stage_id_idx').on(table.stageId),
  ],
);

// ─── Stage Outlines (大纲，用于刷新恢复) ──────────────────────────
export const stageOutlines = sqliteTable('stage_outlines', {
  stageId: text('stage_id')
    .primaryKey()
    .references(() => stages.id, { onDelete: 'cascade' }),
  outlines: text('outlines', { mode: 'json' }).$type<unknown[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Playback State (播放状态快照) ────────────────────────────────
export const playbackState = sqliteTable('playback_state', {
  stageId: text('stage_id')
    .primaryKey()
    .references(() => stages.id, { onDelete: 'cascade' }),
  sceneIndex: integer('scene_index').notNull().default(0),
  actionIndex: integer('action_index').notNull().default(0),
  consumedDiscussions: text('consumed_discussions', { mode: 'json' }).$type<string[]>(),
  sceneId: text('scene_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Generated Agents (AI 生成的 agent) ──────────────────────────
export const generatedAgents = sqliteTable(
  'generated_agents',
  {
    id: text('id').primaryKey(),
    stageId: text('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull(),
    persona: text('persona').notNull().default(''),
    avatar: text('avatar').notNull().default('/avatars/teacher.png'),
    color: text('color').notNull().default('#3b82f6'),
    priority: integer('priority').notNull().default(5),
    voiceConfig: text('voice_config', { mode: 'json' }).$type<{ providerId: string; voiceId: string } | null>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('generated_agents_stage_id_idx').on(table.stageId),
  ],
);

// ─── Media Files (媒体元数据，实体文件存服务端文件系统) ──────────
export const mediaFiles = sqliteTable(
  'media_files',
  {
    id: text('id').primaryKey(),
    stageId: text('stage_id')
      .notNull()
      .references(() => stages.id, { onDelete: 'cascade' }),
    elementId: text('element_id').notNull(),
    type: text('type').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull().default(0),
    storageKey: text('storage_key'),
    posterStorageKey: text('poster_storage_key'),
    prompt: text('prompt').notNull().default(''),
    params: text('params', { mode: 'json' }).$type<Record<string, unknown>>(),
    error: text('error'),
    errorCode: text('error_code'),
    ossKey: text('oss_key'),
    posterOssKey: text('poster_oss_key'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('media_files_stage_id_idx').on(table.stageId),
    index('media_files_stage_element_idx').on(table.stageId, table.elementId),
  ],
);
