// AI のエージェントから Zetter Forge を操作するための MCP サーバーの設定と、そのいまの様子。
// 設定は settings.json の mcp に置き、画面の「設定」で変える。
import { isRecord } from "./json";

export interface McpSettings {
  /** MCP サーバーを立てるか（既定はオフ） */
  enabled: boolean;
  /** 127.0.0.1 で待ち受けるポート */
  port: number;
}

/** 選べるポートの範囲（1024 より小さい番号は、OS によっては管理者でないと使えない） */
export const MCP_PORT_MIN = 1024;
export const MCP_PORT_MAX = 65535;

export const DEFAULT_MCP_SETTINGS: McpSettings = { enabled: false, port: 23110 };

/** MCP サーバーのいまの様子 */
export type McpStatus =
  | { state: "off" }
  | { state: "running"; url: string }
  | { state: "failed"; message: string };

/** 画面に渡す、MCP サーバーの設定といまの様子 */
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

/** ポートの欄の文字を数にする。数でないか、範囲の外なら null */
export function parsePort(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,5}$/u.test(trimmed)) return null;
  const port = Number(trimmed);
  return isPort(port) ? port : null;
}

/** 画面から届いた設定が、そのまま使える形か */
export function isMcpSettings(value: unknown): value is McpSettings {
  return isRecord(value) && typeof value.enabled === "boolean" && isPort(value.port);
}

/** settings.json の mcp を読む。欠けた値や使えない値は既定値にする */
export function normalizeMcpSettings(raw: unknown): McpSettings {
  const source = isRecord(raw) ? raw : {};
  return {
    enabled: source.enabled === true,
    port: isPort(source.port) ? source.port : DEFAULT_MCP_SETTINGS.port,
  };
}

/** MCP クライアントに設定する接続先（Streamable HTTP の窓口） */
export function mcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}
