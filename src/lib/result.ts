import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wrap a JS value as a pretty-printed JSON tool result. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Return a plain-text tool result (used for the Mermaid diagram string). */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Return a structured error result (isError) instead of throwing. */
export function errResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
