// src/tools/types.ts
// Shared types for BusinessKit MCP tools

export interface ToolDefinition {
  name: string;
  domain: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<any>;
}

export interface ToolContext {
  profileId: string;
  userId?: string;
  agentName?: string;
  mediaAttachmentId?: string;
}
