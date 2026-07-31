import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * All author/contact details live in this single constant so they are easy to
 * update in one place. Returned verbatim by the `about://author` resource.
 */
export const AUTHOR = `# builditwithgk

Hi — I'm Gopi K Aitham (builditwithgk). I build practical AI tooling,
autonomous agents, and MCP servers.

**repo-cartographer** is one of my open-source projects. If it saved you
time and you'd like help building LLM or agent tooling for your team, I'm
available for freelance and contract work.

- GitHub: https://github.com/builditwithgk
- HuggingFace: https://huggingface.co/builditwithgk
- Portfolio: https://scaleup-solutions.in/
- Email: builditwithgk@gmail.com

_Available for work._
`;

/** Register the `about://author` resource (Markdown business card). */
export function registerAuthorResource(server: McpServer): void {
  server.registerResource(
    "author",
    "about://author",
    {
      title: "About the author",
      description: "Who built repo-cartographer and how to get in touch.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: AUTHOR }],
    }),
  );
}
