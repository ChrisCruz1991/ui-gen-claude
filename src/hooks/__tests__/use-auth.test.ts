import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const signInMock = vi.fn();
const signUpMock = vi.fn();
const getAnonWorkDataMock = vi.fn();
const clearAnonWorkMock = vi.fn();
const getProjectsMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  signUp: (...args: unknown[]) => signUpMock(...args),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => getAnonWorkDataMock(),
  clearAnonWork: () => clearAnonWorkMock(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: () => getProjectsMock(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: (input: unknown) => createProjectMock(input),
}));

import { useAuth } from "@/hooks/use-auth";

describe("useAuth", () => {
  beforeEach(() => {
    pushMock.mockReset();
    signInMock.mockReset();
    signUpMock.mockReset();
    getAnonWorkDataMock.mockReset();
    clearAnonWorkMock.mockReset();
    getProjectsMock.mockReset();
    createProjectMock.mockReset();

    // Sensible defaults: no anon work, no projects, createProject returns id
    getAnonWorkDataMock.mockReturnValue(null);
    getProjectsMock.mockResolvedValue([]);
    createProjectMock.mockResolvedValue({ id: "new-project-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    test("exposes signIn, signUp, and isLoading=false", () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(false);
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    test("returns failure result and does not redirect when credentials are invalid", async () => {
      signInMock.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signIn("bad@example.com", "wrong");
      });

      expect(signInMock).toHaveBeenCalledWith("bad@example.com", "wrong");
      expect(returned).toEqual({ success: false, error: "Invalid credentials" });
      expect(pushMock).not.toHaveBeenCalled();
      expect(createProjectMock).not.toHaveBeenCalled();
      expect(getProjectsMock).not.toHaveBeenCalled();
      expect(clearAnonWorkMock).not.toHaveBeenCalled();
    });

    test("on success with anonymous work, promotes it into a new project and redirects", async () => {
      signInMock.mockResolvedValue({ success: true });
      const anonMessages = [{ role: "user", content: "hi" }];
      const anonFs = { "/App.jsx": { type: "file", content: "x" } };
      getAnonWorkDataMock.mockReturnValue({
        messages: anonMessages,
        fileSystemData: anonFs,
      });
      createProjectMock.mockResolvedValue({ id: "anon-project" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      const input = createProjectMock.mock.calls[0][0];
      expect(input.messages).toBe(anonMessages);
      expect(input.data).toBe(anonFs);
      expect(input.name).toMatch(/^Design from /);

      expect(clearAnonWorkMock).toHaveBeenCalledTimes(1);
      expect(getProjectsMock).not.toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/anon-project");
    });

    test("on success with anon-work object but empty messages, falls through to existing projects", async () => {
      signInMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue({ messages: [], fileSystemData: {} });
      getProjectsMock.mockResolvedValue([
        { id: "recent", name: "Recent" },
        { id: "older", name: "Older" },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(clearAnonWorkMock).not.toHaveBeenCalled();
      expect(createProjectMock).not.toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/recent");
    });

    test("on success with no anon work but existing projects, redirects to the first (most recent) project", async () => {
      signInMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([
        { id: "p1", name: "First" },
        { id: "p2", name: "Second" },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(pushMock).toHaveBeenCalledWith("/p1");
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    test("on success with no anon work and no existing projects, creates a new project and redirects", async () => {
      signInMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockResolvedValue([]);
      createProjectMock.mockResolvedValue({ id: "fresh-project" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      const input = createProjectMock.mock.calls[0][0];
      expect(input.name).toMatch(/^New Design #\d+$/);
      expect(input.messages).toEqual([]);
      expect(input.data).toEqual({});
      expect(pushMock).toHaveBeenCalledWith("/fresh-project");
    });

    test("returns the auth result object from the action", async () => {
      signInMock.mockResolvedValue({ success: true });
      getProjectsMock.mockResolvedValue([{ id: "p1" }]);

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signIn("user@example.com", "password123");
      });

      expect(returned).toEqual({ success: true });
    });

    test("sets isLoading=true while running and resets to false after resolution", async () => {
      let resolveSignIn!: (v: { success: boolean }) => void;
      signInMock.mockReturnValue(
        new Promise((resolve) => {
          resolveSignIn = resolve;
        })
      );

      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);

      let signInPromise!: Promise<unknown>;
      act(() => {
        signInPromise = result.current.signIn("user@example.com", "password123");
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        resolveSignIn({ success: false });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false when the sign-in action throws", async () => {
      signInMock.mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("user@example.com", "password123");
        })
      ).rejects.toThrow("network down");

      expect(result.current.isLoading).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();
    });
  });

  describe("signUp", () => {
    test("returns failure result and does not redirect when sign up fails", async () => {
      signUpMock.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());

      let returned: unknown;
      await act(async () => {
        returned = await result.current.signUp("taken@example.com", "password123");
      });

      expect(signUpMock).toHaveBeenCalledWith("taken@example.com", "password123");
      expect(returned).toEqual({ success: false, error: "Email already registered" });
      expect(pushMock).not.toHaveBeenCalled();
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    test("on success with anon work, promotes it into a new project and redirects", async () => {
      signUpMock.mockResolvedValue({ success: true });
      const anonMessages = [{ role: "user", content: "hello" }];
      const anonFs = { "/App.jsx": { type: "file", content: "y" } };
      getAnonWorkDataMock.mockReturnValue({
        messages: anonMessages,
        fileSystemData: anonFs,
      });
      createProjectMock.mockResolvedValue({ id: "signup-anon-project" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      const input = createProjectMock.mock.calls[0][0];
      expect(input.messages).toBe(anonMessages);
      expect(input.data).toBe(anonFs);
      expect(clearAnonWorkMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/signup-anon-project");
    });

    test("on success with no anon work and existing projects, redirects to first project", async () => {
      signUpMock.mockResolvedValue({ success: true });
      getProjectsMock.mockResolvedValue([{ id: "existing" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(pushMock).toHaveBeenCalledWith("/existing");
    });

    test("on success with no anon work and no projects, creates a new project and redirects", async () => {
      signUpMock.mockResolvedValue({ success: true });
      getProjectsMock.mockResolvedValue([]);
      createProjectMock.mockResolvedValue({ id: "brand-new" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(createProjectMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/brand-new");
    });

    test("toggles isLoading around the action call", async () => {
      let resolveSignUp!: (v: { success: boolean }) => void;
      signUpMock.mockReturnValue(
        new Promise((resolve) => {
          resolveSignUp = resolve;
        })
      );

      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);

      let signUpPromise!: Promise<unknown>;
      act(() => {
        signUpPromise = result.current.signUp("new@example.com", "password123");
      });

      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        resolveSignUp({ success: false });
        await signUpPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false when the sign-up action throws", async () => {
      signUpMock.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signUp("new@example.com", "password123");
        })
      ).rejects.toThrow("boom");

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("post-auth routing edge cases", () => {
    test("propagates errors from createProject when promoting anon work", async () => {
      signInMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue({
        messages: [{ role: "user", content: "x" }],
        fileSystemData: {},
      });
      createProjectMock.mockRejectedValue(new Error("db offline"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("user@example.com", "password123");
        })
      ).rejects.toThrow("db offline");

      expect(clearAnonWorkMock).not.toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    test("propagates errors from getProjects and leaves isLoading false", async () => {
      signInMock.mockResolvedValue({ success: true });
      getAnonWorkDataMock.mockReturnValue(null);
      getProjectsMock.mockRejectedValue(new Error("unauthorized"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("user@example.com", "password123");
        })
      ).rejects.toThrow("unauthorized");

      expect(pushMock).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });
  });
});
