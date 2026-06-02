import type { TuesdayMcpTool, McpContext } from './types';

const tools = new Map<string, TuesdayMcpTool>();

export function registerTool(tool: TuesdayMcpTool): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): TuesdayMcpTool | undefined {
  return tools.get(name);
}

export function getAllTools(): TuesdayMcpTool[] {
  return Array.from(tools.values());
}

export { tools };