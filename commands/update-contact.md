---
id: "cmd_update_contact"
name: "Update Contact"
slash: "/update-contact"
description: "Update details, tags, or company info for a contact"
domain_tags: ["crm"]
required_tools: ["contact_update"]
---

# Update Contact (`/update-contact`)

Modify profile details, contact information, phone, email, company, or tags for an existing CRM contact.

## Available Tools
- `contact_update(contact_id: string, fields: object)`: Updates specific fields on a contact record.

## Accepted Arguments
- `/update-contact <contact_id> email:new@example.com`
- `/update-contact ct_8a92b1f4 add tag "wholesale"`
- Natural language: `/update-contact Sarah Jenkins phone: +1-555-9999`

## Execution Protocol

### Step 1: Resolve Contact ID & Target Fields
1. Identify `contact_id`. If user gives a name, search or match existing CRM contacts.
2. Build `fields` object with only the keys that are changing:
   - `email`
   - `phone`
   - `first_name` / `last_name`
   - `tags` (JSON string or array)
   - `company`

### Step 2: Execute Update
Call `contact_update`:
```json
{
  "contact_id": "ct_8a92b1f4",
  "fields": {
    "phone": "+1-555-9999",
    "tags": "[\"client\", \"wholesale\", \"vip\"]"
  }
}
```

### Step 3: Confirmation
Display updated contact card showing previous vs new values.
