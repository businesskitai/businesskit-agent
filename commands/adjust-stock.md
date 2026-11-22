---
id: "cmd_adjust_stock"
name: "Adjust Stock Quantity"
slash: "/adjust-stock"
description: "Record damage, audit variances or stock corrections"
domain_tags: ["shop"]
required_tools: ["inventory_add_stock"]
---

# Adjust Stock Quantity (`/adjust-stock`)

Record manual stock adjustments, breakage, damaged goods, return discrepancies, or cycle count audit variances.

## Available Tools
- `inventory_add_stock(sku: string, quantity_delta: number, movement_type?: string, unit_cost?: number, reason?: string)`: Adjusts inventory balance and posts inventory shrinkage/variance accounting entries.

## Accepted Arguments
- Increase stock (found surplus): `/adjust-stock sku:WDG-01 qty:+5 reason:"Audit surplus"`
- Decrease stock (damage/loss): `/adjust-stock sku:WDG-01 qty:-2 reason:"Broken during transit"`
- Natural language: `/adjust-stock 3 units of Tellzy 40 damaged`

## Execution Protocol

### Step 1: Parse Item & Delta
1. Identify product SKU or item name.
2. Determine `quantity_delta` (positive for additions, negative for write-offs).
3. Determine movement type (e.g. `adjustment`, `shrinkage`, `damage`, `return`).
4. Capture adjustment reason for audit trails.

### Step 2: Execute Adjustment
Call `inventory_add_stock`:
```json
{
  "sku": "WDG-01",
  "quantity_delta": -2,
  "movement_type": "damage",
  "reason": "Water damage in storage"
}
```

### Step 3: Confirmation
Output adjustment summary:
- **Product Name & SKU**
- **Adjustment**: -2 units (Damage Write-off)
- **New On Hand Balance**: Updated warehouse total
- **Accounting Note**: Inventory loss booked to double-entry ledger.
