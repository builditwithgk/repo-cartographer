#!/usr/bin/env node
/**
 * Entry point — dual mode:
 *   • no subcommand  -> run the MCP stdio server (how AI clients launch it)
 *   • map / check    -> run the CLI (how humans and CI use it)
 *
 * The CLI and server modules are imported lazily so neither pays for the other's
 * dependencies at startup.
 */
const CLI_COMMANDS = new Set(["map", "check", "help", "--help", "-h"]);

async function run(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd && CLI_COMMANDS.has(cmd)) {
    const { runCli } = await import("./cli.js");
    await runCli(process.argv.slice(2));
  } else {
    const { startServer } = await import("./server.js");
    await startServer();
  }
}

run().catch((e) => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
