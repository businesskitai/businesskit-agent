---
id: "cmd_add_inventory_from_invoice"
name: "Receive Stock from Invoice"
slash: "/add-inventory-from-invoice"
description: "Scan purchase invoice or PDF to auto-restock items"
domain_tags: ["shop"]
required_tools: ["inventory_receive_purchase_invoice"]
---

# Receive Stock from Invoice (`/add-inventory-from-invoice`)

Scan purchase bills, supplier invoices, or OCR text to restock warehouse inventory, calculate selling prices, update purchase costs, and post double-entry accounts payable journal entries.

## Available Tools
- `inventory_receive_purchase_invoice(vendor_name: string, line_items: array, invoice_number?: string, invoice_date?: string, payment_method?: string, payment_status?: string)`: Automatically records inward goods receipt and recalculates weighted average costs.

## Purchase Line Item Schema
```json
{
  "item_name": "Premium Cotton Shirt",
  "sku": "SHIRT-CTN-01",
  "quantity": 100,
  "unit_cost": 25.00,
  "tax_rate": 5.0,
  "discount_pct": 0,
  "selling_price": 55.00,
  "batch_number": "BATCH-2026-A",
  "expiry_date": "2027-12-31"
}
```

## Pricing & Markup Rules
- `cost_price`: Inward base purchase cost per unit.
- If user requests markup: `Selling Price = Cost + (Cost * Markup %)`.
- If new products are being received, prompt or calculate the selling price if omitted.

## Accepted Arguments
- Raw invoice text or structured items:
  - `/add-inventory-from-invoice vendor:"Apex Supplies" inv:AP-892 items:[{ name: "Widget A", qty: 50, cost: 12.50, selling: 25.00 }]`
  - Or paste purchase bill content after the slash command.

## Execution Protocol

### Step 1: Parse Inward Invoice Data
1. Extract Vendor Name (mandatory).
2. Extract Invoice Number and Invoice Date.
3. Parse all line items: product name, SKU, quantity received, unit cost, taxes, discounts, batches, and selling prices.

### Step 2: Double-Entry & Stock Ledger Integrity
Calling `inventory_receive_purchase_invoice` performs atomic ledger updates:
- Restocks warehouse quantity for each item (`track_inventory = 1`).
- Recalculates moving average unit cost.
- Posts double-entry journal records: Debits Inventory Asset, Credits Accounts Payable (or Cash/Bank).

### Step 3: Execute Goods Receipt
Call `inventory_receive_purchase_invoice`:
```json
{
  "vendor_name": "Apex Supplies",
  "invoice_number": "INV-2026-881",
  "invoice_date": "2026-11-22",
  "payment_status": "confirmed",
  "payment_method": "bank_transfer",
  "line_items": [
    {
      "item_name": "Widget A",
      "quantity": 50,
      "unit_cost": 12.50,
      "selling_price": 25.00
    }
  ]
}
```

### Step 4: Summary Output
Display a receipt summary:
- **Vendor & Invoice #**
- **Restocked Items Table**: SKU, Item Name, Quantity Added, Cost Price, Selling Price
- **Total Inward Value & Tax**
- **Status**: Inventory and double-entry accounts updated.
