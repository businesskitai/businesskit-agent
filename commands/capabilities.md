---
id: "cmd_capabilities"
name: "Platform Capabilities"
slash: "/capabilities"
description: "Discover all available BusinessKit platform capabilities"
domain_tags: ["system"]
required_tools: ["system_get_capabilities"]
---

# Platform Capabilities (`/capabilities`)

Inspect active profile settings, enabled modules, store currency, tax configurations, and system toolsets.

## Available Tools
- `system_get_capabilities()`: Queries the active profile's installed modules and runtime capabilities.

## Accepted Arguments
- `/capabilities`

## Execution Protocol

### Step 1: Query System Capabilities
Call `system_get_capabilities()`:
```json
{}
```

### Step 2: Present System Summary
Format a clean markdown report:
- **Active Profile**: Store Name, Profile ID, Currency, Location
- **Installed Modules**: Shop & POS, Pages & Landing Pages, Docs / Content, CRM, Domains, Inbox
- **Available MCP Tools**: Summary of active tool count
- **Tax & Compliance**: Active tax regime (e.g. GST, Sales Tax, VAT) and inclusive/exclusive pricing mode.
