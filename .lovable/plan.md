# Add protected agent integrations

## Build
- Add a protected MCP server named **microlearn** using the supported MCP SDK and build plugin.
- Expose focused tools for listing accessible courses and reading a course with its modules and resources.
- Forward each caller's signed-in identity to the database so existing access rules remain enforced.

## Sign-in flow
- Add the OAuth approval page used by ChatGPT, Claude, Lovable, and other compatible clients.
- Preserve the full approval return address through login and signup, then return users to the requesting client.
- Keep the demo login working while ensuring normal OAuth clients use real user sessions.

## Validation
- Generate and validate the MCP manifest.
- Deploy the MCP function and verify authentication, tool discovery, and course reads.
- Check the login return flow, app build, and live endpoint behavior.

## Technical details
- Files: MCP tool definitions and shared database client under `src/lib/mcp/`, MCP registration, OAuth approval page, app routes, login return handling, and Vite plugin configuration.
- Access: OAuth 2.1 with row-level permissions; no administrator key or anonymous data exposure.
