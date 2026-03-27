# /social — Post to Social Platforms

Posts directly to X, LinkedIn, Facebook, Instagram using tokens from credentials table.
No n8n required. Works in Claude Code, Cowork, and terminal.

1. `socialAgent.configuredPlatforms()` → show which platforms have tokens saved
2. If none configured: tell user to add credentials in BusinessKit → Settings → Credentials
3. Ask: which content to post? (blog post, product, job, page)
4. Ask: custom message or auto-generate from title + excerpt?
5. Ask: post to all configured platforms or specific ones?
6. `socialAgent.post({ content_type, content_id, title, excerpt, slug, platforms, message })`
7. Show results per platform: posted / failed + post_id or error

## Credentials needed per platform

| Platform | Credentials required |
|---|---|
| X / Twitter | twitter_api_key, twitter_api_secret, twitter_access_token, twitter_access_secret |
| LinkedIn | linkedin_access_token, linkedin_person_urn |
| Facebook | facebook_page_id, facebook_page_token |
| Instagram | instagram_account_id, instagram_access_token |

User adds these in: BusinessKit dashboard → Settings → Credentials