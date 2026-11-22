---
name: crm
description: Manage customer contacts, sales leads, companies, communication channels, and client details.
---

# CRM & Contact Management Skill

Use this skill when managing customers, creating sales leads, updating contact information, or logging client interactions.

## 1. Operating Rules

- Contacts must include at least a full name and a communication method (email, phone, or handle).
- Always verify existing contacts before creating duplicates.
- All modifications are soft-updates; contact records are never physically deleted.

## 2. Tool Workflows

### A. Create New Contact / Lead
```json
call_tool("contact_create", {
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-555-0199",
  "tags": ["client", "wholesale"]
})
```

### B. Update Contact Record
Update targeted fields inside the `fields` object:
```json
call_tool("contact_update", {
  "contact_id": "ct_301a9b82",
  "fields": {
    "phone": "+1-555-0188",
    "tags": "[\"vip\", \"wholesale\"]"
  }
})
```
