# Context7 MCP Integration

This project is configured to use Context7 MCP for up-to-date documentation and code examples.

## Guidelines for the AI Agent
- **Automatic Invocation**: Always check Context7 when asked about library/API documentation, setup, or configuration steps for external packages (e.g., Supabase, React, Next.js, Radix UI, etc.).
- **Manual Trigger**: If the user adds "use context7" or "use library /library-id" to their prompt, prioritize fetching documentation via Context7 tools.
- **Tools Available**:
  - `context7-mcp:resolve-library-id`: Use this to find the correct ID for a library.
  - `context7-mcp:query-docs`: Use this to get specific documentation snippets.

## Versioning
- When the user specifies a version (e.g., "Next.js 14"), include that version in the `query` parameter of the Context7 tools.
