---
name: inventory
description: Track physical stock, record purchase bills, update pricing, and audit warehouse inventory.
---

# Inventory & Stock Management Skill

Use this skill when checking stock quantities, recording incoming purchase shipments, adjusting stock, or updating product catalog prices.

## 1. Operating Rules

- Physical inventory changes must be recorded through verified tools to maintain the append-only stock ledger (`shop_stock_ledger`).
- Never manually insert or delete rows in stock or accounting tables.
- Purchase invoices automatically update moving average cost and post accounts payable records.

## 2. Tool Workflows

### A. Check Stock Levels
Query on-hand quantities, reorder thresholds, and low-stock alerts:
```json
call_tool("inventory_get_levels", {
  "item_name": "Tellzy 40",
  "low_stock_only": false
})
```

### B. Receive Stock from Purchase Invoice
Automatically restock inventory, update cost prices, and calculate retail selling rates from inward supplier bills:
```json
call_tool("inventory_receive_purchase_invoice", {
  "vendor_name": "Apex Supplies",
  "invoice_number": "INV-2026-88",
  "invoice_date": "2026-11-22",
  "payment_method": "bank_transfer",
  "payment_status": "confirmed",
  "line_items": [
    {
      "item_name": "Widget A",
      "sku": "WDG-A-01",
      "quantity": 100,
      "unit_cost": 25.00,
      "selling_price": 50.00,
      "batch_number": "BATCH-2026-01",
      "expiry_date": "2027-12-31"
    }
  ]
})
```

### C. Manual Stock Adjustment (Breakage / Audit Variance)
Record physical count adjustments, damaged goods, or write-offs:
```json
call_tool("inventory_add_stock", {
  "sku": "WDG-A-01",
  "quantity_delta": -3,
  "movement_type": "damage",
  "reason": "Damaged in warehouse transit"
})
```

### D. Update Product Pricing
Update retail price, cost price, or minimum discount floor:
```json
call_tool("product_update_pricing", {
  "sku": "WDG-A-01",
  "price": 54.99,
  "cost_price": 25.00
})
```
