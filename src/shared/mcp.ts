import { asRecord, booleanOr, isRecord } from "./json";

export interface McpSettings {
  enabled: boolean;
  port: number;
}

export const MCP_PORT_MIN = 1024;
export const MCP_PORT_MAX = 65535;

export const DEFAULT_MCP_SETTINGS: McpSettings = { enabled: false, port: 23110 };

export type McpStatus =
  | { state: "off" }
  | { state: "running"; url: string }
  | { state: "failed"; message: string };

export interface McpInfo {
  settings: McpSettings;
  status: McpStatus;
}

function isPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MCP_PORT_MIN &&
    value <= MCP_PORT_MAX
  );
}

export function parsePort(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/u.test(trimmed)) return null;
  const port = Number(trimmed);
  return isPort(port) ? port : null;
}

export function isMcpSettings(value: unknown): value is McpSettings {
  return isRecord(value) && typeof value.enabled === "boolean" && isPort(value.port);
}

export function normalizeMcpSettings(raw: unknown): McpSettings {
  const source = asRecord(raw);
  return {
    enabled: booleanOr(source.enabled, DEFAULT_MCP_SETTINGS.enabled),
    port: isPort(source.port) ? source.port : DEFAULT_MCP_SETTINGS.port,
  };
}

export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}
