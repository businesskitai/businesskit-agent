---
id: "cmd_update_pricing"
name: "Update Product Pricing"
slash: "/update-price"
description: "Directly update item cost, selling price or margins"
domain_tags: ["shop"]
required_tools: ["product_update_pricing"]
---

# Update Product Pricing (`/update-price`)

Update item cost price, outward selling price (retail / MRP), or minimum floor price on catalog items.

## Available Tools
- `product_update_pricing(sku: string, price?: number, cost_price?: number, min_price?: number)`: Updates item catalog pricing and recalculates profit margins.

## Accepted Arguments
- Single price change: `/update-price sku:WDG-01 price:59.99`
- Cost & selling change: `/update-price item:"Tellzy 40" cost:1100 price:1450`
- Margin update: `/update-price sku:SHIRT-01 20% margin`

## Execution Protocol

### Step 1: Identify Product & Price Points
1. Match item by SKU, ID, or product name.
2. Identify which prices are being updated:
   - `price`: Standard retail selling price (MRP).
   - `cost_price`: Inward wholesale cost.
   - `min_price`: Discount floor price.

### Step 2: Execute Pricing Update
Call `product_update_pricing`:
```json
{
  "sku": "<sku_or_item_name>",
  "price": 59.99,
  "cost_price": 32.00
}
```

### Step 3: Confirmation & Margin Calculation
Report the updated pricing structure:
- **Product Name & SKU**
- **New Cost Price**: e.g. $32.00
- **New Selling Price**: e.g. $59.99
- **Gross Profit Margin**: `((59.99 - 32.00) / 59.99) * 100` = 46.66%
- **Status**: Live on catalog and POS billing.
