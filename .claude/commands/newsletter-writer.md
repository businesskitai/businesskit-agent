# /newsletter-writer — Write Newsletter

1. `pearl.subscriberStats()` → show audience size first
2. Ask: subject line, preview text, content or topic to write about
3. Write in brand voice: 200+ words, greeting, main value, CTA, sign-off
4. Ask: send now or schedule? (ISO date/time if scheduling)
5. `pearl.send({ subject, preview_text, body_html, schedule_at })`

n8n handles delivery via SES or Resend. Audience breakdown: `pearl.audienceBreakdown()`
