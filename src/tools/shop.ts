// src/tools/shop.ts
// Shop & Inventory MCP Tools: Purchases, Restocks, Levels, Pricing, and Invoicing

import { execute, generateId, generateSku, query } from '../db.js';
import type { ToolDefinition, ToolContext } from './types.js';

export const shopTools: ToolDefinition[] = [
  {
    name: 'inventory_receive_purchase_invoice',
    domain: 'shop',
    description:
      "Receive inventory items from a vendor purchase invoice, vendor bill, or restock shipment. Records a formal Goods Receipt / Purchase document (doc_type='goods_receipt'), auto-creates missing products in shop_items with clean 10-char alphanumeric SKUs (e.g. '7PKFJ7I5ND'), updates item cost prices, selling prices / markup % (shop_items.price), MRP (default_mrp), taxes, packaging, and logs stock ledger movements with movement_type 'purchase'.",
    inputSchema: {
      type: 'object',
      properties: {
        vendor_name: {
          type: 'string',
          description: "Supplier / Vendor company name (e.g. 'Sun Pharma Healthcare', 'Apple Inc.')",
        },
        invoice_number: {
          type: 'string',
          description: "Vendor's invoice or bill number (e.g. 'INV-MED-44021', 'INV-APL-2026-089')",
        },
        invoice_date: {
          type: 'string',
          description: "Invoice date (e.g. '2026-09-11' or ISO date), optional.",
        },
        location: {
          type: 'string',
          description: 'Warehouse / store name, optional (defaults to Main Warehouse).',
        },
        media_id: {
          type: 'string',
          description: 'Associated media/attachment ID from uploaded invoice document, optional.',
        },
        default_markup_pct: {
          type: 'number',
          description:
            'Default markup % applied to cost_price to compute selling price for shop_items.price (e.g. 20 for cost + 20%), optional.',
        },
        grand_total: {
          type: 'number',
          description:
            'Total final invoice payable amount (after discounts and taxes, e.g. 5091.84), optional.',
        },
        subtotal: {
          type: 'number',
          description: 'Pre-tax/discount subtotal, optional.',
        },
        payment_status: {
          type: 'string',
          enum: ['paid', 'due', 'partial', 'confirmed'],
          description:
            "Payment status of the invoice, optional (defaults to 'confirmed' or 'paid' if paid).",
        },
        payment_method: {
          type: 'string',
          description: "Payment method (e.g. 'cash', 'bank_transfer', 'upi', 'credit'), optional.",
        },
        payment_terms: {
          type: 'string',
          description: "Payment terms (e.g. 'Net 30', 'Net 15', 'Immediate', 'Due on Receipt'), optional.",
        },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: {
                type: 'string',
                description: "Item SKU, ID, or product name (e.g. 'URISPAS TAB', 'Apple Mac Mini', '7PKFJ7I5ND')",
              },
              sku: {
                type: 'string',
                description: 'Explicit product SKU code if provided on bill, optional.',
              },
              quantity: {
                type: 'number',
                description: 'Billed quantity received (e.g. 50, 10)',
              },
              free_qty: {
                type: 'number',
                description: "Free scheme quantity (e.g. 5 for 'buy 50 get 5 free'), optional.",
              },
              unit_cost: {
                type: 'number',
                description: 'Unit cost price before discount/tax (optional if cost_price given).',
              },
              cost_price: {
                type: 'number',
                description: 'Net unit purchase cost price after line discounts.',
              },
              selling_price: {
                type: 'number',
                description: 'Selling price to update on shop_items.price (optional).',
              },
              price: {
                type: 'number',
                description: 'Alias for selling_price (optional).',
              },
              markup_pct: {
                type: 'number',
                description: 'Markup percentage on cost_price (optional).',
              },
              mrp: {
                type: 'number',
                description: 'Maximum Retail Price (default_mrp), optional.',
              },
              tax_pct: {
                type: 'number',
                description: 'GST / Tax percentage (e.g. 12 for 12% GST), optional.',
              },
              batch_number: {
                type: 'string',
                description: 'Batch / Lot number (e.g. ' + "'B2401', optional.",
              },
              expiry_date: {
                type: 'string',
                description: "Expiry date string (e.g. '2026-12', '12/26'), optional.",
              },
            },
            required: ['item', 'quantity'],
          },
          description: 'List of items received on the purchase invoice',
        },
        notes: { type: 'string', description: 'Optional notes or comments.' },
      },
      required: ['vendor_name', 'line_items'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const { vendor_name, line_items, invoice_number, location, default_markup_pct } = args;
      const profileId = ctx.profileId;

      // 1. Resolve or create vendor
      let vendorId: string;
      const existingVendors = await query<{ id: string }>(
        'SELECT id FROM shop_vendors WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, vendor_name.trim(), `%${vendor_name.trim()}%`]
      );
      if (existingVendors.length > 0) {
        vendorId = existingVendors[0].id;
      } else {
        vendorId = generateId('vend');
        await execute(
          'INSERT INTO shop_vendors (id, profile_id, name, payment_terms, is_active) VALUES (?, ?, ?, ?, 1)',
          [vendorId, profileId, vendor_name.trim(), args.payment_terms || 'Net 30']
        );
      }

      // 2. Resolve warehouse
      let warehouseId: string;
      const locName = location || 'Main Warehouse';
      const existingWarehouses = await query<{ id: string }>(
        'SELECT id FROM shop_warehouses WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, locName, `%${locName}%`]
      );
      if (existingWarehouses.length > 0) {
        warehouseId = existingWarehouses[0].id;
      } else {
        warehouseId = generateId('wh');
        await execute(
          'INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) VALUES (?, ?, ?, ?, 1, 1)',
          [warehouseId, profileId, locName, 'general']
        );
      }

      // 3. Sequential doc number
      const countRes = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'goods_receipt'",
        [profileId]
      );
      const seq = Number(countRes[0]?.cnt || 0) + 1;
      const docNumber = `GR-${String(seq).padStart(4, '0')}`;
      const docId = generateId('doc');

      let totalCost = 0;
      let totalQty = 0;
      const processedItems = [];

      // 4. Process line items
      for (const line of line_items) {
        const itemRef = String(line.item || '').trim();
        const billedQty = Number(line.quantity || 0);
        const freeQty = Number(line.free_qty || 0);
        const totalLineQty = billedQty + freeQty;
        const costPrice = Number(line.cost_price || line.unit_cost || 0);
        const mrp = line.mrp ? Number(line.mrp) : undefined;
        let sellingPrice = line.selling_price || line.price ? Number(line.selling_price || line.price) : undefined;

        if (!sellingPrice && default_markup_pct && costPrice > 0) {
          sellingPrice = Math.round(costPrice * (1 + Number(default_markup_pct) / 100) * 100) / 100;
        }

        // Find or create item
        let itemId: string;
        let itemSku: string;
        let itemName = itemRef;

        const itemsFound = await query<{ id: string; name: string; sku: string }>(
          'SELECT id, name, sku FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
          [profileId, itemRef, itemRef, itemRef, `%${itemRef}%`]
        );

        if (itemsFound.length > 0) {
          itemId = itemsFound[0].id;
          itemName = itemsFound[0].name;
          itemSku = itemsFound[0].sku || generateSku();
          // Update cost and selling price
          const updates: string[] = [];
          const updateParams: any[] = [];
          if (costPrice > 0) {
            updates.push('cost_price = ?');
            updateParams.push(costPrice);
          }
          if (sellingPrice && sellingPrice > 0) {
            updates.push('price = ?');
            updateParams.push(sellingPrice);
          }
          if (mrp && mrp > 0) {
            updates.push('default_mrp = ?');
            updateParams.push(mrp);
          }
          if (updates.length > 0) {
            updates.push("updated_at = strftime('%s','now')");
            updateParams.push(itemId, profileId);
            await execute(
              `UPDATE shop_items SET ${updates.join(', ')} WHERE id = ? AND profile_id = ?`,
              updateParams
            );
          }
        } else {
          itemId = generateId('item');
          itemSku = (line.sku || (itemRef.length <= 16 && !itemRef.includes(' ') ? itemRef : generateSku())).toUpperCase();
          const slug = `item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          await execute(
            `INSERT INTO shop_items (id, profile_id, name, sku, slug, cost_price, price, default_mrp, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
            [itemId, profileId, itemName, itemSku, slug, costPrice, sellingPrice || costPrice, mrp || 0]
          );
        }

        // Ledger movement
        const ledgerId = generateId('stk');
        await execute(
          `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, reference_type, reference_id, created_at)
           VALUES (?, ?, ?, ?, 'purchase', ?, 0, ?, 'goods_receipt', ?, strftime('%s','now'))`,
          [ledgerId, profileId, itemId, warehouseId, totalLineQty, costPrice, docId]
        );

        // Document line
        const lineId = generateId('line');
        const lineTotal = billedQty * costPrice;
        await execute(
          `INSERT INTO shop_document_lines (id, profile_id, document_id, item_id, description, quantity, unit_price, total_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
          [lineId, profileId, docId, itemId, itemName, billedQty, costPrice, lineTotal]
        );

        totalCost += lineTotal;
        totalQty += totalLineQty;
        processedItems.push({ item_id: itemId, sku: itemSku, name: itemName, quantity: totalLineQty, cost_price: costPrice });
      }

      // 5. Create goods_receipt document
      await execute(
        `INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, vendor_id, warehouse_id, total, status, notes, created_at, updated_at)
         VALUES (?, ?, 'goods_receipt', ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [docId, profileId, docNumber, vendorId, warehouseId, totalCost, args.payment_status || 'confirmed', args.notes || '']
      );

      return {
        success: true,
        doc_id: docId,
        doc_number: docNumber,
        vendor_name: vendor_name,
        invoice_number: invoice_number || null,
        warehouse: locName,
        total_items: processedItems.length,
        total_quantity: totalQty,
        grand_total: totalCost,
        items: processedItems,
      };
    },
  },
  {
    name: 'product_update_pricing',
    domain: 'shop',
    description:
      'Directly update product pricing, selling price (shop_items.price), cost price (shop_items.cost_price), markup percentage, MRP, or discounts for an existing item by SKU, ID, or name.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: "Item SKU, product name, or ID (e.g. '7PKFJ7I5ND', 'Apple Mac Mini', 'item_...')",
        },
        selling_price: { type: 'number', description: 'New selling price (shop_items.price), optional.' },
        price: { type: 'number', description: 'Alias for selling_price, optional.' },
        cost_price: { type: 'number', description: 'New cost / purchase price (shop_items.cost_price), optional.' },
        markup_pct: { type: 'number', description: 'Markup percentage on cost_price to compute selling price, optional.' },
        mrp: { type: 'number', description: 'Maximum Retail Price (default_mrp), optional.' },
        discount_pct: { type: 'number', description: 'Default discount percentage, optional.' },
      },
      required: ['sku'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.sku).trim();

      const items = await query<{ id: string; name: string; sku: string; price: number; cost_price: number; default_mrp: number }>(
        'SELECT id, name, sku, price, cost_price, default_mrp FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, ref, ref, ref, `%${ref}%`]
      );

      if (items.length === 0) {
        throw new Error(`Product not found with identifier: ${ref}`);
      }

      const item = items[0];
      const updates: string[] = [];
      const params: any[] = [];

      let costPrice = item.cost_price;
      if (args.cost_price !== undefined) {
        costPrice = Number(args.cost_price);
        updates.push('cost_price = ?');
        params.push(costPrice);
      }

      let sellingPrice = args.selling_price !== undefined ? Number(args.selling_price) : args.price !== undefined ? Number(args.price) : undefined;
      if (sellingPrice === undefined && args.markup_pct !== undefined && costPrice > 0) {
        sellingPrice = Math.round(costPrice * (1 + Number(args.markup_pct) / 100) * 100) / 100;
      }
      if (sellingPrice !== undefined) {
        updates.push('price = ?');
        params.push(sellingPrice);
      }

      if (args.mrp !== undefined) {
        updates.push('default_mrp = ?');
        params.push(Number(args.mrp));
      }

      if (updates.length === 0) {
        return { success: true, message: 'No pricing updates specified.', item };
      }

      updates.push("updated_at = strftime('%s','now')");
      params.push(item.id, profileId);

      await execute(`UPDATE shop_items SET ${updates.join(', ')} WHERE id = ? AND profile_id = ?`, params);

      return {
        success: true,
        sku: item.sku,
        name: item.name,
        previous_price: item.price,
        new_price: sellingPrice ?? item.price,
        previous_cost: item.cost_price,
        new_cost: costPrice,
      };
    },
  },
  {
    name: 'inventory_add_stock',
    domain: 'shop',
    description:
      'Add or adjust stock quantity for a SKU, product name, or item ID. Use for restocks, counts, or corrections.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: "Item SKU, product name, or identifier (e.g. 'Apple Mac Mini', '2B4FYFAVIO')" },
        quantity_delta: { type: 'number', description: 'Positive to add stock, negative to remove.' },
        movement_type: {
          type: 'string',
          enum: ['purchase', 'adjustment'],
          description: "Type of movement: 'purchase' for vendor restock or 'adjustment' for manual count/correction (default: 'adjustment').",
        },
        unit_cost: { type: 'number', description: 'Unit purchase cost if applicable.' },
        vendor_name: { type: 'string', description: 'Vendor name if this is a purchase.' },
        invoice_number: { type: 'string', description: 'Invoice reference number if applicable.' },
        location: { type: 'string', description: 'Optional warehouse name or location tag.' },
      },
      required: ['sku', 'quantity_delta'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.sku).trim();
      const delta = Number(args.quantity_delta);

      const items = await query<{ id: string; name: string; sku: string; cost_price: number }>(
        'SELECT id, name, sku, cost_price FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, ref, ref, ref, `%${ref}%`]
      );

      let itemId: string;
      let itemName = ref;
      let itemSku: string;

      if (items.length > 0) {
        itemId = items[0].id;
        itemName = items[0].name;
        itemSku = items[0].sku;
      } else {
        itemId = generateId('item');
        itemSku = generateSku();
        const slug = `item-${ref.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        await execute(
          `INSERT INTO shop_items (id, profile_id, name, sku, slug, cost_price, price, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
          [itemId, profileId, ref, itemSku, slug, args.unit_cost || 0, args.unit_cost || 0]
        );
      }

      // Warehouse
      const loc = args.location || 'Main Warehouse';
      const whs = await query<{ id: string }>('SELECT id FROM shop_warehouses WHERE profile_id = ? LIMIT 1', [profileId]);
      const warehouseId = whs.length > 0 ? whs[0].id : 'default';

      const qtyIn = delta > 0 ? delta : 0;
      const qtyOut = delta < 0 ? Math.abs(delta) : 0;
      const movementType = args.movement_type || (delta > 0 ? 'adjustment' : 'adjustment');
      const ledgerId = generateId('stk');

      await execute(
        `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
        [ledgerId, profileId, itemId, warehouseId, movementType, qtyIn, qtyOut, args.unit_cost || 0, args.invoice_number || 'Stock Adjustment']
      );

      // Compute balance
      const balRes = await query<{ balance: number }>(
        'SELECT COALESCE(SUM(qty_in - qty_out), 0) as balance FROM shop_stock_ledger WHERE profile_id = ? AND item_id = ?',
        [profileId, itemId]
      );

      return {
        success: true,
        sku: itemSku,
        name: itemName,
        quantity_delta: delta,
        current_stock: Number(balRes[0]?.balance || 0),
        movement_type: movementType,
      };
    },
  },
  {
    name: 'inventory_get_levels',
    domain: 'shop',
    description: 'Look up current stock levels, optionally filtered by SKU or category.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Optional SKU or product name to query specific item balance.' },
        category: { type: 'string', description: 'Optional category name filter.' },
      },
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const skuFilter = args.sku ? `%${String(args.sku).trim()}%` : null;

      let sql = `
        SELECT i.id, i.name, i.sku, i.price, i.cost_price,
               COALESCE(SUM(l.qty_in - l.qty_out), 0) as stock_on_hand
        FROM shop_items i
        LEFT JOIN shop_stock_ledger l ON i.id = l.item_id AND l.profile_id = i.profile_id
        WHERE i.profile_id = ?
      `;
      const params: any[] = [profileId];

      if (skuFilter) {
        sql += ' AND (i.sku LIKE ? OR i.name LIKE ? OR i.id = ?)';
        params.push(skuFilter, skuFilter, args.sku.trim());
      }

      sql += ' GROUP BY i.id ORDER BY i.name ASC LIMIT 100';

      const items = await query(sql, params);
      return {
        total: items.length,
        items: items.map((r: any) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          selling_price: r.price,
          cost_price: r.cost_price,
          stock_on_hand: Number(r.stock_on_hand || 0),
        })),
      };
    },
  },
  {
    name: 'invoice_create',
    domain: 'shop',
    description: 'Create and draft a customer sales invoice in the shop billing system.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer name or company name' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
            },
            required: ['description', 'quantity', 'unit_price'],
          },
        },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
      },
      required: ['customer_name', 'line_items'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const { customer_name, line_items, due_date } = args;

      // Customer
      let customerId: string;
      const custs = await query<{ id: string }>(
        'SELECT id FROM shop_customers WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, customer_name.trim(), `%${customer_name.trim()}%`]
      );
      if (custs.length > 0) {
        customerId = custs[0].id;
      } else {
        customerId = generateId('cust');
        await execute(
          'INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) VALUES (?, ?, ?, ?, 1)',
          [customerId, profileId, customer_name.trim(), 'individual']
        );
      }

      // Sequential invoice number
      const cntRes = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice'",
        [profileId]
      );
      const seq = Number(cntRes[0]?.cnt || 0) + 1;
      const docNumber = `INV-${String(seq).padStart(4, '0')}`;
      const docId = generateId('doc');

      let grandTotal = 0;
      for (const line of line_items) {
        const lineTotal = Number(line.quantity || 1) * Number(line.unit_price || 0);
        grandTotal += lineTotal;
        const lineId = generateId('line');
        await execute(
          `INSERT INTO shop_document_lines (id, profile_id, document_id, description, quantity, unit_price, total_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
          [lineId, profileId, docId, line.description, line.quantity, line.unit_price, lineTotal]
        );
      }

      await execute(
        `INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, customer_id, total, status, notes, created_at, updated_at)
         VALUES (?, ?, 'invoice', ?, ?, ?, 'draft', ?, strftime('%s','now'), strftime('%s','now'))`,
        [docId, profileId, docNumber, customerId, grandTotal, due_date ? `Due: ${due_date}` : '']
      );

      return {
        success: true,
        invoice_id: docId,
        invoice_number: docNumber,
        customer_name,
        total: grandTotal,
        status: 'draft',
      };
    },
  },
  {
    name: 'invoice_send',
    domain: 'shop',
    description: 'Mark a sales invoice as issued and ready for customer dispatch.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: "Invoice document ID or invoice number (e.g. 'doc_...' or 'INV-0001')" },
        recipient_email: { type: 'string', description: 'Customer email to send the invoice notification to' },
      },
      required: ['invoice_id'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const ref = String(args.invoice_id).trim();

      const docs = await query<{ id: string; doc_number: string; status: string }>(
        'SELECT id, doc_number, status FROM shop_documents WHERE profile_id = ? AND (id = ? OR doc_number = ?) LIMIT 1',
        [profileId, ref, ref]
      );

      if (docs.length === 0) {
        throw new Error(`Invoice not found with identifier: ${ref}`);
      }

      await execute(
        "UPDATE shop_documents SET status = 'sent', updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [docs[0].id, profileId]
      );

      return {
        success: true,
        invoice_id: docs[0].id,
        invoice_number: docs[0].doc_number,
        status: 'sent',
        recipient_email: args.recipient_email || null,
      };
    },
  },
  {
    name: 'shop_create_new_bill',
    domain: 'shop',
    description:
      'Create a new customer sale bill / sales invoice from natural-language or handwritten-bill input. Resolves or auto-creates items, records stock ledger movements (sale), and writes a SAL-NNNN document.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: "Customer name, company, or 'Counter Sale' for walk-in (optional)." },
        customer_id: { type: 'string', description: 'Existing customer ID if known (optional).' },
        bill_date: { type: 'string', description: 'Bill date in YYYY-MM-DD or human format (optional, defaults to today).' },
        payment_status: { type: 'string', enum: ['paid', 'due', 'credit'], description: "Payment status: 'paid', 'due'. Default: 'paid'." },
        payment_method: { type: 'string', description: "Payment method: 'cash', 'upi', 'bank_transfer', 'credit'. Default: 'cash'." },
        bill_discount_pct: { type: 'number', description: 'Optional bill-level discount % applied to total.' },
        bill_discount_amt: { type: 'number', description: 'Optional flat bill discount amount.' },
        notes: { type: 'string', description: 'Optional bill notes or remarks.' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string', description: "Product name, SKU, or ID (e.g. 'Tellzy 40 Tab', 'URISPAS TAB')." },
              qty: { type: 'number', description: 'Quantity to bill (e.g. 5, 10).' },
              price: { type: 'number', description: 'Custom unit selling price.' },
              unit_price: { type: 'number', description: 'Alias for price.' },
              rate: { type: 'number', description: 'Alias for price.' },
              discount_pct: { type: 'number', description: 'Line-level discount %.' },
              tax: { type: 'number', description: 'GST / Tax % for this line.' },
              mrp: { type: 'number', description: 'MRP for this item, optional.' },
              sku: { type: 'string', description: 'Explicit SKU code if provided.' },
            },
            required: ['item', 'qty'],
          },
          description: 'List of items on this bill.',
        },
      },
      required: ['line_items'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
      const profileId = ctx.profileId;
      const customerName = args.customer_name?.trim() || 'Counter Sale';
      const lineItems = args.line_items || [];

      // Resolve customer
      let customerId: string;
      const custs = await query<{ id: string }>(
        'SELECT id FROM shop_customers WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
        [profileId, customerName, `%${customerName}%`]
      );
      if (custs.length > 0) {
        customerId = custs[0].id;
      } else {
        customerId = generateId('cust');
        await execute(
          'INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) VALUES (?, ?, ?, ?, 1)',
          [customerId, profileId, customerName, 'walk_in']
        );
      }

      // Warehouse
      const whs = await query<{ id: string }>('SELECT id FROM shop_warehouses WHERE profile_id = ? LIMIT 1', [profileId]);
      const warehouseId = whs.length > 0 ? whs[0].id : 'default';

      // Doc number
      const cntRes = await query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice' AND doc_number LIKE 'SAL-%'",
        [profileId]
      );
      const seq = Number(cntRes[0]?.cnt || 0) + 1;
      const docNumber = `SAL-${String(seq).padStart(4, '0')}`;
      const docId = generateId('doc');

      let subtotal = 0;
      const billedItems = [];

      for (const line of lineItems) {
        const itemRef = String(line.item || '').trim();
        const qty = Number(line.qty || 1);
        let rate = Number(line.price ?? line.unit_price ?? line.rate ?? 0);
        const discountPct = Number(line.discount_pct || 0);

        // Find or create item
        let itemId: string;
        let itemSku: string;
        let itemName = itemRef;

        const itemsFound = await query<{ id: string; name: string; sku: string; price: number }>(
          'SELECT id, name, sku, price FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1',
          [profileId, itemRef, itemRef, itemRef, `%${itemRef}%`]
        );

        if (itemsFound.length > 0) {
          itemId = itemsFound[0].id;
          itemName = itemsFound[0].name;
          itemSku = itemsFound[0].sku;
          if (rate <= 0) {
            rate = itemsFound[0].price || 0;
          }
        } else {
          itemId = generateId('item');
          itemSku = generateSku();
          const slug = `item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          await execute(
            `INSERT INTO shop_items (id, profile_id, name, sku, slug, price, cost_price, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
            [itemId, profileId, itemName, itemSku, slug, rate, 0]
          );
        }

        const discountedRate = rate * (1 - discountPct / 100);
        const lineTotal = Math.round(discountedRate * qty * 100) / 100;
        subtotal += lineTotal;

        // Stock deduction
        const ledgerId = generateId('stk');
        await execute(
          `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, reference_type, reference_id, created_at)
           VALUES (?, ?, ?, ?, 'sale', 0, ?, ?, 'invoice', ?, strftime('%s','now'))`,
          [ledgerId, profileId, itemId, warehouseId, qty, rate, docId]
        );

        // Line item
        const lineId = generateId('line');
        await execute(
          `INSERT INTO shop_document_lines (id, profile_id, document_id, item_id, description, quantity, unit_price, total_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
          [lineId, profileId, docId, itemId, itemName, qty, rate, lineTotal]
        );

        billedItems.push({ sku: itemSku, name: itemName, qty, unit_price: rate, total: lineTotal });
      }

      let finalTotal = subtotal;
      if (args.bill_discount_pct) {
        finalTotal = Math.round(subtotal * (1 - Number(args.bill_discount_pct) / 100) * 100) / 100;
      } else if (args.bill_discount_amt) {
        finalTotal = Math.max(0, subtotal - Number(args.bill_discount_amt));
      }

      await execute(
        `INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, customer_id, warehouse_id, total, status, notes, created_at, updated_at)
         VALUES (?, ?, 'invoice', ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [docId, profileId, docNumber, customerId, warehouseId, finalTotal, args.payment_status || 'paid', args.notes || '']
      );

      return {
        success: true,
        doc_id: docId,
        doc_number: docNumber,
        customer_name: customerName,
        payment_status: args.payment_status || 'paid',
        payment_method: args.payment_method || 'cash',
        subtotal,
        final_total: finalTotal,
        items_count: billedItems.length,
        items: billedItems,
      };
    },
  },
];
