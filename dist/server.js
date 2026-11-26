// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/db.ts
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
dotenv.config();
var clientInstance = null;
var currentProfileId = process.env.PROFILE_ID || process.env.BK_PROFILE_ID || "";
var profileResolved = false;
function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || process.env.BK_TURSO_URL || process.env.DATABASE_URL || "";
  const token = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || process.env.BK_TURSO_TOKEN || process.env.AUTH_TOKEN || "";
  const trimmedUrl = url.trim();
  const trimmedToken = token.trim();
  if (!trimmedUrl || !trimmedToken || trimmedUrl.includes("your-db") || trimmedUrl.includes("your-database") || trimmedToken.includes("your-token") || trimmedToken.includes("your-turso-auth-token")) {
    return null;
  }
  let normalizedUrl = trimmedUrl;
  if (normalizedUrl.startsWith("turso://")) {
    normalizedUrl = "https://" + normalizedUrl.slice(8);
  }
  return { url: normalizedUrl, token: trimmedToken };
}
function isDbConfigured() {
  return getTursoConfig() !== null;
}
function getDbClient() {
  if (clientInstance) {
    return clientInstance;
  }
  const config = getTursoConfig();
  if (!config) {
    throw new Error(
      "Turso database credentials not configured. Please define TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env file or environment variables."
    );
  }
  clientInstance = createClient({
    url: config.url,
    authToken: config.token
  });
  return clientInstance;
}
async function getActiveProfileId() {
  if (currentProfileId) {
    return currentProfileId;
  }
  if (profileResolved || !isDbConfigured()) {
    currentProfileId = "default";
    return currentProfileId;
  }
  try {
    profileResolved = true;
    const client = getDbClient();
    const result = await client.execute("SELECT id FROM profiles LIMIT 1");
    if (result.rows.length > 0 && result.rows[0].id) {
      currentProfileId = String(result.rows[0].id);
      return currentProfileId;
    }
    const shopResult = await client.execute("SELECT profile_id FROM shop_items LIMIT 1");
    if (shopResult.rows.length > 0 && shopResult.rows[0].profile_id) {
      currentProfileId = String(shopResult.rows[0].profile_id);
      return currentProfileId;
    }
  } catch (err) {
    console.error('[DB] Profile lookup error (defaulting to "default"):', err?.message || err);
  }
  currentProfileId = "default";
  return currentProfileId;
}
function setActiveProfileId(id) {
  currentProfileId = id.trim();
  profileResolved = true;
}
async function query(sql, args = []) {
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return res.rows;
}
async function execute(sql, args = []) {
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return {
    rowsAffected: res.rowsAffected,
    lastInsertRowid: res.lastInsertRowid
  };
}
function generateId(prefix) {
  const cleanPrefix = prefix.endsWith("_") ? prefix : `${prefix}_`;
  return `${cleanPrefix}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
function generateSku() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let sku = "";
  for (let i = 0; i < 10; i++) {
    sku += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return sku;
}

// src/tools/shop.ts
var shopTools = [
  {
    name: "inventory_receive_purchase_invoice",
    domain: "shop",
    description: "Receive inventory items from a vendor purchase invoice, vendor bill, or restock shipment. Records a formal Goods Receipt / Purchase document (doc_type='goods_receipt'), auto-creates missing products in shop_items with clean 10-char alphanumeric SKUs (e.g. '7PKFJ7I5ND'), updates item cost prices, selling prices / markup % (shop_items.price), MRP (default_mrp), taxes, packaging, and logs stock ledger movements with movement_type 'purchase'.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_name: {
          type: "string",
          description: "Supplier / Vendor company name (e.g. 'Sun Pharma Healthcare', 'Apple Inc.')"
        },
        invoice_number: {
          type: "string",
          description: "Vendor's invoice or bill number (e.g. 'INV-MED-44021', 'INV-APL-2026-089')"
        },
        invoice_date: {
          type: "string",
          description: "Invoice date (e.g. '2026-09-11' or ISO date), optional."
        },
        location: {
          type: "string",
          description: "Warehouse / store name, optional (defaults to Main Warehouse)."
        },
        media_id: {
          type: "string",
          description: "Associated media/attachment ID from uploaded invoice document, optional."
        },
        default_markup_pct: {
          type: "number",
          description: "Default markup % applied to cost_price to compute selling price for shop_items.price (e.g. 20 for cost + 20%), optional."
        },
        grand_total: {
          type: "number",
          description: "Total final invoice payable amount (after discounts and taxes, e.g. 5091.84), optional."
        },
        subtotal: {
          type: "number",
          description: "Pre-tax/discount subtotal, optional."
        },
        payment_status: {
          type: "string",
          enum: ["paid", "due", "partial", "confirmed"],
          description: "Payment status of the invoice, optional (defaults to 'confirmed' or 'paid' if paid)."
        },
        payment_method: {
          type: "string",
          description: "Payment method (e.g. 'cash', 'bank_transfer', 'upi', 'credit'), optional."
        },
        payment_terms: {
          type: "string",
          description: "Payment terms (e.g. 'Net 30', 'Net 15', 'Immediate', 'Due on Receipt'), optional."
        },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: {
                type: "string",
                description: "Item SKU, ID, or product name (e.g. 'URISPAS TAB', 'Apple Mac Mini', '7PKFJ7I5ND')"
              },
              sku: {
                type: "string",
                description: "Explicit product SKU code if provided on bill, optional."
              },
              quantity: {
                type: "number",
                description: "Billed quantity received (e.g. 50, 10)"
              },
              free_qty: {
                type: "number",
                description: "Free scheme quantity (e.g. 5 for 'buy 50 get 5 free'), optional."
              },
              unit_cost: {
                type: "number",
                description: "Unit cost price before discount/tax (optional if cost_price given)."
              },
              cost_price: {
                type: "number",
                description: "Net unit purchase cost price after line discounts."
              },
              selling_price: {
                type: "number",
                description: "Selling price to update on shop_items.price (optional)."
              },
              price: {
                type: "number",
                description: "Alias for selling_price (optional)."
              },
              markup_pct: {
                type: "number",
                description: "Markup percentage on cost_price (optional)."
              },
              mrp: {
                type: "number",
                description: "Maximum Retail Price (default_mrp), optional."
              },
              tax_pct: {
                type: "number",
                description: "GST / Tax percentage (e.g. 12 for 12% GST), optional."
              },
              batch_number: {
                type: "string",
                description: "Batch / Lot number (e.g. 'B2401', optional."
              },
              expiry_date: {
                type: "string",
                description: "Expiry date string (e.g. '2026-12', '12/26'), optional."
              }
            },
            required: ["item", "quantity"]
          },
          description: "List of items received on the purchase invoice"
        },
        notes: { type: "string", description: "Optional notes or comments." }
      },
      required: ["vendor_name", "line_items"]
    },
    handler: async (args, ctx) => {
      const { vendor_name, line_items, invoice_number, location, default_markup_pct } = args;
      const profileId = ctx.profileId;
      let vendorId;
      const existingVendors = await query(
        "SELECT id FROM shop_vendors WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, vendor_name.trim(), `%${vendor_name.trim()}%`]
      );
      if (existingVendors.length > 0) {
        vendorId = existingVendors[0].id;
      } else {
        vendorId = generateId("vend");
        await execute(
          "INSERT INTO shop_vendors (id, profile_id, name, payment_terms, is_active) VALUES (?, ?, ?, ?, 1)",
          [vendorId, profileId, vendor_name.trim(), args.payment_terms || "Net 30"]
        );
      }
      let warehouseId;
      const locName = location || "Main Warehouse";
      const existingWarehouses = await query(
        "SELECT id FROM shop_warehouses WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, locName, `%${locName}%`]
      );
      if (existingWarehouses.length > 0) {
        warehouseId = existingWarehouses[0].id;
      } else {
        warehouseId = generateId("wh");
        await execute(
          "INSERT INTO shop_warehouses (id, profile_id, name, warehouse_type, is_default, is_active) VALUES (?, ?, ?, ?, 1, 1)",
          [warehouseId, profileId, locName, "general"]
        );
      }
      const countRes = await query(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'goods_receipt'",
        [profileId]
      );
      const seq = Number(countRes[0]?.cnt || 0) + 1;
      const docNumber = `GR-${String(seq).padStart(4, "0")}`;
      const docId = generateId("doc");
      let totalCost = 0;
      let totalQty = 0;
      const processedItems = [];
      for (const line of line_items) {
        const itemRef = String(line.item || "").trim();
        const billedQty = Number(line.quantity || 0);
        const freeQty = Number(line.free_qty || 0);
        const totalLineQty = billedQty + freeQty;
        const costPrice = Number(line.cost_price || line.unit_cost || 0);
        const mrp = line.mrp ? Number(line.mrp) : void 0;
        let sellingPrice = line.selling_price || line.price ? Number(line.selling_price || line.price) : void 0;
        if (!sellingPrice && default_markup_pct && costPrice > 0) {
          sellingPrice = Math.round(costPrice * (1 + Number(default_markup_pct) / 100) * 100) / 100;
        }
        let itemId;
        let itemSku;
        let itemName = itemRef;
        const itemsFound = await query(
          "SELECT id, name, sku FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
          [profileId, itemRef, itemRef, itemRef, `%${itemRef}%`]
        );
        if (itemsFound.length > 0) {
          itemId = itemsFound[0].id;
          itemName = itemsFound[0].name;
          itemSku = itemsFound[0].sku || generateSku();
          const updates = [];
          const updateParams = [];
          if (costPrice > 0) {
            updates.push("cost_price = ?");
            updateParams.push(costPrice);
          }
          if (sellingPrice && sellingPrice > 0) {
            updates.push("price = ?");
            updateParams.push(sellingPrice);
          }
          if (mrp && mrp > 0) {
            updates.push("default_mrp = ?");
            updateParams.push(mrp);
          }
          if (updates.length > 0) {
            updates.push("updated_at = strftime('%s','now')");
            updateParams.push(itemId, profileId);
            await execute(
              `UPDATE shop_items SET ${updates.join(", ")} WHERE id = ? AND profile_id = ?`,
              updateParams
            );
          }
        } else {
          itemId = generateId("item");
          itemSku = (line.sku || (itemRef.length <= 16 && !itemRef.includes(" ") ? itemRef : generateSku())).toUpperCase();
          const slug = `item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          await execute(
            `INSERT INTO shop_items (id, profile_id, name, sku, slug, cost_price, price, default_mrp, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
            [itemId, profileId, itemName, itemSku, slug, costPrice, sellingPrice || costPrice, mrp || 0]
          );
        }
        const ledgerId = generateId("stk");
        await execute(
          `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, reference_type, reference_id, created_at)
           VALUES (?, ?, ?, ?, 'purchase', ?, 0, ?, 'goods_receipt', ?, strftime('%s','now'))`,
          [ledgerId, profileId, itemId, warehouseId, totalLineQty, costPrice, docId]
        );
        const lineId = generateId("line");
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
      await execute(
        `INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, vendor_id, warehouse_id, total, status, notes, created_at, updated_at)
         VALUES (?, ?, 'goods_receipt', ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [docId, profileId, docNumber, vendorId, warehouseId, totalCost, args.payment_status || "confirmed", args.notes || ""]
      );
      return {
        success: true,
        doc_id: docId,
        doc_number: docNumber,
        vendor_name,
        invoice_number: invoice_number || null,
        warehouse: locName,
        total_items: processedItems.length,
        total_quantity: totalQty,
        grand_total: totalCost,
        items: processedItems
      };
    }
  },
  {
    name: "product_update_pricing",
    domain: "shop",
    description: "Directly update product pricing, selling price (shop_items.price), cost price (shop_items.cost_price), markup percentage, MRP, or discounts for an existing item by SKU, ID, or name.",
    inputSchema: {
      type: "object",
      properties: {
        sku: {
          type: "string",
          description: "Item SKU, product name, or ID (e.g. '7PKFJ7I5ND', 'Apple Mac Mini', 'item_...')"
        },
        selling_price: { type: "number", description: "New selling price (shop_items.price), optional." },
        price: { type: "number", description: "Alias for selling_price, optional." },
        cost_price: { type: "number", description: "New cost / purchase price (shop_items.cost_price), optional." },
        markup_pct: { type: "number", description: "Markup percentage on cost_price to compute selling price, optional." },
        mrp: { type: "number", description: "Maximum Retail Price (default_mrp), optional." },
        discount_pct: { type: "number", description: "Default discount percentage, optional." }
      },
      required: ["sku"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.sku).trim();
      const items = await query(
        "SELECT id, name, sku, price, cost_price, default_mrp FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, ref, ref, ref, `%${ref}%`]
      );
      if (items.length === 0) {
        throw new Error(`Product not found with identifier: ${ref}`);
      }
      const item = items[0];
      const updates = [];
      const params = [];
      let costPrice = item.cost_price;
      if (args.cost_price !== void 0) {
        costPrice = Number(args.cost_price);
        updates.push("cost_price = ?");
        params.push(costPrice);
      }
      let sellingPrice = args.selling_price !== void 0 ? Number(args.selling_price) : args.price !== void 0 ? Number(args.price) : void 0;
      if (sellingPrice === void 0 && args.markup_pct !== void 0 && costPrice > 0) {
        sellingPrice = Math.round(costPrice * (1 + Number(args.markup_pct) / 100) * 100) / 100;
      }
      if (sellingPrice !== void 0) {
        updates.push("price = ?");
        params.push(sellingPrice);
      }
      if (args.mrp !== void 0) {
        updates.push("default_mrp = ?");
        params.push(Number(args.mrp));
      }
      if (updates.length === 0) {
        return { success: true, message: "No pricing updates specified.", item };
      }
      updates.push("updated_at = strftime('%s','now')");
      params.push(item.id, profileId);
      await execute(`UPDATE shop_items SET ${updates.join(", ")} WHERE id = ? AND profile_id = ?`, params);
      return {
        success: true,
        sku: item.sku,
        name: item.name,
        previous_price: item.price,
        new_price: sellingPrice ?? item.price,
        previous_cost: item.cost_price,
        new_cost: costPrice
      };
    }
  },
  {
    name: "inventory_add_stock",
    domain: "shop",
    description: "Add or adjust stock quantity for a SKU, product name, or item ID. Use for restocks, counts, or corrections.",
    inputSchema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "Item SKU, product name, or identifier (e.g. 'Apple Mac Mini', '2B4FYFAVIO')" },
        quantity_delta: { type: "number", description: "Positive to add stock, negative to remove." },
        movement_type: {
          type: "string",
          enum: ["purchase", "adjustment"],
          description: "Type of movement: 'purchase' for vendor restock or 'adjustment' for manual count/correction (default: 'adjustment')."
        },
        unit_cost: { type: "number", description: "Unit purchase cost if applicable." },
        vendor_name: { type: "string", description: "Vendor name if this is a purchase." },
        invoice_number: { type: "string", description: "Invoice reference number if applicable." },
        location: { type: "string", description: "Optional warehouse name or location tag." }
      },
      required: ["sku", "quantity_delta"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.sku).trim();
      const delta = Number(args.quantity_delta);
      const items = await query(
        "SELECT id, name, sku, cost_price FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, ref, ref, ref, `%${ref}%`]
      );
      let itemId;
      let itemName = ref;
      let itemSku;
      if (items.length > 0) {
        itemId = items[0].id;
        itemName = items[0].name;
        itemSku = items[0].sku;
      } else {
        itemId = generateId("item");
        itemSku = generateSku();
        const slug = `item-${ref.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await execute(
          `INSERT INTO shop_items (id, profile_id, name, sku, slug, cost_price, price, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
          [itemId, profileId, ref, itemSku, slug, args.unit_cost || 0, args.unit_cost || 0]
        );
      }
      const loc = args.location || "Main Warehouse";
      const whs = await query("SELECT id FROM shop_warehouses WHERE profile_id = ? LIMIT 1", [profileId]);
      const warehouseId = whs.length > 0 ? whs[0].id : "default";
      const qtyIn = delta > 0 ? delta : 0;
      const qtyOut = delta < 0 ? Math.abs(delta) : 0;
      const movementType = args.movement_type || (delta > 0 ? "adjustment" : "adjustment");
      const ledgerId = generateId("stk");
      await execute(
        `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
        [ledgerId, profileId, itemId, warehouseId, movementType, qtyIn, qtyOut, args.unit_cost || 0, args.invoice_number || "Stock Adjustment"]
      );
      const balRes = await query(
        "SELECT COALESCE(SUM(qty_in - qty_out), 0) as balance FROM shop_stock_ledger WHERE profile_id = ? AND item_id = ?",
        [profileId, itemId]
      );
      return {
        success: true,
        sku: itemSku,
        name: itemName,
        quantity_delta: delta,
        current_stock: Number(balRes[0]?.balance || 0),
        movement_type: movementType
      };
    }
  },
  {
    name: "inventory_get_levels",
    domain: "shop",
    description: "Look up current stock levels, optionally filtered by SKU or category.",
    inputSchema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "Optional SKU or product name to query specific item balance." },
        category: { type: "string", description: "Optional category name filter." }
      }
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const skuFilter = args.sku ? `%${String(args.sku).trim()}%` : null;
      let sql = `
        SELECT i.id, i.name, i.sku, i.price, i.cost_price,
               COALESCE(SUM(l.qty_in - l.qty_out), 0) as stock_on_hand
        FROM shop_items i
        LEFT JOIN shop_stock_ledger l ON i.id = l.item_id AND l.profile_id = i.profile_id
        WHERE i.profile_id = ?
      `;
      const params = [profileId];
      if (skuFilter) {
        sql += " AND (i.sku LIKE ? OR i.name LIKE ? OR i.id = ?)";
        params.push(skuFilter, skuFilter, args.sku.trim());
      }
      sql += " GROUP BY i.id ORDER BY i.name ASC LIMIT 100";
      const items = await query(sql, params);
      return {
        total: items.length,
        items: items.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          selling_price: r.price,
          cost_price: r.cost_price,
          stock_on_hand: Number(r.stock_on_hand || 0)
        }))
      };
    }
  },
  {
    name: "invoice_create",
    domain: "shop",
    description: "Create and draft a customer sales invoice in the shop billing system.",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer name or company name" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" }
            },
            required: ["description", "quantity", "unit_price"]
          }
        },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" }
      },
      required: ["customer_name", "line_items"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const { customer_name, line_items, due_date } = args;
      let customerId;
      const custs = await query(
        "SELECT id FROM shop_customers WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, customer_name.trim(), `%${customer_name.trim()}%`]
      );
      if (custs.length > 0) {
        customerId = custs[0].id;
      } else {
        customerId = generateId("cust");
        await execute(
          "INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) VALUES (?, ?, ?, ?, 1)",
          [customerId, profileId, customer_name.trim(), "individual"]
        );
      }
      const cntRes = await query(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice'",
        [profileId]
      );
      const seq = Number(cntRes[0]?.cnt || 0) + 1;
      const docNumber = `INV-${String(seq).padStart(4, "0")}`;
      const docId = generateId("doc");
      let grandTotal = 0;
      for (const line of line_items) {
        const lineTotal = Number(line.quantity || 1) * Number(line.unit_price || 0);
        grandTotal += lineTotal;
        const lineId = generateId("line");
        await execute(
          `INSERT INTO shop_document_lines (id, profile_id, document_id, description, quantity, unit_price, total_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
          [lineId, profileId, docId, line.description, line.quantity, line.unit_price, lineTotal]
        );
      }
      await execute(
        `INSERT INTO shop_documents (id, profile_id, doc_type, doc_number, customer_id, total, status, notes, created_at, updated_at)
         VALUES (?, ?, 'invoice', ?, ?, ?, 'draft', ?, strftime('%s','now'), strftime('%s','now'))`,
        [docId, profileId, docNumber, customerId, grandTotal, due_date ? `Due: ${due_date}` : ""]
      );
      return {
        success: true,
        invoice_id: docId,
        invoice_number: docNumber,
        customer_name,
        total: grandTotal,
        status: "draft"
      };
    }
  },
  {
    name: "invoice_send",
    domain: "shop",
    description: "Mark a sales invoice as issued and ready for customer dispatch.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "Invoice document ID or invoice number (e.g. 'doc_...' or 'INV-0001')" },
        recipient_email: { type: "string", description: "Customer email to send the invoice notification to" }
      },
      required: ["invoice_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.invoice_id).trim();
      const docs = await query(
        "SELECT id, doc_number, status FROM shop_documents WHERE profile_id = ? AND (id = ? OR doc_number = ?) LIMIT 1",
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
        status: "sent",
        recipient_email: args.recipient_email || null
      };
    }
  },
  {
    name: "shop_create_new_bill",
    domain: "shop",
    description: "Create a new customer sale bill / sales invoice from natural-language or handwritten-bill input. Resolves or auto-creates items, records stock ledger movements (sale), and writes a SAL-NNNN document.",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer name, company, or 'Counter Sale' for walk-in (optional)." },
        customer_id: { type: "string", description: "Existing customer ID if known (optional)." },
        bill_date: { type: "string", description: "Bill date in YYYY-MM-DD or human format (optional, defaults to today)." },
        payment_status: { type: "string", enum: ["paid", "due", "credit"], description: "Payment status: 'paid', 'due'. Default: 'paid'." },
        payment_method: { type: "string", description: "Payment method: 'cash', 'upi', 'bank_transfer', 'credit'. Default: 'cash'." },
        bill_discount_pct: { type: "number", description: "Optional bill-level discount % applied to total." },
        bill_discount_amt: { type: "number", description: "Optional flat bill discount amount." },
        notes: { type: "string", description: "Optional bill notes or remarks." },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string", description: "Product name, SKU, or ID (e.g. 'Tellzy 40 Tab', 'URISPAS TAB')." },
              qty: { type: "number", description: "Quantity to bill (e.g. 5, 10)." },
              price: { type: "number", description: "Custom unit selling price." },
              unit_price: { type: "number", description: "Alias for price." },
              rate: { type: "number", description: "Alias for price." },
              discount_pct: { type: "number", description: "Line-level discount %." },
              tax: { type: "number", description: "GST / Tax % for this line." },
              mrp: { type: "number", description: "MRP for this item, optional." },
              sku: { type: "string", description: "Explicit SKU code if provided." }
            },
            required: ["item", "qty"]
          },
          description: "List of items on this bill."
        }
      },
      required: ["line_items"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const customerName = args.customer_name?.trim() || "Counter Sale";
      const lineItems = args.line_items || [];
      let customerId;
      const custs = await query(
        "SELECT id FROM shop_customers WHERE profile_id = ? AND (LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
        [profileId, customerName, `%${customerName}%`]
      );
      if (custs.length > 0) {
        customerId = custs[0].id;
      } else {
        customerId = generateId("cust");
        await execute(
          "INSERT INTO shop_customers (id, profile_id, name, customer_type, is_active) VALUES (?, ?, ?, ?, 1)",
          [customerId, profileId, customerName, "walk_in"]
        );
      }
      const whs = await query("SELECT id FROM shop_warehouses WHERE profile_id = ? LIMIT 1", [profileId]);
      const warehouseId = whs.length > 0 ? whs[0].id : "default";
      const cntRes = await query(
        "SELECT COUNT(*) as cnt FROM shop_documents WHERE profile_id = ? AND doc_type = 'invoice' AND doc_number LIKE 'SAL-%'",
        [profileId]
      );
      const seq = Number(cntRes[0]?.cnt || 0) + 1;
      const docNumber = `SAL-${String(seq).padStart(4, "0")}`;
      const docId = generateId("doc");
      let subtotal = 0;
      const billedItems = [];
      for (const line of lineItems) {
        const itemRef = String(line.item || "").trim();
        const qty = Number(line.qty || 1);
        let rate = Number(line.price ?? line.unit_price ?? line.rate ?? 0);
        const discountPct = Number(line.discount_pct || 0);
        let itemId;
        let itemSku;
        let itemName = itemRef;
        const itemsFound = await query(
          "SELECT id, name, sku, price FROM shop_items WHERE profile_id = ? AND (sku = ? OR id = ? OR LOWER(name) = LOWER(?) OR name LIKE ?) LIMIT 1",
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
          itemId = generateId("item");
          itemSku = generateSku();
          const slug = `item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          await execute(
            `INSERT INTO shop_items (id, profile_id, name, sku, slug, price, cost_price, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, strftime('%s','now'), strftime('%s','now'))`,
            [itemId, profileId, itemName, itemSku, slug, rate, 0]
          );
        }
        const discountedRate = rate * (1 - discountPct / 100);
        const lineTotal = Math.round(discountedRate * qty * 100) / 100;
        subtotal += lineTotal;
        const ledgerId = generateId("stk");
        await execute(
          `INSERT INTO shop_stock_ledger (id, profile_id, item_id, warehouse_id, movement_type, qty_in, qty_out, unit_cost, reference_type, reference_id, created_at)
           VALUES (?, ?, ?, ?, 'sale', 0, ?, ?, 'invoice', ?, strftime('%s','now'))`,
          [ledgerId, profileId, itemId, warehouseId, qty, rate, docId]
        );
        const lineId = generateId("line");
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
        [docId, profileId, docNumber, customerId, warehouseId, finalTotal, args.payment_status || "paid", args.notes || ""]
      );
      return {
        success: true,
        doc_id: docId,
        doc_number: docNumber,
        customer_name: customerName,
        payment_status: args.payment_status || "paid",
        payment_method: args.payment_method || "cash",
        subtotal,
        final_total: finalTotal,
        items_count: billedItems.length,
        items: billedItems
      };
    }
  }
];

// src/tools/crm.ts
var crmTools = [
  {
    name: "contact_create",
    domain: "crm",
    description: "Create a new contact or lead in the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the contact" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["name"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const name = String(args.name || "").trim();
      const email = String(args.email || "").trim();
      const phone = String(args.phone || "").trim();
      const tags = JSON.stringify(args.tags || []);
      const parts = name.split(/\s+/);
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(" ");
      const contactId = generateId("ct");
      await execute(
        `INSERT INTO crm_contacts
         (id, profile_id, first_name, last_name, email, phone, tags, status, outreach_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', 'not_contacted', strftime('%s','now'), strftime('%s','now'))`,
        [contactId, profileId, firstName, lastName, email, phone, tags]
      );
      return {
        contact_id: contactId,
        name,
        email,
        phone,
        status: "created"
      };
    }
  },
  {
    name: "contact_update",
    domain: "crm",
    description: "Update fields on an existing CRM contact.",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "Contact ID or email address" },
        fields: {
          type: "object",
          description: 'Partial fields to update, e.g. { "email": "...", "phone": "...", "company": "..." }'
        }
      },
      required: ["contact_id", "fields"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.contact_id).trim();
      const fields = args.fields || {};
      const contacts = await query(
        "SELECT id FROM crm_contacts WHERE profile_id = ? AND (id = ? OR email = ?) LIMIT 1",
        [profileId, ref, ref]
      );
      if (contacts.length === 0) {
        throw new Error(`Contact not found with identifier: ${ref}`);
      }
      const contactId = contacts[0].id;
      const allowedCols = [
        "first_name",
        "last_name",
        "email",
        "phone",
        "company",
        "job_title",
        "website",
        "bio",
        "status",
        "outreach_status",
        "notes",
        "tags"
      ];
      const updates = [];
      const params = [];
      for (const [k, v] of Object.entries(fields)) {
        if (allowedCols.includes(k)) {
          updates.push(`${k} = ?`);
          params.push(typeof v === "object" ? JSON.stringify(v) : v);
        }
      }
      if (updates.length === 0) {
        return { contact_id: contactId, status: "no_changes" };
      }
      updates.push("updated_at = strftime('%s','now')");
      params.push(contactId, profileId);
      await execute(`UPDATE crm_contacts SET ${updates.join(", ")} WHERE id = ? AND profile_id = ?`, params);
      return {
        contact_id: contactId,
        status: "updated",
        updated_fields: Object.keys(fields)
      };
    }
  }
];

// src/tools/content.ts
var contentTools = [
  {
    name: "blog_post_create",
    domain: "content",
    description: "Create or publish a rich HTML blog post, newsletter, docs article, guide, or custom CMS entry. Clean semantic HTML body in body_html.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the blog post, newsletter, doc, or guide" },
        body_html: {
          type: "string",
          description: "Clean semantic HTML body supporting all blocks (<h2>, <h3>, <p>, lists, taskList, tables, pre data-filename, info-card, steps, accordion-group, kbd, images, video embeds). NEVER Markdown or <h1>."
        },
        content_type: {
          type: "string",
          description: "Target hub slug: 'blog' (default), 'n' (newsletter), 'docs', 'guides', or custom CMS slug."
        },
        cms_id: { type: "string", description: "Optional target CMS UUID." },
        collection: { type: "string", description: "Collection name, slug, or ID for Docs/Guides." },
        slug: { type: "string", description: "Optional custom URL slug." },
        excerpt: { type: "string", description: "1-2 sentence teaser summary." },
        ai_summary: { type: "string", description: "Concise TL;DR summary." },
        hero_image_url: { type: "string", description: "Optional cover/hero image URL." },
        media_id: { type: "string", description: "Optional Media Library item ID." },
        cta_button_text: { type: "string", description: "Optional CTA button label." },
        cta_button_url: { type: "string", description: "Optional CTA button URL." },
        additional_details: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" }
            }
          }
        },
        seo_title: { type: "string", description: "Optional SEO meta title." },
        seo_description: { type: "string", description: "Optional SEO meta description." },
        seo_keywords: { type: "string", description: "Optional SEO keywords." },
        status: { type: "string", enum: ["draft", "publish", "published"], default: "draft" },
        published: { type: "boolean", description: "Publish immediately (true) or draft (false)." },
        hidden: { type: "boolean", default: false },
        hide_author: { type: "boolean", default: false }
      },
      required: ["title", "body_html"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const title = String(args.title || "").trim();
      const bodyHtml = String(args.body_html || "");
      const contentType = args.content_type || "blog";
      const postId = generateId("post");
      const rawSlug = args.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = rawSlug || `post-${Date.now()}`;
      const isPublished = args.published === true || args.status === "publish" || args.status === "published" ? 1 : 0;
      const isHidden = args.hidden ? 1 : 0;
      const isHideAuthor = args.hide_author ? 1 : 0;
      const plainText = bodyHtml.replace(/<[^>]+>/g, " ");
      const words = plainText.trim().split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 200));
      await execute(
        `INSERT INTO content
         (id, profile_id, category_id, collection_id, cms_id, slug, title, body_html, excerpt, ai_summary, hero_image_url, media_id, cta_button_text, cta_button_url, additional_details, seo_title, seo_description, seo_keywords, published, hidden, hide_author, word_count, reading_time_mins, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [
          postId,
          profileId,
          contentType,
          args.collection || null,
          args.cms_id || null,
          slug,
          title,
          bodyHtml,
          args.excerpt || null,
          args.ai_summary || null,
          args.hero_image_url || null,
          args.media_id || null,
          args.cta_button_text || null,
          args.cta_button_url || null,
          args.additional_details ? JSON.stringify(args.additional_details) : "[]",
          args.seo_title || title,
          args.seo_description || args.excerpt || null,
          args.seo_keywords || null,
          isPublished,
          isHidden,
          isHideAuthor,
          wordCount,
          readingTime
        ]
      );
      return {
        id: postId,
        title,
        slug,
        content_type: contentType,
        published: isPublished === 1,
        word_count: wordCount,
        reading_time_mins: readingTime,
        status: isPublished === 1 ? "published" : "draft"
      };
    }
  },
  {
    name: "content_list",
    domain: "content",
    description: "List existing blog posts, newsletters, docs, guides, and custom hub entries for the active profile.",
    inputSchema: {
      type: "object",
      properties: {
        content_type: { type: "string", description: "Optional hub slug filter (e.g. 'blog', 'n', 'docs', 'guides')." },
        cms_id: { type: "string", description: "Optional target CMS UUID filter." },
        published_only: { type: "boolean", description: "If true, return only published entries.", default: false },
        limit: { type: "integer", description: "Maximum rows to return (default 30, max 100)." }
      }
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const limit = Math.min(Number(args.limit || 30), 100);
      let sql = "SELECT id, title, slug, excerpt, category_id, published, word_count, created_at FROM content WHERE profile_id = ?";
      const params = [profileId];
      if (args.content_type) {
        sql += " AND category_id = ?";
        params.push(args.content_type);
      }
      if (args.cms_id) {
        sql += " AND cms_id = ?";
        params.push(args.cms_id);
      }
      if (args.published_only) {
        sql += " AND published = 1";
      }
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);
      const rows = await query(sql, params);
      return {
        total: rows.length,
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          content_type: r.category_id,
          published: Boolean(r.published),
          word_count: r.word_count,
          created_at: r.created_at
        }))
      };
    }
  },
  {
    name: "content_get",
    domain: "content",
    description: "Fetch full HTML content and metadata for an existing blog post, newsletter, doc, guide, or custom hub entry by ID or slug.",
    inputSchema: {
      type: "object",
      properties: {
        content_id_or_slug: { type: "string", description: "Content ID (e.g. 'post_...') or URL slug." },
        content_type: { type: "string", description: "Optional hub slug filter." },
        cms_id: { type: "string", description: "Optional target CMS UUID filter." }
      },
      required: ["content_id_or_slug"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.content_id_or_slug).trim();
      const rows = await query(
        "SELECT * FROM content WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1",
        [profileId, ref, ref]
      );
      if (rows.length === 0) {
        throw new Error(`Content not found with identifier: ${ref}`);
      }
      const row = rows[0];
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        body_html: row.body_html,
        excerpt: row.excerpt,
        ai_summary: row.ai_summary,
        hero_image_url: row.hero_image_url,
        content_type: row.category_id,
        published: Boolean(row.published),
        word_count: row.word_count,
        reading_time_mins: row.reading_time_mins,
        seo_title: row.seo_title,
        seo_description: row.seo_description
      };
    }
  },
  {
    name: "content_update",
    domain: "content",
    description: "Update an existing blog post, newsletter, doc, guide, or custom hub entry (HTML body, title, slug, collection, publish status, CTA, SEO).",
    inputSchema: {
      type: "object",
      properties: {
        content_id_or_slug: { type: "string", description: "Target content ID or URL slug." },
        title: { type: "string" },
        slug: { type: "string" },
        body_html: { type: "string" },
        collection: { type: "string" },
        excerpt: { type: "string" },
        ai_summary: { type: "string" },
        hero_image_url: { type: "string" },
        cta_button_text: { type: "string" },
        cta_button_url: { type: "string" },
        seo_title: { type: "string" },
        seo_description: { type: "string" },
        seo_keywords: { type: "string" },
        status: { type: "string", enum: ["draft", "publish", "published"] },
        published: { type: "boolean" },
        hidden: { type: "boolean" },
        hide_author: { type: "boolean" }
      },
      required: ["content_id_or_slug"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.content_id_or_slug).trim();
      const rows = await query("SELECT id FROM content WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1", [
        profileId,
        ref,
        ref
      ]);
      if (rows.length === 0) {
        throw new Error(`Content not found with identifier: ${ref}`);
      }
      const id = rows[0].id;
      const updates = [];
      const params = [];
      const stringFields = [
        "title",
        "slug",
        "body_html",
        "collection",
        "excerpt",
        "ai_summary",
        "hero_image_url",
        "cta_button_text",
        "cta_button_url",
        "seo_title",
        "seo_description",
        "seo_keywords"
      ];
      for (const field of stringFields) {
        if (args[field] !== void 0) {
          const col = field === "collection" ? "collection_id" : field;
          updates.push(`${col} = ?`);
          params.push(args[field]);
        }
      }
      if (args.published !== void 0) {
        updates.push("published = ?");
        params.push(args.published ? 1 : 0);
      } else if (args.status !== void 0) {
        updates.push("published = ?");
        params.push(args.status === "publish" || args.status === "published" ? 1 : 0);
      }
      if (args.hidden !== void 0) {
        updates.push("hidden = ?");
        params.push(args.hidden ? 1 : 0);
      }
      if (args.hide_author !== void 0) {
        updates.push("hide_author = ?");
        params.push(args.hide_author ? 1 : 0);
      }
      if (args.body_html) {
        const words = args.body_html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean);
        updates.push("word_count = ?", "reading_time_mins = ?");
        params.push(words.length, Math.max(1, Math.ceil(words.length / 200)));
      }
      if (updates.length === 0) {
        return { id, status: "no_changes" };
      }
      updates.push("updated_at = strftime('%s','now')");
      params.push(id, profileId);
      await execute(`UPDATE content SET ${updates.join(", ")} WHERE id = ? AND profile_id = ?`, params);
      return {
        id,
        status: "updated",
        updated_fields: Object.keys(args).filter((k) => k !== "content_id_or_slug")
      };
    }
  }
];

// src/tools/pages.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
var __dirname = dirname(fileURLToPath(import.meta.url));
var sectionsCatalogCache = null;
function getSectionsCatalog() {
  if (sectionsCatalogCache) return sectionsCatalogCache;
  try {
    const p = join(__dirname, "..", "data", "sections-catalog.json");
    sectionsCatalogCache = JSON.parse(readFileSync(p, "utf-8"));
    return sectionsCatalogCache;
  } catch (err) {
    console.error("[Pages] Could not load sections-catalog.json:", err);
    return { sections: [], themes: [] };
  }
}
var pagesTools = [
  {
    name: "page_create",
    domain: "pages",
    description: 'Create a complete website page or landing page with title, slug, and visual sections. Use native sections (sc_navbar, sc_hero, sc_use_cases, sc_workspace, sc_under_the_hood, sc_footer, hero_section, pricing, faq, text). For custom HTML/CSS blocks, use component_create first and pass { "type": "custom", "component_id": id }.',
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Website page title (e.g. Home, About Us, Pricing)" },
        slug: { type: "string", description: "URL slug for the page (e.g. home, about, pricing)" },
        excerpt: { type: "string", description: "Short summary or meta excerpt" },
        sections: {
          type: "array",
          description: "List of visual section blocks.",
          items: { type: "object" }
        },
        content: { type: "string", description: "Fallback text or markdown" },
        faq: {
          type: "array",
          description: "Optional FAQ list [{ 'question': '...', 'answer': '...' }]",
          items: { type: "object" }
        },
        seo_title: { type: "string", description: "SEO page title" },
        seo_description: { type: "string", description: "SEO meta description" },
        seo_og_image: { type: "string", description: "OpenGraph image URL" },
        published: { type: "boolean", description: "Whether to publish immediately", default: false }
      },
      required: ["title"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const title = String(args.title).trim();
      const pageId = generateId("page");
      const rawSlug = args.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = rawSlug || `page-${Date.now()}`;
      const sections = JSON.stringify(args.sections || []);
      const faq = JSON.stringify(args.faq || []);
      const isPublished = args.published ? 1 : 0;
      await execute(
        `INSERT INTO pages
         (id, profile_id, slug, title, excerpt, sections, faq, published, seo_title, seo_description, seo_og_image, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
        [
          pageId,
          profileId,
          slug,
          title,
          args.excerpt || null,
          sections,
          faq,
          isPublished,
          args.seo_title || title,
          args.seo_description || args.excerpt || null,
          args.seo_og_image || null
        ]
      );
      return {
        id: pageId,
        title,
        slug,
        published: isPublished === 1,
        sections_count: (args.sections || []).length,
        status: "created"
      };
    }
  },
  {
    name: "page_get",
    domain: "pages",
    description: "Fetch a website page and all its visual sections, faq, and metadata by page ID or slug.",
    inputSchema: {
      type: "object",
      properties: {
        page_id_or_slug: { type: "string", description: "Page ID or slug (e.g. about, pricing, page_xyz)" }
      },
      required: ["page_id_or_slug"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();
      const rows = await query(
        "SELECT * FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1",
        [profileId, ref, ref]
      );
      if (rows.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }
      const p = rows[0];
      let parsedSections = [];
      let parsedFaq = [];
      try {
        parsedSections = JSON.parse(p.sections || "[]");
      } catch {
      }
      try {
        parsedFaq = JSON.parse(p.faq || "[]");
      } catch {
      }
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        sections: parsedSections,
        faq: parsedFaq,
        published: Boolean(p.published),
        seo_title: p.seo_title,
        seo_description: p.seo_description,
        seo_og_image: p.seo_og_image,
        updated_at: p.updated_at
      };
    }
  },
  {
    name: "page_update",
    domain: "pages",
    description: "Update an existing website page's visual sections, title, slug, excerpt, FAQ, SEO metadata, or published status.",
    inputSchema: {
      type: "object",
      properties: {
        page_id_or_slug: { type: "string", description: "Page ID or slug" },
        title: { type: "string" },
        slug: { type: "string" },
        excerpt: { type: "string" },
        sections: { type: "array", items: { type: "object" } },
        faq: { type: "array", items: { type: "object" } },
        published: { type: "boolean" },
        seo_title: { type: "string" },
        seo_description: { type: "string" },
        seo_og_image: { type: "string" }
      },
      required: ["page_id_or_slug"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();
      const pages = await query("SELECT id FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1", [
        profileId,
        ref,
        ref
      ]);
      if (pages.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }
      const id = pages[0].id;
      const updates = [];
      const params = [];
      if (args.title !== void 0) {
        updates.push("title = ?");
        params.push(args.title);
      }
      if (args.slug !== void 0) {
        updates.push("slug = ?");
        params.push(args.slug);
      }
      if (args.excerpt !== void 0) {
        updates.push("excerpt = ?");
        params.push(args.excerpt);
      }
      if (args.sections !== void 0) {
        updates.push("sections = ?");
        params.push(JSON.stringify(args.sections));
      }
      if (args.faq !== void 0) {
        updates.push("faq = ?");
        params.push(JSON.stringify(args.faq));
      }
      if (args.published !== void 0) {
        updates.push("published = ?");
        params.push(args.published ? 1 : 0);
      }
      if (args.seo_title !== void 0) {
        updates.push("seo_title = ?");
        params.push(args.seo_title);
      }
      if (args.seo_description !== void 0) {
        updates.push("seo_description = ?");
        params.push(args.seo_description);
      }
      if (args.seo_og_image !== void 0) {
        updates.push("seo_og_image = ?");
        params.push(args.seo_og_image);
      }
      if (updates.length === 0) {
        return { id, status: "no_changes" };
      }
      updates.push("updated_at = strftime('%s','now')");
      params.push(id, profileId);
      await execute(`UPDATE pages SET ${updates.join(", ")} WHERE id = ? AND profile_id = ?`, params);
      return {
        id,
        status: "updated",
        updated_fields: Object.keys(args).filter((k) => k !== "page_id_or_slug")
      };
    }
  },
  {
    name: "page_publish",
    domain: "pages",
    description: "Toggle published or draft status for a website page by ID or slug.",
    inputSchema: {
      type: "object",
      properties: {
        page_id_or_slug: { type: "string", description: "Page ID or slug" },
        published: { type: "boolean", default: true }
      },
      required: ["page_id_or_slug"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.page_id_or_slug).trim();
      const isPub = args.published !== false ? 1 : 0;
      const pages = await query("SELECT id FROM pages WHERE profile_id = ? AND (id = ? OR slug = ?) LIMIT 1", [
        profileId,
        ref,
        ref
      ]);
      if (pages.length === 0) {
        throw new Error(`Page not found with identifier: ${ref}`);
      }
      const id = pages[0].id;
      await execute("UPDATE pages SET published = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?", [
        isPub,
        id,
        profileId
      ]);
      return {
        id,
        published: isPub === 1,
        status: isPub === 1 ? "published" : "draft"
      };
    }
  },
  {
    name: "page_list",
    domain: "pages",
    description: "List all website pages, URLs, slugs, and publication statuses for the profile.",
    inputSchema: {
      type: "object",
      properties: {
        published_only: { type: "boolean", description: "Filter to only show published pages" }
      }
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      let sql = "SELECT id, title, slug, excerpt, published, updated_at FROM pages WHERE profile_id = ?";
      const params = [profileId];
      if (args.published_only) {
        sql += " AND published = 1";
      }
      sql += " ORDER BY updated_at DESC LIMIT 50";
      const rows = await query(sql, params);
      return {
        total: rows.length,
        pages: rows.map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          published: Boolean(r.published),
          updated_at: r.updated_at
        }))
      };
    }
  },
  {
    name: "component_create",
    domain: "pages",
    description: "Create a bespoke custom HTML/CSS/JS section component saved in user_components. Include schema with field types for editing in Section Editor.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Component name" },
        html: { type: "string", description: "Complete HTML markup" },
        css: { type: "string", description: "Scoped CSS styles, optional" },
        js: { type: "string", description: "Client-side JS interaction logic, optional" },
        ts: { type: "string", description: "TS/TSX component source, optional" },
        schema: { type: "array", description: "Form fields for Section Editor", items: { type: "object" } },
        collection: { type: "string", description: "Category name (default: Custom)", default: "Custom" }
      },
      required: ["name", "html"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const compId = generateId("comp");
      const name = String(args.name).trim();
      const collection = args.collection || "Custom";
      await execute(
        `INSERT INTO user_components
         (id, profile_id, name, html, css, js, schema, collection, type, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'custom', 'agent', strftime('%s','now'), strftime('%s','now'))`,
        [
          compId,
          profileId,
          name,
          args.html,
          args.css || null,
          args.js || null,
          args.schema ? JSON.stringify(args.schema) : "[]",
          collection
        ]
      );
      return {
        id: compId,
        name,
        collection,
        status: "created"
      };
    }
  },
  {
    name: "component_list",
    domain: "pages",
    description: "List all custom components stored in user_components for the profile.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Optional collection filter" }
      }
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      let sql = "SELECT id, name, collection, type, source, created_at FROM user_components WHERE profile_id = ?";
      const params = [profileId];
      if (args.collection) {
        sql += " AND collection = ?";
        params.push(args.collection);
      }
      sql += " ORDER BY created_at DESC LIMIT 50";
      const rows = await query(sql, params);
      return {
        total: rows.length,
        components: rows.map((r) => ({
          id: r.id,
          name: r.name,
          collection: r.collection,
          type: r.type,
          created_at: r.created_at
        }))
      };
    }
  },
  {
    name: "component_get",
    domain: "pages",
    description: "Fetch a custom component by its ID with full HTML, CSS, and JS source.",
    inputSchema: {
      type: "object",
      properties: {
        component_id: { type: "string", description: "Component ID (e.g. comp_xyz)" }
      },
      required: ["component_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.component_id).trim();
      const rows = await query(
        "SELECT * FROM user_components WHERE profile_id = ? AND id = ? LIMIT 1",
        [profileId, ref]
      );
      if (rows.length === 0) {
        throw new Error(`Component not found with ID: ${ref}`);
      }
      const c = rows[0];
      let parsedSchema = [];
      try {
        parsedSchema = JSON.parse(c.schema || "[]");
      } catch {
      }
      return {
        id: c.id,
        name: c.name,
        html: c.html,
        css: c.css,
        js: c.js,
        schema: parsedSchema,
        collection: c.collection
      };
    }
  },
  {
    name: "page_get_section_schema",
    domain: "pages",
    description: "Inspect JSON schema, data fields, and reference HTML/CSS blueprints for native sections (Hero, Features, Conversion, Content, Social Proof, Showcase, Navigation, Footer). Also supports specific section_types or theme.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "PRIMARY FILTER: Section category ('Hero', 'Features', 'Conversion', 'Content', 'Social Proof', 'Showcase', 'Navigation', 'Footer', or 'list')" },
        section_type: { type: "string", description: "Specific section type (e.g. sc_hero, pricing, faq)" },
        section_types: { type: "array", items: { type: "string" } },
        theme: { type: "string", description: "Theme name filter" },
        limit: { type: "number", description: "Max sections to return" }
      }
    },
    handler: async (args, _ctx) => {
      const catalog = getSectionsCatalog();
      const sections = catalog.sections || [];
      const categoryFilter = args.category?.trim().toLowerCase();
      const typeFilter = args.section_type?.trim().toLowerCase();
      const themeFilter = args.theme?.trim().toLowerCase();
      let filtered = sections;
      if (categoryFilter && categoryFilter !== "list" && categoryFilter !== "all") {
        filtered = filtered.filter((s) => s.category?.toLowerCase() === categoryFilter);
      }
      if (typeFilter) {
        filtered = filtered.filter((s) => s.type?.toLowerCase() === typeFilter || s.id?.toLowerCase() === typeFilter);
      }
      if (themeFilter && themeFilter !== "list" && themeFilter !== "all") {
        filtered = filtered.filter((s) => s.theme?.toLowerCase() === themeFilter);
      }
      if (args.limit) {
        filtered = filtered.slice(0, Number(args.limit));
      }
      return {
        total: filtered.length,
        categories: ["Hero", "Navigation", "Features", "Showcase", "Conversion", "Content", "Social Proof", "Footer", "Education"],
        sections: filtered
      };
    }
  }
];

// src/tools/domains.ts
var domainTools = [
  {
    name: "domain_list_expiring",
    domain: "domains",
    description: "List tracked domains from my_domains that are expired or expiring within N days (defaults to 30 days). Returns days left, registrar, auto-renew status, renewal price, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Lookahead horizon in days (e.g. 7, 30, 60). Defaults to 30." }
      }
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const days = Number(args.days || 30);
      const horizonSecs = Math.floor(Date.now() / 1e3) + days * 86400;
      const rows = await query(
        `SELECT id, domain_name, registrar, expiry_date, auto_renew, renewal_price, agent_notes, status
         FROM my_domains
         WHERE profile_id = ? AND (expiry_date <= ? OR status = 'expired')
         ORDER BY expiry_date ASC LIMIT 50`,
        [profileId, horizonSecs]
      );
      return {
        lookahead_days: days,
        total: rows.length,
        domains: rows.map((r) => ({
          id: r.id,
          domain: r.domain_name,
          registrar: r.registrar,
          expiry_date: r.expiry_date,
          auto_renew: Boolean(r.auto_renew),
          renewal_price: r.renewal_price,
          agent_notes: r.agent_notes,
          status: r.status
        }))
      };
    }
  },
  {
    name: "domain_set_agent_notes",
    domain: "domains",
    description: "Record agent analysis, recommendation, or renewal reminders into agent_notes on a domain without overwriting user notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Domain row ID or domain name (e.g. 'dom_xyz' or 'example.com')" },
        text: { type: "string", description: "Agent analysis or notes to save" }
      },
      required: ["id", "text"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const ref = String(args.id).trim();
      const text = String(args.text).trim();
      const domains = await query(
        "SELECT id, domain_name FROM my_domains WHERE profile_id = ? AND (id = ? OR domain_name = ?) LIMIT 1",
        [profileId, ref, ref]
      );
      if (domains.length === 0) {
        throw new Error(`Domain not found with identifier: ${ref}`);
      }
      const domain = domains[0];
      await execute(
        "UPDATE my_domains SET agent_notes = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [text, domain.id, profileId]
      );
      return {
        id: domain.id,
        domain: domain.domain_name,
        agent_notes: text,
        status: "updated"
      };
    }
  }
];

// src/tools/inbox.ts
var inboxTools = [
  {
    name: "inbox_tool_set_category",
    domain: "inbox",
    description: "Classify an email thread into a named category bucket (e.g. 'billing', 'support', 'sales', 'spam').",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID to classify (e.g. th_...)" },
        category: { type: "string", description: "Category label to apply (e.g. 'billing', 'support', 'sales')" }
      },
      required: ["thread_id", "category"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const category = String(args.category).trim();
      await execute(
        "UPDATE inbox_threads SET category = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [category, threadId, profileId]
      );
      return { thread_id: threadId, category, status: "updated" };
    }
  },
  {
    name: "inbox_tool_set_state",
    domain: "inbox",
    description: "Transition an email thread state: open \u2192 snoozed, closed, or archived.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID (e.g. th_...)" },
        state: { type: "string", enum: ["open", "snoozed", "closed", "archived"], description: "New thread state" }
      },
      required: ["thread_id", "state"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const state = String(args.state).trim();
      await execute(
        "UPDATE inbox_threads SET state = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [state, threadId, profileId]
      );
      return { thread_id: threadId, state, status: "updated" };
    }
  },
  {
    name: "inbox_tool_add_label",
    domain: "inbox",
    description: "Append a label tag to a thread's label list.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID" },
        label: { type: "string", description: "Label to add (e.g. 'vip', 'follow-up')" }
      },
      required: ["thread_id", "label"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const label = String(args.label).trim();
      const threads = await query(
        "SELECT labels FROM inbox_threads WHERE id = ? AND profile_id = ? LIMIT 1",
        [threadId, profileId]
      );
      let labels = [];
      if (threads.length > 0 && threads[0].labels) {
        try {
          labels = JSON.parse(threads[0].labels);
        } catch {
        }
      }
      if (!labels.includes(label)) {
        labels.push(label);
      }
      await execute(
        "UPDATE inbox_threads SET labels = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [JSON.stringify(labels), threadId, profileId]
      );
      return { thread_id: threadId, labels, status: "updated" };
    }
  },
  {
    name: "inbox_tool_link_entity",
    domain: "inbox",
    description: "Link an email thread to a CRM entity such as a contact, deal, or order.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID" },
        entity_type: { type: "string", description: "Entity type (e.g. 'contact', 'deal', 'order')" },
        entity_id: { type: "string", description: "Entity ID (e.g. ct_..., deal_...)" }
      },
      required: ["thread_id", "entity_type", "entity_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const entityType = String(args.entity_type).trim();
      const entityId = String(args.entity_id).trim();
      await execute(
        "UPDATE inbox_threads SET entity_type = ?, entity_id = ?, updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [entityType, entityId, threadId, profileId]
      );
      return { thread_id: threadId, entity_type: entityType, entity_id: entityId, status: "linked" };
    }
  },
  {
    name: "inbox_tool_draft_reply",
    domain: "inbox",
    description: "Draft an outbound email reply stored with author=agent.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID to reply to" },
        mailbox_id: { type: "string", description: "Mailbox ID to send from" },
        body: { type: "string", description: "Email body text" },
        subject: { type: "string", description: "Email subject line (default: 'Re:')" },
        to_addrs: { type: "string", description: "Comma-separated recipient addresses" }
      },
      required: ["thread_id", "mailbox_id", "body"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const msgId = generateId("msg");
      const threadId = String(args.thread_id).trim();
      const mailboxId = String(args.mailbox_id).trim();
      const body = String(args.body);
      const subject = String(args.subject || "Re:");
      const toAddrs = String(args.to_addrs || "");
      await execute(
        `INSERT INTO inbox_messages
         (id, profile_id, thread_id, mailbox_id, direction, author, subject, body_html, to_addrs, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'outbound', 'agent', ?, ?, ?, 'draft', strftime('%s','now'), strftime('%s','now'))`,
        [msgId, profileId, threadId, mailboxId, subject, body, toAddrs]
      );
      return {
        message_id: msgId,
        thread_id: threadId,
        status: "draft_created",
        author: "agent"
      };
    }
  },
  {
    name: "inbox_tool_schedule_send",
    domain: "inbox",
    description: "Schedule a draft message to be sent at a future Unix timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Draft message ID" },
        send_after: { type: "integer", description: "Unix timestamp (seconds) when to send" }
      },
      required: ["message_id", "send_after"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const msgId = String(args.message_id).trim();
      const sendAfter = Number(args.send_after);
      await execute(
        "UPDATE inbox_messages SET send_after = ?, state = 'scheduled', updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [sendAfter, msgId, profileId]
      );
      return { message_id: msgId, send_after: sendAfter, status: "scheduled" };
    }
  },
  {
    name: "inbox_tool_archive",
    domain: "inbox",
    description: "Archive an email thread \u2014 sets state=archived.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID to archive" }
      },
      required: ["thread_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      await execute(
        "UPDATE inbox_threads SET state = 'archived', updated_at = strftime('%s','now') WHERE id = ? AND profile_id = ?",
        [threadId, profileId]
      );
      return { thread_id: threadId, status: "archived" };
    }
  },
  {
    name: "inbox_tool_extract_verification_code",
    domain: "inbox",
    description: "Extract an OTP, PIN, or verification code from the latest inbound message in a thread.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string", description: "Thread ID to scan for verification codes" }
      },
      required: ["thread_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const threadId = String(args.thread_id).trim();
      const msgs = await query(
        "SELECT body_html FROM inbox_messages WHERE thread_id = ? AND profile_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1",
        [threadId, profileId]
      );
      if (msgs.length === 0) {
        return { thread_id: threadId, code: null, message: "No inbound messages found in thread" };
      }
      const text = msgs[0].body_html || "";
      const match = text.match(/\b(?:\d{4}|\d{6}|\d{8})\b/);
      return {
        thread_id: threadId,
        code: match ? match[0] : null
      };
    }
  },
  {
    name: "inbox_tool_save_attachments",
    domain: "inbox",
    description: "Flag all attachments on a message to be auto-filed into the media library.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "Message ID whose attachments should be filed" }
      },
      required: ["message_id"]
    },
    handler: async (args, ctx) => {
      const profileId = ctx.profileId;
      const messageId = String(args.message_id).trim();
      await execute(
        "UPDATE inbox_attachments SET storage = 'media' WHERE message_id = ? AND profile_id = ?",
        [messageId, profileId]
      );
      return { message_id: messageId, status: "attachments_filed" };
    }
  }
];

// src/tools/system.ts
var systemTools = [
  {
    name: "system_get_capabilities",
    domain: "system",
    description: "Discover all available BusinessKit platform capabilities, domains, tool counts, and features. Call when the user asks what abilities, tools, or domains exist.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Optional domain filter (e.g. 'shop', 'crm', 'content', 'pages', 'domains')" }
      }
    },
    handler: async (args, _ctx) => {
      const filter = args.domain?.toLowerCase()?.trim();
      const domains = [
        { name: "shop", description: "Shop, inventory restock, purchase invoices, billing, and stock ledger" },
        { name: "crm", description: "Customer relationship management, leads, contacts, and outreach" },
        {
          name: "content",
          description: "Multi-hub CMS content publishing (blog, docs, guides, notes, newsletter) with rich HTML"
        },
        { name: "pages", description: "Website pages, landing pages, site content, and publishing" },
        { name: "domains", description: "Domain portfolio management, RDAP status, expiry tracking, and renewal reminders" },
        { name: "inbox", description: "Unified inbox \u2014 thread triage, labelling, reply drafting, scheduling, and archiving" },
        { name: "system", description: "Platform introspection, profile switching, and agent system utilities" }
      ];
      const matchingDomains = filter && filter !== "all" ? domains.filter((d) => d.name === filter) : domains;
      return {
        platform: "BusinessKit",
        architecture: "Model Context Protocol (MCP) stdio JSON-RPC server",
        active_domains: matchingDomains,
        database_connected: isDbConfigured(),
        total_tools: 36
      };
    }
  },
  {
    name: "profile_list",
    domain: "system",
    description: "List all business/organization profiles available in the active database and check which one is active.",
    inputSchema: {
      type: "object",
      properties: {}
    },
    handler: async (_args, ctx) => {
      let profiles = [];
      if (isDbConfigured()) {
        try {
          profiles = await query("SELECT id, title, slug FROM profiles LIMIT 50");
        } catch (err) {
          console.error("[Profile] Profiles query error:", err);
        }
      }
      return {
        active_profile: ctx.profileId,
        available_profiles: profiles.length > 0 ? profiles : [{ id: ctx.profileId, title: "Default Business" }],
        total: profiles.length > 0 ? profiles.length : 1
      };
    }
  },
  {
    name: "profile_switch",
    domain: "system",
    description: "Switch the active business/organization profile for this MCP session.",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string", description: "The profile ID to switch to" }
      },
      required: ["profile_id"]
    },
    handler: async (args, _ctx) => {
      const newProfileId = String(args.profile_id).trim();
      if (!newProfileId) {
        throw new Error("profile_id is required");
      }
      setActiveProfileId(newProfileId);
      return {
        success: true,
        active_profile: newProfileId,
        status: "switched"
      };
    }
  }
];

// src/tools/index.ts
var allTools = [
  ...shopTools,
  ...crmTools,
  ...contentTools,
  ...pagesTools,
  ...domainTools,
  ...inboxTools,
  ...systemTools
];
var toolMap = /* @__PURE__ */ new Map();
for (const tool of allTools) {
  toolMap.set(tool.name, tool);
}
function getAllToolDefinitions() {
  return allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
async function dispatchTool(name, args) {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const offlineTools = ["system_get_capabilities", "page_get_section_schema"];
  if (offlineTools.includes(name)) {
    return await tool.handler(args, { profileId: "system" });
  }
  if (!isDbConfigured()) {
    throw new Error(
      `Database connection not configured. To execute '${name}', please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in your .env file or environment variables.`
    );
  }
  const profileId = await getActiveProfileId();
  const ctx = {
    profileId
  };
  return await tool.handler(args, ctx);
}

// src/server.ts
async function startServer() {
  const server = new Server(
    {
      name: "io.github.businesskitai/agent",
      version: "1.0.6"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getAllToolDefinitions()
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatchTool(name, args || {});
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
          }
        ],
        isError: false
      };
    } catch (err) {
      console.error(`[MCP Error] tool '${name}' failed:`, err);
      return {
        content: [
          {
            type: "text",
            text: err?.message || String(err)
          }
        ],
        isError: true
      };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[BusinessKit MCP] Server listening on stdio transport.");
  console.error(`[BusinessKit MCP] Database connection status: ${isDbConfigured() ? "CONFIGURED" : "NOT CONFIGURED (set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env)"}`);
}
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts")) {
  startServer().catch((err) => {
    console.error("[BusinessKit MCP] Fatal startup error:", err);
    process.exit(1);
  });
}
export {
  startServer
};
