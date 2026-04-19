import { test, expect, describe, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ToolInvocation } from "ai";
import {
  ToolInvocationPill,
  describeToolInvocation,
} from "../ToolInvocationPill";

afterEach(() => {
  cleanup();
});

describe("describeToolInvocation", () => {
  const cases: Array<{
    name: string;
    toolName: string;
    args: Record<string, any> | undefined;
    done: boolean;
    expected: string;
  }> = [
    {
      name: "str_replace_editor create running",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      done: false,
      expected: "Creating App.jsx",
    },
    {
      name: "str_replace_editor create done",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      done: true,
      expected: "Created App.jsx",
    },
    {
      name: "str_replace_editor str_replace running (nested path)",
      toolName: "str_replace_editor",
      args: { command: "str_replace", path: "/src/components/Card.jsx" },
      done: false,
      expected: "Editing Card.jsx",
    },
    {
      name: "str_replace_editor str_replace done",
      toolName: "str_replace_editor",
      args: { command: "str_replace", path: "/src/components/Card.jsx" },
      done: true,
      expected: "Edited Card.jsx",
    },
    {
      name: "str_replace_editor insert running maps to Editing",
      toolName: "str_replace_editor",
      args: { command: "insert", path: "/App.jsx" },
      done: false,
      expected: "Editing App.jsx",
    },
    {
      name: "str_replace_editor view running",
      toolName: "str_replace_editor",
      args: { command: "view", path: "/App.jsx" },
      done: false,
      expected: "Reading App.jsx",
    },
    {
      name: "str_replace_editor view done",
      toolName: "str_replace_editor",
      args: { command: "view", path: "/App.jsx" },
      done: true,
      expected: "Read App.jsx",
    },
    {
      name: "str_replace_editor undo_edit running",
      toolName: "str_replace_editor",
      args: { command: "undo_edit", path: "/App.jsx" },
      done: false,
      expected: "Reverting App.jsx",
    },
    {
      name: "file_manager rename running",
      toolName: "file_manager",
      args: {
        command: "rename",
        path: "/Old.jsx",
        new_path: "/src/New.jsx",
      },
      done: false,
      expected: "Renaming Old.jsx → New.jsx",
    },
    {
      name: "file_manager rename done",
      toolName: "file_manager",
      args: {
        command: "rename",
        path: "/Old.jsx",
        new_path: "/src/New.jsx",
      },
      done: true,
      expected: "Renamed Old.jsx → New.jsx",
    },
    {
      name: "file_manager rename without new_path degrades gracefully",
      toolName: "file_manager",
      args: { command: "rename", path: "/Old.jsx" },
      done: false,
      expected: "Renaming Old.jsx",
    },
    {
      name: "file_manager delete done",
      toolName: "file_manager",
      args: { command: "delete", path: "/Card.jsx" },
      done: true,
      expected: "Deleted Card.jsx",
    },
    {
      name: "known command but path streaming not yet available",
      toolName: "str_replace_editor",
      args: { command: "create" },
      done: false,
      expected: "Creating",
    },
    {
      name: "empty args falls back to raw toolName",
      toolName: "str_replace_editor",
      args: {},
      done: false,
      expected: "str_replace_editor",
    },
    {
      name: "undefined args falls back to raw toolName",
      toolName: "str_replace_editor",
      args: undefined,
      done: false,
      expected: "str_replace_editor",
    },
    {
      name: "unknown toolName falls back to raw toolName",
      toolName: "some_future_tool",
      args: { command: "create", path: "/App.jsx" },
      done: false,
      expected: "some_future_tool",
    },
    {
      name: "known tool with unknown command falls back",
      toolName: "str_replace_editor",
      args: { command: "launch_missiles", path: "/App.jsx" },
      done: false,
      expected: "str_replace_editor",
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      expect(describeToolInvocation(c.toolName, c.args, c.done)).toBe(
        c.expected,
      );
    });
  }
});

describe("ToolInvocationPill", () => {
  test("running state renders spinner, no emerald dot, no raw tool id", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t1",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      state: "call",
    } as ToolInvocation;

    const { container } = render(
      <ToolInvocationPill toolInvocation={toolInvocation} />,
    );

    expect(screen.getByText("Creating App.jsx")).toBeDefined();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector(".bg-emerald-500")).toBeNull();
    expect(screen.queryByText("str_replace_editor")).toBeNull();
  });

  test("done state renders emerald dot, past-tense label, no spinner", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t2",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      state: "result",
      result: "ok",
    } as ToolInvocation;

    const { container } = render(
      <ToolInvocationPill toolInvocation={toolInvocation} />,
    );

    expect(screen.getByText("Created App.jsx")).toBeDefined();
    expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  test("partial-call state is treated as running", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t3",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      state: "partial-call",
    } as ToolInvocation;

    const { container } = render(
      <ToolInvocationPill toolInvocation={toolInvocation} />,
    );

    expect(screen.getByText("Creating App.jsx")).toBeDefined();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  test("state=result with nullish result is treated as running (not done)", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t4",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      state: "result",
      result: null,
    } as unknown as ToolInvocation;

    const { container } = render(
      <ToolInvocationPill toolInvocation={toolInvocation} />,
    );

    expect(screen.getByText("Creating App.jsx")).toBeDefined();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector(".bg-emerald-500")).toBeNull();
  });

  test("pill exposes a live-region status role", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t5",
      toolName: "str_replace_editor",
      args: { command: "create", path: "/App.jsx" },
      state: "call",
    } as ToolInvocation;

    render(<ToolInvocationPill toolInvocation={toolInvocation} />);

    const pill = screen.getByTestId("tool-invocation-pill");
    expect(pill.getAttribute("role")).toBe("status");
    expect(pill.getAttribute("aria-live")).toBe("polite");
  });

  test("unknown tool name still renders something (fallback)", () => {
    const toolInvocation: ToolInvocation = {
      toolCallId: "t6",
      toolName: "some_future_tool",
      args: { command: "create", path: "/App.jsx" },
      state: "call",
    } as ToolInvocation;

    render(<ToolInvocationPill toolInvocation={toolInvocation} />);

    expect(screen.getByText("some_future_tool")).toBeDefined();
  });
});
