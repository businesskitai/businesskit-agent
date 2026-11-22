---
name: billing
description: Issue invoices, create walk-in POS bills, record payments, and reconcile accounts using double-entry verified tools.
---

# Billing, POS & Invoicing Skill

Use this skill when billing customers, generating B2B invoices, or reviewing sales documents.

## 1. Operating Rules & Constraints

- **Double-Entry Guarantees**:
  - Never write directly to financial ledger tables (`fin_journal_entries`, `fin_accounts`).
  - Tools automatically compute debits, credits, and tax rates.
- **Drafts First**:
  - Invoices must be drafted first for human review before transmission. Call `invoice_create`, then prompt the user to review and send with `invoice_send`.
- **Line Items**:
  - Always provide item name or SKU, quantity, unit price, and optional tax or discount.

## 2. Tool Workflows

### A. Walk-in POS Sale
Call `shop_create_new_bill` to instantly record a retail sale, decrement inventory, and post ledger records:
```json
call_tool("shop_create_new_bill", {
  "customer_name": "Walk-in Customer",
  "payment_method": "cash",
  "payment_status": "confirmed",
  "line_items": [
    {
      "item_name": "Tellzy 40 Tab",
      "quantity": 2,
      "unit_price": 500.00,
      "discount_pct": 10.0
    }
  ]
})
```

### B. Create Formal B2B Invoice
Call `invoice_create` to generate an itemized invoice draft:
```json
call_tool("invoice_create", {
  "customer_id": "Acme Corp",
  "due_date": "2026-12-15",
  "line_items": [
    {
      "name": "Consulting Services",
      "quantity": 10,
      "unit_price": 150.00,
      "tax_rate": 18.0
    }
  ]
})
```

### C. Send Finalized Invoice
Dispatch invoice to client via email or generate a shareable payment link:
```json
call_tool("invoice_send", {
  "invoice_id": "inv_8941",
  "recipient_email": "billing@acme.com"
})
```
