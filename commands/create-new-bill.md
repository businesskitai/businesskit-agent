---
id: "cmd_create_new_bill"
name: "Create New Sale Bill"
slash: "/create-new-bill"
description: "Create a sale bill from product name, qty, custom price and discount — or parse a handwritten bill"
domain_tags: ["shop"]
required_tools: ["shop_create_new_bill"]
---

# Create New Sale Bill (`/create-new-bill`)

Fast point-of-sale (POS) billing. Generate immediate sales receipts from natural language entries, custom rates, item discounts, or by parsing OCR text from handwritten bills.

## Available Tools
- `shop_create_new_bill(line_items: array, customer_name?: string, payment_method?: string, payment_status?: string, bill_discount_pct?: number, notes?: string)`: Generates a retail/POS sales bill and updates inventory immediately.

## Line Item Schema
```json
{
  "item_name": "Tellzy 40 Tab",
  "quantity": 5,
  "unit_price": 1258.83,
  "discount_pct": 15.0,
  "tax_rate": 12.0
}
```

## Accepted Arguments
- Natural language line item string:
  - `/create-new-bill 5 Box Tellzy 40 Tab @ ₹1258.83 -15%`
  - `/create-new-bill 2 Apple AirPods Pro @ 249 cash customer: Alice`
- Multi-item or pasted receipt text.

## Execution Protocol

### Step 1: Parse Line Items
1. Extract item names, packaging/unit, quantities, custom selling price, and line discount %.
2. Extract payment method (`cash`, `upi`, `card`, `credit`) — default to `cash`.
3. Extract optional customer name and overall bill discount if specified.

### Step 2: Execute Bill Creation
Call `shop_create_new_bill`:
```json
{
  "line_items": [
    {
      "item_name": "Tellzy 40 Tab",
      "quantity": 5,
      "unit_price": 1258.83,
      "discount_pct": 15.0
    }
  ],
  "customer_name": "Walk-in Customer",
  "payment_method": "cash",
  "payment_status": "confirmed"
}
```

### Step 3: Present Bill Receipt
Output a clean receipt breakdown:
- **Receipt / Order ID**
- **Payment Method & Status**
- **Itemized Table**: Item, Qty, Rate, Discount, Tax, Total
- **Grand Total Paid**
- **Inventory Notice**: Stock quantities decremented automatically in the stock ledger.
