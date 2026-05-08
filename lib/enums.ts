// lib/enums.ts
// Single source of truth for all status strings used in DB writes.
// Never use raw string literals for statuses in agent files.
// Keep in sync with app repo's src/lib/enums.ts

export const CRM_CONTACT_STATUS = ['lead', 'prospect', 'customer', 'churned', 'archived'] as const
export const CRM_ACTIVITY_APPROVAL = ['pending_approval', 'approved', 'rejected', 'auto_sent'] as const
export const CRM_DEAL_STAGE = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'] as const
export const SOCIAL_POST_STATUS = ['draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled'] as const
export const AGENT_NOTE_STATUS = ['inbox', 'processing', 'done', 'archived'] as const
export const AGENT_TASK_STATUS = ['pending', 'active', 'running', 'done', 'paused', 'failed', 'cancelled'] as const
export const AGENT_KB_ENTRY_TYPE = ['entity', 'concept', 'source', 'synthesis', 'index'] as const
export const APPROVAL_STATUS = ['pending_approval', 'approved', 'rejected', 'auto_sent'] as const
export const COMMUNITY_POST_STATUS = ['published', 'removed', 'pending'] as const
export const EMAIL_EVENT_TYPE = ['delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed'] as const
export const AFFILIATE_COMMISSION = ['pending', 'approved', 'paid', 'void'] as const

export type CRMContactStatus = typeof CRM_CONTACT_STATUS[number]
export type CRMActivityApproval = typeof CRM_ACTIVITY_APPROVAL[number]
export type CRMDealStage = typeof CRM_DEAL_STAGE[number]
export type SocialPostStatus = typeof SOCIAL_POST_STATUS[number]
export type AgentNoteStatus = typeof AGENT_NOTE_STATUS[number]
export type AgentTaskStatus = typeof AGENT_TASK_STATUS[number]
export type AgentKBEntryType = typeof AGENT_KB_ENTRY_TYPE[number]
export type ApprovalStatus = typeof APPROVAL_STATUS[number]