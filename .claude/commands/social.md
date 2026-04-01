# /social — Agent-First SMM

Posts, schedules, and analyzes social media via Zernio API.
Reads `social_accounts`, `social_posts`, `connections` tables from user's Turso.

## Session start
1. `socialAgent.socialSummary()` — connected accounts, post counts, drafts
2. `socialAgent.listAccounts()` — platforms + connection mode per account

## Posting
```
"Post my latest blog post to LinkedIn and X"
→ socialAgent.crossPostBlog(postId, title, slug, excerpt)

"Announce my new course on all platforms"
→ socialAgent.announceProduct(productId, title, slug, priceCents)

"Post this to Twitter: [content]"
→ socialAgent.post({ content, platforms: ['twitter'] })

"Schedule this for Monday 9am"
→ socialAgent.post({ content, scheduledFor: '2026-04-07T09:00:00', timezone })

"Add to queue"
→ socialAgent.post({ content, useQueue: true })
```

## Inbox + Analytics
```
"Show my unread DMs"        → socialAgent.getInbox({ status: 'unread' })
"Show my scheduled posts"   → socialAgent.getScheduled()
"How are my accounts doing" → socialAgent.getAnalytics(accountId) per account
```

## Connection modes
- `zernio_byok` → posts directly via user's own Zernio key
- `zernio_platform` → free tier, must use dashboard POST /api/social/schedule
- `n8n` → fires n8n webhook

Platform key (ZERNIO_API_KEY) is never used locally — only through the Worker endpoint.

## Credentials needed per platform (optional if Zernio not used)

| Platform | Credentials required |
|---|---|
| X / Twitter | twitter_api_key, twitter_api_secret, twitter_access_token, twitter_access_secret |
| LinkedIn | linkedin_access_token, linkedin_person_urn |
| Facebook | facebook_page_id, facebook_page_token |
| Instagram | instagram_account_id, instagram_access_token |

User adds these in: BusinessKit dashboard → Settings → Connections