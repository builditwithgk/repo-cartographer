/**
 * Directory-name -> role hint table. These are deliberately shallow heuristics:
 * a hint the connected LLM refines, never an authoritative classification.
 */
const ROLE_HINTS: Record<string, string> = {
  broker: "external broker/API gateways",
  brokers: "external broker/API gateways",
  gateway: "external API gateways",
  gateways: "external API gateways",
  strategy: "strategy implementations",
  strategies: "strategy implementations",
  engine: "core execution engine",
  engines: "core execution engine",
  execution: "order execution",
  orders: "order management",
  order: "order management",
  risk: "risk management",
  portfolio: "portfolio tracking",
  data: "data ingestion / feeds",
  feeds: "market data feeds",
  monitoring: "monitoring / alerting",
  alerts: "alerting",
  dashboard: "UI dashboard",
  ui: "UI layer",
  frontend: "frontend",
  backend: "backend",
  agents: "AI/LLM agents",
  agent: "AI/LLM agents",
  core: "core utilities",
  common: "shared code",
  shared: "shared code",
  utils: "utility helpers",
  util: "utility helpers",
  helpers: "helper functions",
  lib: "library code",
  libs: "library code",
  tools: "tool implementations",
  resources: "resource handlers",
  handlers: "request handlers",
  tests: "tests",
  test: "tests",
  __tests__: "tests",
  spec: "tests",
  config: "configuration",
  configs: "configuration",
  settings: "configuration",
  db: "database layer",
  database: "database layer",
  models: "data models",
  schemas: "schemas",
  api: "API layer",
  routes: "route handlers",
  router: "routing",
  controllers: "controllers",
  services: "services",
  service: "services",
  components: "UI components",
  pages: "pages / routes",
  views: "views",
  hooks: "hooks",
  middleware: "middleware",
  scripts: "scripts",
  bin: "executables",
  docs: "documentation",
  examples: "examples",
  migrations: "database migrations",
};

/** Guess a role from a module key's last path segment. */
export function roleGuess(moduleKeyValue: string): string {
  const seg = (moduleKeyValue.split("/").pop() ?? moduleKeyValue).toLowerCase();
  return ROLE_HINTS[seg] ?? "(role: model to infer)";
}

/* ------------------------------------------------------------------ *
 * Visual categories. The diagram emitters (Mermaid, DOT) color modules *
 * by coarse role family so the draft reads as an architecture diagram, *
 * not a uniform blob. Same shallow-heuristic caveat as ROLE_HINTS.     *
 * ------------------------------------------------------------------ */

export type RoleCategory = "api" | "core" | "data" | "docs" | "infra" | "shared" | "test" | "ui";

/** Directory names grouped into visual families (must cover every ROLE_HINTS key). */
const CATEGORY_KEYS: Record<RoleCategory, string[]> = {
  ui: ["dashboard", "ui", "frontend", "components", "pages", "views", "hooks"],
  api: ["api", "routes", "router", "controllers", "services", "service", "handlers", "middleware", "gateway", "gateways", "broker", "brokers", "backend"],
  core: ["engine", "engines", "execution", "orders", "order", "risk", "portfolio", "strategy", "strategies", "agent", "agents", "core"],
  data: ["data", "feeds", "db", "database", "models", "schemas", "migrations"],
  shared: ["common", "shared", "utils", "util", "helpers", "lib", "libs", "tools", "resources"],
  test: ["tests", "test", "__tests__", "spec"],
  docs: ["docs", "examples"],
  infra: ["config", "configs", "settings", "scripts", "bin", "monitoring", "alerts"],
};

const CATEGORY_BY_SEGMENT: ReadonlyMap<string, RoleCategory> = new Map(
  (Object.entries(CATEGORY_KEYS) as [RoleCategory, string[]][]).flatMap(([cat, keys]) =>
    keys.map((k) => [k, cat] as const),
  ),
);

/** Visual family for a module key, or null when we have no hint (theme default). */
export function roleCategory(moduleKeyValue: string): RoleCategory | null {
  const seg = (moduleKeyValue.split("/").pop() ?? moduleKeyValue).toLowerCase();
  return CATEGORY_BY_SEGMENT.get(seg) ?? null;
}

/**
 * Fill/stroke per category, shared by both emitters so Mermaid and DOT output
 * look like the same tool drew them. Medium-value fills with white labels stay
 * readable on both light and dark backgrounds (GitHub renders either).
 */
export const CATEGORY_STYLE: Record<RoleCategory, { fill: string; stroke: string }> = {
  api: { fill: "#af7aa1", stroke: "#8a5f7f" },
  core: { fill: "#e15759", stroke: "#b04547" },
  data: { fill: "#59a14f", stroke: "#46803e" },
  docs: { fill: "#9d7660", stroke: "#7c5d4c" },
  infra: { fill: "#b35c00", stroke: "#8f4a00" },
  shared: { fill: "#79706e", stroke: "#5d5654" },
  test: { fill: "#499894", stroke: "#397975" },
  ui: { fill: "#4e79a7", stroke: "#3a5b80" },
};
