---
id: "cmd_check_stock"
name: "Check Stock Levels"
slash: "/check-stock"
description: "Inspect inventory levels, reorder points & batches"
domain_tags: ["shop"]
required_tools: ["inventory_get_levels"]
---

# Check Stock Levels (`/check-stock`)

Query current stock on hand, warehouse locations, reorder thresholds, and low-stock alerts.

## Available Tools
- `inventory_get_levels(sku?: string, item_name?: string, low_stock_only?: boolean)`: Retrieves current inventory status across items.

## Accepted Arguments
- All tracked inventory: `/check-stock`
- Specific item: `/check-stock Tellzy 40` or `/check-stock sku:SHIRT-01`
- Low stock items only: `/check-stock --low` or `/check-stock reorder`

## Execution Protocol

### Step 1: Query Inventory
Call `inventory_get_levels` with user filters:
```json
{
  "item_name": "<optional_filter>",
  "low_stock_only": false
}
```

### Step 2: Format Inventory Overview
Present findings in a clear markdown table:

| Item Name | SKU | On Hand | Reorder Point | Status | Selling Price |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Widget Pro | `WDG-PRO` | 142 | 20 | 🟢 In Stock | $49.99 |
| USB-C Cable | `CBL-USBC` | 4 | 25 | 🔴 Low Stock | $12.50 |

### Step 3: Suggest Restocking or Adjustments
- If low stock detected, prompt: `/add-inventory-from-invoice` to restock.
- If physical audit variance found, suggest: `/adjust-stock <sku> <delta>`.
