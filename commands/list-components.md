---
id: "cmd_list_components"
name: "List Custom Components"
slash: "/list-components"
description: "List all custom components stored in user_components"
domain_tags: ["pages"]
required_tools: ["component_list"]
---

# List Custom Components (`/list-components`)

List and inspect bespoke HTML/CSS component blocks stored in `user_components` for the Visual Page Builder.

## Available Tools
- `component_list(collection?: string)`: Lists custom components with id, name, collection, and schema definitions.

## Accepted Arguments
- `/list-components` — Lists all custom components across all categories.
- `/list-components Hero` or `/list-components Conversion` — Scopes listing to a single collection category.

## Execution Protocol

### Step 1: Query Components
Call `component_list`:
```json
{
  "collection": "<optional_category_filter>"
}
```

### Step 2: Format Output Table
Display components grouped by collection:

| Name | Collection | ID | Schema Fields |
| :--- | :--- | :--- | :--- |
| Dark ROI Calculator | Conversion | `comp_981` | headline, savingsRate, btnUrl |
| Developer Hero | Hero | `comp_412` | headline, subhead, terminalCode |

### Step 3: Suggest Quick Actions
- To build a new custom component: `/create-component <name>`
- To embed in a page: `{ "type": "custom", "component_id": "<id>" }` inside `/update-page <slug>`.
