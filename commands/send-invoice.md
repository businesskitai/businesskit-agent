---
id: "cmd_send_invoice"
name: "Send Invoice"
slash: "/send-invoice"
description: "Send an existing invoice to customer via email or link"
domain_tags: ["shop"]
required_tools: ["invoice_send"]
---

# Send Invoice (`/send-invoice`)

Dispatch a finalized customer invoice via email and generate a secure public payment link.

## Available Tools
- `invoice_send(invoice_id: string, recipient_email?: string)`: Finalizes and delivers the invoice.

## Accepted Arguments
- `/send-invoice <invoice_id>` e.g. `/send-invoice inv_8472`
- With explicit recipient: `/send-invoice inv_8472 to:billing@acme.com`

## Execution Protocol

### Step 1: Confirm Invoice ID & Delivery Channel
1. Extract invoice ID from command arguments.
2. If missing, ask the user for the invoice ID or reference number.
3. Confirm recipient email if explicitly provided.

### Step 2: Execute Transmission
Call `invoice_send`:
```json
{
  "invoice_id": "<invoice_id>",
  "recipient_email": "<optional_email>"
}
```

### Step 3: Confirmation & Payment URL
Report the delivery result:
- **Invoice Reference**: e.g. `INV-2026-0042`
- **Delivery Status**: Delivered via email to customer
- **Payment Link**: Shareable URL for customer payment
- **Accounting Note**: Invoice marked as issued in receivables ledger.
