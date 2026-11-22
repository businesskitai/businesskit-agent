/**
 * social-service.ts — Full Drizzle ORM implementation
 *
 * All social media data access for UserDB.
 * Uses UserDB (Drizzle instance) — never raw Client.execute().
 */

import { eq, and, desc, asc, count } from "drizzle-orm";
import type { UserDB } from "~/lib/user-db";
import {
  socialAccounts,
  socialPostGroups,
  socialPosts,
  socialQueue,
  socialAnalytics,
  socialInbox,
  socialLabels,
} from "~/db/user-schema";

// Re-export connections API — it lives in its own standalone service
export type {
  Connection,
  CreateConnectionInput,
} from "~/lib/connections-service";
export {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deactivateConnection,
} from "~/lib/connections-service";

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle inferred types
// ─────────────────────────────────────────────────────────────────────────────
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type SocialPost = typeof socialPosts.$inferSelect;
export type SocialPostGroup = typeof socialPostGroups.$inferSelect;
export type SocialQueueSlot = typeof socialQueue.$inferSelect;
export type SocialAnalytics = typeof socialAnalytics.$inferSelect;
export type SocialInboxItem = typeof socialInbox.$inferSelect;
export type SocialLabel = typeof socialLabels.$inferSelect;



export async function listAccounts(
  db: UserDB,
  profileId: string,
  opts?: { platform?: string; activeOnly?: boolean }
): Promise<SocialAccount[]> {
  const conditions = [eq(socialAccounts.profileId, profileId)];
  if (opts?.platform) conditions.push(eq(socialAccounts.platform, opts.platform));
  if (opts?.activeOnly) {
    conditions.push(eq(socialAccounts.isActive, 1));
    conditions.push(eq(socialAccounts.isConnected, 1));
  }
  return db
    .select()
    .from(socialAccounts)
    .where(and(...conditions))
    .orderBy(desc(socialAccounts.connectedAt))
    .all();
}

export async function getAccount(
  db: UserDB,
  id: string,
  profileId: string
): Promise<SocialAccount | undefined> {
  return db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.profileId, profileId)))
    .get();
}

export async function upsertAccount(
  db: UserDB,
  profileId: string,
  data: {
    connectionId: string;
    connectionMode: string;
    zernioAccountId?: string | null;
    zernioProfileId?: string | null;
    platform: string;
    platformUsername?: string | null;
    platformUserId?: string | null;
    platformDisplayName?: string | null;
    platformAvatarUrl?: string | null;
    followerCount?: number;
    followingCount?: number;
    defaultTimezone?: string;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(socialAccounts)
    .values({
      id,
      profileId,
      connectionId: data.connectionId,
      connectionMode: data.connectionMode,
      zernioAccountId: data.zernioAccountId ?? null,
      zernioProfileId: data.zernioProfileId ?? null,
      platform: data.platform,
      platformUsername: data.platformUsername ?? null,
      platformUserId: data.platformUserId ?? null,
      platformDisplayName: data.platformDisplayName ?? null,
      platformAvatarUrl: data.platformAvatarUrl ?? null,
      followerCount: data.followerCount ?? 0,
      followingCount: data.followingCount ?? 0,
      defaultTimezone: data.defaultTimezone ?? "UTC",
    })
    .onConflictDoUpdate({
      target: socialAccounts.zernioAccountId,
      set: {
        isConnected: 1,
        tokenStatus: "valid",
        platformUsername: data.platformUsername ?? null,
        platformDisplayName: data.platformDisplayName ?? null,
        platformAvatarUrl: data.platformAvatarUrl ?? null,
        followerCount: data.followerCount ?? 0,
        followingCount: data.followingCount ?? 0,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    });
  return id;
}

export async function disconnectAccount(
  db: UserDB,
  id: string,
  profileId: string
): Promise<void> {
  await db
    .update(socialAccounts)
    .set({
      isConnected: 0,
      tokenStatus: "revoked",
      disconnectedAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.profileId, profileId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Social Posts
// ─────────────────────────────────────────────────────────────────────────────

export async function listPosts(
  db: UserDB,
  profileId: string,
  opts?: { status?: string; limit?: number; offset?: number; from?: string; to?: string }
): Promise<SocialPost[]> {
  const { limit = 50, offset = 0 } = opts ?? {};
  const conditions = [
    eq(socialPosts.profileId, profileId),
    eq(socialPosts.hidden, 0),
  ];
  if (opts?.status) conditions.push(eq(socialPosts.status, opts.status));
  return db
    .select()
    .from(socialPosts)
    .where(and(...conditions))
    .orderBy(desc(socialPosts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function getPost(
  db: UserDB,
  id: string,
  profileId: string
): Promise<SocialPost | undefined> {
  return db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.profileId, profileId)))
    .get();
}

export type CreatePostInput = {
  accountId: string;
  platform: string;
  groupId?: string | null;
  content: string;
  mediaItems?: string;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  linkThumbnailUrl?: string | null;
  platformSpecificData?: string;
  status?: string;
  scheduledFor?: string | null;
  timezone?: string;
  publishNow?: number;
  useQueue?: number;
  source?: string | null;
  sourceId?: string | null;
  aiGenerated?: number;
  aiPrompt?: string | null;
  labels?: string;
  zernioPostId?: string | null;
  zernioAccountId?: string | null;
  scheduledVia?: string;
  platformScheduleMonth?: string | null;
};

export async function createPost(
  db: UserDB,
  profileId: string,
  data: CreatePostInput
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(socialPosts).values({
    id,
    profileId,
    accountId: data.accountId,
    platform: data.platform,
    groupId: data.groupId ?? null,
    content: data.content,
    mediaItems: data.mediaItems ?? "[]",
    linkUrl: data.linkUrl ?? null,
    linkTitle: data.linkTitle ?? null,
    linkDescription: data.linkDescription ?? null,
    linkThumbnailUrl: data.linkThumbnailUrl ?? null,
    platformSpecificData: data.platformSpecificData ?? "{}",
    status: data.status ?? "draft",
    scheduledFor: data.scheduledFor ?? null,
    timezone: data.timezone ?? "UTC",
    publishNow: data.publishNow ?? 0,
    useQueue: data.useQueue ?? 0,
    source: data.source ?? "manual",
    sourceId: data.sourceId ?? null,
    aiGenerated: data.aiGenerated ?? 0,
    aiPrompt: data.aiPrompt ?? null,
    labels: data.labels ?? "[]",
    zernioPostId: data.zernioPostId ?? null,
    zernioAccountId: data.zernioAccountId ?? null,
    scheduledVia: data.scheduledVia ?? "byok",
    platformScheduleMonth: data.platformScheduleMonth ?? null,
  });
  return id;
}

export async function updatePost(
  db: UserDB,
  id: string,
  profileId: string,
  data: Partial<typeof socialPosts.$inferInsert>
): Promise<void> {
  await db
    .update(socialPosts)
    .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.profileId, profileId)));
}

export async function deletePost(
  db: UserDB,
  id: string,
  profileId: string
): Promise<void> {
  await db
    .update(socialPosts)
    .set({ hidden: 1, status: "cancelled", updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.profileId, profileId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Social Post Platforms
// ─────────────────────────────────────────────────────────────────────────────

export async function createPostGroup(
  db: UserDB,
  profileId: string,
  data: { name?: string; sourceContent?: string; platformCount: number }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(socialPostGroups).values({
    id,
    profileId,
    name: data.name ?? null,
    sourceContent: data.sourceContent ?? null,
    platformCount: data.platformCount,
  });
  return id;
}

export async function markPostPublished(
  db: UserDB,
  zernioPostId: string,
  platform: string,
  platformPostId: string,
  platformPostUrl?: string | null
): Promise<void> {
  await db
    .update(socialPosts)
    .set({
      status: "published",
      platformPostId,
      platformPostUrl: platformPostUrl ?? null,
      publishedAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(
      and(
        eq(socialPosts.zernioPostId, zernioPostId),
        eq(socialPosts.platform, platform)
      )
    );
}

export async function markPostFailed(
  db: UserDB,
  zernioPostId: string,
  platform: string,
  error: string
): Promise<void> {
  await db
    .update(socialPosts)
    .set({ status: "failed", error, updatedAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(socialPosts.zernioPostId, zernioPostId),
        eq(socialPosts.platform, platform)
      )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue
// ─────────────────────────────────────────────────────────────────────────────

export async function listQueueSlots(
  db: UserDB,
  profileId: string,
  accountId?: string
): Promise<SocialQueueSlot[]> {
  const conditions = [eq(socialQueue.profileId, profileId)];
  if (accountId) conditions.push(eq(socialQueue.accountId, accountId));
  return db
    .select()
    .from(socialQueue)
    .where(and(...conditions))
    .orderBy(asc(socialQueue.dayOfWeek), asc(socialQueue.timeOfDay))
    .all();
}

export async function createQueueSlot(
  db: UserDB,
  profileId: string,
  data: {
    accountId: string;
    dayOfWeek: number;
    timeOfDay: string;
    timezone?: string;
    zernioSlotId?: string | null;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(socialQueue).values({
    id,
    profileId,
    accountId: data.accountId,
    dayOfWeek: data.dayOfWeek,
    timeOfDay: data.timeOfDay,
    timezone: data.timezone ?? "UTC",
    zernioSlotId: data.zernioSlotId ?? null,
  });
  return id;
}

export async function updateQueueSlot(
  db: UserDB,
  id: string,
  profileId: string,
  data: Partial<Pick<SocialQueueSlot, "dayOfWeek" | "timeOfDay" | "timezone" | "isActive">>
): Promise<void> {
  await db
    .update(socialQueue)
    .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(socialQueue.id, id), eq(socialQueue.profileId, profileId)));
}

export async function deleteQueueSlot(
  db: UserDB,
  id: string,
  profileId: string
): Promise<void> {
  await db
    .delete(socialQueue)
    .where(and(eq(socialQueue.id, id), eq(socialQueue.profileId, profileId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

export async function getAccountAnalytics(
  db: UserDB,
  accountId: string
): Promise<SocialAnalytics | undefined> {
  return db
    .select()
    .from(socialAnalytics)
    .where(eq(socialAnalytics.accountId, accountId))
    .get();
}

export async function upsertAccountAnalytics(
  db: UserDB,
  profileId: string,
  accountId: string,
  data: Partial<typeof socialAnalytics.$inferInsert>
): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .insert(socialAnalytics)
    .values({ id, profileId, accountId, ...data })
    .onConflictDoUpdate({
      target: socialAnalytics.accountId,
      set: { ...data, updatedAt: Math.floor(Date.now() / 1000) },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox
// ─────────────────────────────────────────────────────────────────────────────

export async function listInboxItems(
  db: UserDB,
  profileId: string,
  opts?: { type?: string; platform?: string; status?: string; limit?: number; offset?: number }
): Promise<SocialInboxItem[]> {
  const { limit = 50, offset = 0 } = opts ?? {};
  const conditions = [eq(socialInbox.profileId, profileId)];
  if (opts?.type) conditions.push(eq(socialInbox.type, opts.type));
  if (opts?.platform) conditions.push(eq(socialInbox.platform, opts.platform));
  if (opts?.status) conditions.push(eq(socialInbox.status, opts.status));
  return db
    .select()
    .from(socialInbox)
    .where(and(...conditions))
    .orderBy(desc(socialInbox.receivedAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function getInboxItem(
  db: UserDB,
  id: string,
  profileId: string
): Promise<SocialInboxItem | undefined> {
  return db
    .select()
    .from(socialInbox)
    .where(and(eq(socialInbox.id, id), eq(socialInbox.profileId, profileId)))
    .get();
}

export async function getInboxItemByThread(
  db: UserDB,
  zernioThreadId: string
): Promise<SocialInboxItem | undefined> {
  return db
    .select()
    .from(socialInbox)
    .where(eq(socialInbox.zernioThreadId, zernioThreadId))
    .get();
}

export async function getInboxItemByMessage(
  db: UserDB,
  zernioMessageId: string
): Promise<SocialInboxItem | undefined> {
  return db
    .select()
    .from(socialInbox)
    .where(eq(socialInbox.zernioMessageId, zernioMessageId))
    .get();
}

export async function insertInboxItem(
  db: UserDB,
  profileId: string,
  data: {
    accountId: string;
    inboxSource?: string;
    zernioThreadId?: string | null;
    zernioMessageId?: string | null;
    type: string;
    platform: string;
    senderPlatformId?: string | null;
    senderUsername?: string | null;
    senderDisplayName?: string | null;
    senderAvatarUrl?: string | null;
    senderFollowerCount?: number | null;
    crmContactId?: string | null;
    postId?: string | null;
    platformPostId?: string | null;
    content?: string | null;
    mediaUrls?: string;
    rating?: number | null;
    reviewTitle?: string | null;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(socialInbox).values({
    id,
    profileId,
    accountId: data.accountId,
    inboxSource: data.inboxSource ?? "zernio",
    zernioThreadId: data.zernioThreadId ?? null,
    zernioMessageId: data.zernioMessageId ?? null,
    type: data.type,
    platform: data.platform,
    senderPlatformId: data.senderPlatformId ?? null,
    senderUsername: data.senderUsername ?? null,
    senderDisplayName: data.senderDisplayName ?? null,
    senderAvatarUrl: data.senderAvatarUrl ?? null,
    senderFollowerCount: data.senderFollowerCount ?? null,
    crmContactId: data.crmContactId ?? null,
    postId: data.postId ?? null,
    platformPostId: data.platformPostId ?? null,
    content: data.content ?? null,
    mediaUrls: data.mediaUrls ?? "[]",
    rating: data.rating ?? null,
    reviewTitle: data.reviewTitle ?? null,
  });
  return id;
}

export async function markInboxReplied(
  db: UserDB,
  id: string,
  profileId: string,
  replyContent: string,
  repliedBy: "agent" | "user"
): Promise<void> {
  await db
    .update(socialInbox)
    .set({
      status: "replied",
      replyContent,
      repliedAt: Math.floor(Date.now() / 1000),
      repliedBy,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(and(eq(socialInbox.id, id), eq(socialInbox.profileId, profileId)));
}

export async function archiveInboxItem(
  db: UserDB,
  id: string,
  profileId: string
): Promise<void> {
  await db
    .update(socialInbox)
    .set({ status: "archived", updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(socialInbox.id, id), eq(socialInbox.profileId, profileId)));
}

export async function linkInboxToCrm(
  db: UserDB,
  id: string,
  profileId: string,
  crmContactId: string
): Promise<void> {
  await db
    .update(socialInbox)
    .set({ crmContactId, updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(socialInbox.id, id), eq(socialInbox.profileId, profileId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export async function listLabels(
  db: UserDB,
  profileId: string
): Promise<SocialLabel[]> {
  return db
    .select()
    .from(socialLabels)
    .where(eq(socialLabels.profileId, profileId))
    .orderBy(desc(socialLabels.usageCount), asc(socialLabels.name))
    .all();
}

export async function createLabel(
  db: UserDB,
  profileId: string,
  data: { name: string; color?: string; icon?: string | null }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(socialLabels).values({
    id,
    profileId,
    name: data.name,
    color: data.color ?? "#6366f1",
    icon: data.icon ?? null,
  });
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Free-tier cap helpers
// ─────────────────────────────────────────────────────────────────────────────

export const FREE_TIER_CAP = 20;

export async function countPlatformScheduledThisMonth(
  db: UserDB,
  profileId: string,
  monthYear: string
): Promise<number> {
  const result = await db
    .select({ cnt: count() })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.profileId, profileId),
        eq(socialPosts.scheduledVia, "platform"),
        eq(socialPosts.platformScheduleMonth, monthYear)
      )
    )
    .get();
  return result?.cnt ?? 0;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Zernio API helpers (no DB — pure fetch wrappers)
// ─────────────────────────────────────────────────────────────────────────────

export const ZERNIO_BASE = "https://api.zernio.com/v1";

export interface ZernioPostPayload {
  content: string;
  accountIds: string[];
  mediaItems?: { url: string; type: "image" | "video" | "document" }[];
  linkUrl?: string;
  scheduledFor?: string;
  timezone?: string;
  publishNow?: boolean;
  useQueue?: boolean;
  platformSpecificData?: Record<string, unknown>;
}

export interface ZernioPostResponse {
  id: string;
  status: string;
  scheduledFor?: string;
  accounts?: { accountId: string; platform: string }[];
}

export async function callZernioCreatePost(
  apiKey: string,
  payload: ZernioPostPayload
): Promise<ZernioPostResponse> {
  const res = await fetch(`${ZERNIO_BASE}/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zernio API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ZernioPostResponse>;
}

export async function callZernioDeletePost(
  apiKey: string,
  zernioPostId: string
): Promise<void> {
  const res = await fetch(`${ZERNIO_BASE}/posts/${zernioPostId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Zernio delete error ${res.status}`);
  }
}

export async function callZernioGetAnalytics(
  apiKey: string,
  accountId: string
): Promise<unknown> {
  const res = await fetch(`${ZERNIO_BASE}/analytics?accountId=${accountId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Zernio analytics error ${res.status}`);
  return res.json();
}

export async function callZernioInboxReply(
  apiKey: string,
  threadId: string,
  content: string
): Promise<void> {
  const res = await fetch(`${ZERNIO_BASE}/inbox/comments/${threadId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Zernio inbox reply error ${res.status}`);
}
