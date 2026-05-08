// lib/groups.ts — P0-4: CRM groups via junction table
// Replaces LIKE '%grp_x%' which is O(N), un-indexable, and has
// substring collision bug (grp_0055 matches grp_005).
//
// Requires: crm_contact_groups junction table (app-side migration).
// Gate on schema version before switching — see P1-1 in task spec.
//
// Old (delete everywhere):
//   WHERE groups LIKE '%grp_005%'
//   UPDATE crm_contacts SET groups = json_insert(groups, '$[#]', 'grp_005') WHERE id = ?
//
// New (use these helpers):

import { db } from './db.ts'
import { iso } from './id.ts'

/**
 * Get contacts in a group — indexed, no substring collision.
 */
export async function getContactsByGroup(
    profileId: string,
    groupId: string,
    limit = 50,
    offset = 0,
): Promise<unknown[]> {
    const { rows } = await db.execute({
        sql: `SELECT c.*
          FROM crm_contacts c
          JOIN crm_contact_groups ccg ON ccg.contact_id = c.id
          WHERE ccg.group_id = ?
            AND c.profile_id = ?
            AND c.archived   = 0
          ORDER BY c.last_activity_at DESC
          LIMIT ? OFFSET ?`,
        args: [groupId, profileId, limit, offset],
    })
    return rows
}

/**
 * Add contact to group — idempotent (INSERT OR IGNORE).
 * Also increments contact_count on crm_groups.
 */
export async function addContactToGroup(
    profileId: string,
    contactId: string,
    groupId: string,
): Promise<void> {
    await db.txn([
        {
            sql: `INSERT OR IGNORE INTO crm_contact_groups
             (contact_id, group_id, profile_id, created_at)
             VALUES (?, ?, ?, ?)`,
            args: [contactId, groupId, profileId, iso()],
        },
        {
            // Only increment if the row was actually new
            sql: `UPDATE crm_groups
             SET contact_count = (
               SELECT COUNT(*) FROM crm_contact_groups WHERE group_id = ?
             )
             WHERE id = ? AND profile_id = ?`,
            args: [groupId, groupId, profileId],
        },
    ])
}

/**
 * Remove contact from group.
 */
export async function removeContactFromGroup(
    profileId: string,
    contactId: string,
    groupId: string,
): Promise<void> {
    await db.txn([
        {
            sql: `DELETE FROM crm_contact_groups
             WHERE contact_id = ? AND group_id = ?`,
            args: [contactId, groupId],
        },
        {
            sql: `UPDATE crm_groups
             SET contact_count = MAX(0, (
               SELECT COUNT(*) FROM crm_contact_groups WHERE group_id = ?
             ))
             WHERE id = ? AND profile_id = ?`,
            args: [groupId, groupId, profileId],
        },
    ])
}

/**
 * Get all groups for a contact.
 */
export async function getGroupsForContact(
    profileId: string,
    contactId: string,
): Promise<unknown[]> {
    const { rows } = await db.execute({
        sql: `SELECT g.*
          FROM crm_groups g
          JOIN crm_contact_groups ccg ON ccg.group_id = g.id
          WHERE ccg.contact_id = ?
            AND g.profile_id   = ?`,
        args: [contactId, profileId],
    })
    return rows
}

/**
 * Schema-version check — gate P0-4 on this.
 * Returns true when crm_contact_groups table exists in UserDB.
 */
export async function hasGroupsJunction(): Promise<boolean> {
    try {
        await db.execute(`SELECT 1 FROM crm_contact_groups LIMIT 0`)
        return true
    } catch {
        return false
    }
}