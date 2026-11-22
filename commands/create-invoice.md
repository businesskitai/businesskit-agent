---
id: "cmd_create_invoice"
name: "Create Customer Invoice"
slash: "/create-invoice"
description: "Draft a new retail or wholesale billing invoice"
domain_tags: ["shop"]
required_tools: ["invoice_create", "contact_create"]
---

# Create Customer Invoice (`/create-invoice`)

Draft a formal customer invoice with line items, tax computations, and due dates. All invoices are drafted first for human review before transmission.

## Available Tools
- `invoice_create(customer_id: string, line_items: array, due_date?: string)`: Creates invoice draft with tax calculations.
- `contact_create(name: string, email?: string, phone?: string, type?: string)`: Registers new customer if not found.

## Line Item Schema
Each item in `line_items` array:
```json
{
  "item_id": "optional_item_id_or_sku",
  "name": "Widget Pro",
  "quantity": 2,
  "unit_price": 49.99,
  "tax_rate": 18.0
}
```

## Accepted Arguments
- Natural language invoice requests:
  - `/create-invoice for Acme Corp: 5 Premium Subscriptions @ $100/mo due in 30 days`
  - `/create-invoice customer:"John Doe" items:[{ name: "Consulting", qty: 10, rate: 150 }]`

## Execution Protocol

### Step 1: Parse Customer & Line Items
1. Identify customer name, email, or ID.
2. Parse line items: descriptions, quantities, unit prices, and applicable tax rates.
3. Compute due date (default to Net 30 if unspecified).

### Step 2: Validate or Create Customer
- Pass `customer_id` (or name/email) to `invoice_create`. The backend will match existing customers.
- If the customer does not exist and details (email/phone) are provided, call `contact_create(type: "customer")` first.

### Step 3: Execute Invoice Creation
Call `invoice_create`:
```json
{
  "customer_id": "<customer_name_or_id>",
  "line_items": [
    {
      "name": "Design Retainer",
      "quantity": 1,
      "unit_price": 1500.00,
      "tax_rate": 0
    }
  ],
  "due_date": "2026-12-22"
}
```

### Step 4: Present Draft Invoice
Display summary:
- **Invoice Number & ID**
- **Customer**: Name & Email
- **Itemized Table**: Items, Qty, Unit Price, Tax, Subtotal
- **Grand Total & Due Date**
- **Next Step**: Prompt the user to review and send: `/send-invoice <invoice_id>`.
