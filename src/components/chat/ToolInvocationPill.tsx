"use client";

import type { ToolInvocation } from "ai";
import { Loader2 } from "lucide-react";

const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

const STR_REPLACE_VERBS: Record<string, { running: string; done: string }> = {
  create: { running: "Creating", done: "Created" },
  str_replace: { running: "Editing", done: "Edited" },
  insert: { running: "Editing", done: "Edited" },
  view: { running: "Reading", done: "Read" },
  undo_edit: { running: "Reverting", done: "Reverted" },
};

const FILE_MANAGER_VERBS: Record<string, { running: string; done: string }> = {
  rename: { running: "Renaming", done: "Renamed" },
  delete: { running: "Deleting", done: "Deleted" },
};

export function describeToolInvocation(
  toolName: string,
  args: Record<string, any> | undefined,
  done: boolean,
): string {
  if (!args || typeof args.command !== "string") return toolName;

  if (toolName === "str_replace_editor") {
    const verb = STR_REPLACE_VERBS[args.command];
    if (!verb) return toolName;
    const label = done ? verb.done : verb.running;
    return typeof args.path === "string" ? `${label} ${basename(args.path)}` : label;
  }

  if (toolName === "file_manager") {
    const verb = FILE_MANAGER_VERBS[args.command];
    if (!verb) return toolName;
    const label = done ? verb.done : verb.running;
    if (typeof args.path !== "string") return label;
    if (args.command === "rename" && typeof args.new_path === "string") {
      return `${label} ${basename(args.path)} → ${basename(args.new_path)}`;
    }
    return `${label} ${basename(args.path)}`;
  }

  return toolName;
}

interface ToolInvocationPillProps {
  toolInvocation: ToolInvocation;
}

export function ToolInvocationPill({ toolInvocation }: ToolInvocationPillProps) {
  const done =
    toolInvocation.state === "result" &&
    (toolInvocation as { result?: unknown }).result != null;
  const label = describeToolInvocation(
    toolInvocation.toolName,
    toolInvocation.args as Record<string, any> | undefined,
    done,
  );

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="tool-invocation-pill"
      className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200"
    >
      {done ? (
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
