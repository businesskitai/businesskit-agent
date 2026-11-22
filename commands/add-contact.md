---
id: "cmd_add_contact"
name: "Add CRM Contact"
slash: "/add-contact"
description: "Register a new client, vendor, or lead with email/phone"
domain_tags: ["crm"]
required_tools: ["contact_create"]
---

# Add CRM Contact (`/add-contact`)

Register a new client, vendor, supplier, or business lead in the unified CRM.

## Available Tools
- `contact_create(name: string, email?: string, phone?: string, tags?: array)`: Creates contact and syncs with CRM directory.

## Accepted Arguments
- Natural language contact creation:
  - `/add-contact John Doe john@example.com +1-555-0199 tags:["client", "vip"]`
  - `/add-contact vendor: "Apex Manufacturing" contact: sales@apex.com`

## Execution Protocol

### Step 1: Parse Contact Details
1. Extract full name (split into first and last name automatically).
2. Extract email address and validate format.
3. Extract phone / mobile number.
4. Extract descriptive tags (e.g. `["lead", "wholesale", "partner"]`).

### Step 2: Execute Creation
Call `contact_create`:
```json
{
  "name": "Sarah Jenkins",
  "email": "sarah.j@example.com",
  "phone": "+1-555-8821",
  "tags": ["client", "q4-lead"]
}
```

### Step 3: Confirmation
Output contact confirmation card:
- **Contact ID**: e.g. `ct_8a92b1f4`
- **Full Name**: Sarah Jenkins
- **Email & Phone**
- **Tags**: `client`, `q4-lead`
- **Next Steps**: Link to invoices (`/create-invoice`) or log communications.
