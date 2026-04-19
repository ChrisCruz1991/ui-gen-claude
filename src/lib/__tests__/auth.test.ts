// @vitest-environment node
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: Date;
  path?: string;
};

type StoredCookie = { value: string; options: CookieOptions };

const cookieStore = new Map<string, StoredCookie>();

const mockCookies = {
  get: vi.fn((name: string) => {
    const entry = cookieStore.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }),
  set: vi.fn((name: string, value: string, options: CookieOptions = {}) => {
    cookieStore.set(name, { value, options });
  }),
  delete: vi.fn((name: string) => {
    cookieStore.delete(name);
  }),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookies),
}));

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "development-secret-key"
);
const COOKIE_NAME = "auth-token";

async function importAuth() {
  return await import("../auth");
}

function resetCookieState() {
  cookieStore.clear();
  mockCookies.get.mockClear();
  mockCookies.set.mockClear();
  mockCookies.delete.mockClear();
}

beforeEach(() => {
  resetCookieState();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  test("writes a cookie with the auth-token name", async () => {
    const { createSession } = await importAuth();

    await createSession("user-1", "user@example.com");

    expect(mockCookies.set).toHaveBeenCalledTimes(1);
    const [name] = mockCookies.set.mock.calls[0];
    expect(name).toBe(COOKIE_NAME);
    expect(cookieStore.has(COOKIE_NAME)).toBe(true);
  });

  test("sets httpOnly, sameSite=lax, path=/, and ~7-day expiry", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const { createSession } = await importAuth();
    await createSession("user-1", "user@example.com");

    const stored = cookieStore.get(COOKIE_NAME)!;
    expect(stored.options.httpOnly).toBe(true);
    expect(stored.options.sameSite).toBe("lax");
    expect(stored.options.path).toBe("/");
    const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(stored.options.expires?.getTime()).toBe(expectedExpiry.getTime());
  });

  test("secure flag is false outside production", async () => {
    const original = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "development";

    const { createSession } = await importAuth();
    await createSession("user-1", "user@example.com");

    expect(cookieStore.get(COOKIE_NAME)!.options.secure).toBe(false);

    (process.env as any).NODE_ENV = original;
  });

  test("token payload contains userId and email and is verifiable", async () => {
    const { createSession, getSession } = await importAuth();
    await createSession("user-42", "a@b.com");

    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe("user-42");
    expect(session!.email).toBe("a@b.com");
  });
});

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    const { getSession } = await importAuth();
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null when token is malformed", async () => {
    cookieStore.set(COOKIE_NAME, {
      value: "not-a-real-jwt",
      options: {},
    });

    const { getSession } = await importAuth();
    expect(await getSession()).toBeNull();
  });

  test("returns null when token is signed with the wrong secret", async () => {
    const badToken = await new SignJWT({
      userId: "u",
      email: "e@x.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode("a-different-secret"));

    cookieStore.set(COOKIE_NAME, { value: badToken, options: {} });

    const { getSession } = await importAuth();
    expect(await getSession()).toBeNull();
  });

  test("returns null when token is expired", async () => {
    const expiredToken = await new SignJWT({
      userId: "u",
      email: "e@x.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .sign(JWT_SECRET);

    cookieStore.set(COOKIE_NAME, { value: expiredToken, options: {} });

    const { getSession } = await importAuth();
    expect(await getSession()).toBeNull();
  });

  test("returns the session payload for a valid token", async () => {
    const { createSession, getSession } = await importAuth();
    await createSession("user-7", "seven@example.com");

    const session = await getSession();
    expect(session).toMatchObject({
      userId: "user-7",
      email: "seven@example.com",
    });
  });
});

describe("deleteSession", () => {
  test("removes the auth cookie", async () => {
    const { createSession, deleteSession, getSession } = await importAuth();
    await createSession("user-1", "user@example.com");
    expect(cookieStore.has(COOKIE_NAME)).toBe(true);

    await deleteSession();

    expect(mockCookies.delete).toHaveBeenCalledWith(COOKIE_NAME);
    expect(cookieStore.has(COOKIE_NAME)).toBe(false);
    expect(await getSession()).toBeNull();
  });

  test("is a no-op when no cookie exists", async () => {
    const { deleteSession } = await importAuth();
    await expect(deleteSession()).resolves.toBeUndefined();
    expect(mockCookies.delete).toHaveBeenCalledWith(COOKIE_NAME);
  });
});

describe("verifySession", () => {
  function makeRequest(token?: string) {
    return {
      cookies: {
        get: (name: string) =>
          token && name === COOKIE_NAME ? { name, value: token } : undefined,
      },
    } as any;
  }

  test("returns null when request has no auth cookie", async () => {
    const { verifySession } = await importAuth();
    const result = await verifySession(makeRequest());
    expect(result).toBeNull();
  });

  test("returns null when token is invalid", async () => {
    const { verifySession } = await importAuth();
    const result = await verifySession(makeRequest("garbage.token.value"));
    expect(result).toBeNull();
  });

  test("returns payload for a valid token", async () => {
    const token = await new SignJWT({
      userId: "user-9",
      email: "nine@example.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(JWT_SECRET);

    const { verifySession } = await importAuth();
    const result = await verifySession(makeRequest(token));

    expect(result).toMatchObject({
      userId: "user-9",
      email: "nine@example.com",
    });
  });

  test("returns null when token is signed with the wrong secret", async () => {
    const badToken = await new SignJWT({
      userId: "u",
      email: "e@x.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(new TextEncoder().encode("not-the-real-secret"));

    const { verifySession } = await importAuth();
    expect(await verifySession(makeRequest(badToken))).toBeNull();
  });
});
