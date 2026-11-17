import { checkForUpdate, isNewerVersion, type UpdateCheckDeps } from "../src/updateCheck.js";

function deps(overrides: Partial<UpdateCheckDeps> = {}): UpdateCheckDeps {
  return {
    getLatestVersion: async () => null,
    getInstalledVersion: () => "1.1.1",
    readLastCheck: () => null,
    writeLastCheck: () => {},
    now: () => 1_000_000,
    ...overrides,
  };
}

describe("isNewerVersion", () => {
  test("returns true when latest is strictly newer", () => {
    expect(isNewerVersion("1.1.1", "1.2.0")).toBe(true);
    expect(isNewerVersion("1.1.1", "1.1.2")).toBe(true);
    expect(isNewerVersion("1.1.1", "2.0.0")).toBe(true);
    expect(isNewerVersion("1.1.1", "1.2.0-beta.1")).toBe(true);
  });

  test("returns false when latest is older", () => {
    expect(isNewerVersion("1.2.0", "1.1.1")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  test("returns false for equal versions (prerelease/build ignored)", () => {
    expect(isNewerVersion("1.1.1", "1.1.1")).toBe(false);
    expect(isNewerVersion("1.1.1", "1.1.1-beta.1")).toBe(false);
    expect(isNewerVersion("1.1.1", "1.1.1+build.7")).toBe(false);
  });

  test("treats missing parts as 0", () => {
    expect(isNewerVersion("1.1", "1.1.1")).toBe(true);
    expect(isNewerVersion("1", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.2.3", "1.2")).toBe(false);
  });

  test("compares numerically, not lexicographically", () => {
    expect(isNewerVersion("1.2.9", "1.2.10")).toBe(true);
    expect(isNewerVersion("1.2.10", "1.2.9")).toBe(false);
  });

  test("degrades gracefully on malformed input (non-numeric → 0)", () => {
    expect(isNewerVersion("not-a-version", "0.0.1")).toBe(true);
    expect(isNewerVersion("garbage", "garbage")).toBe(false);
    expect(isNewerVersion("", "1.0.0")).toBe(true);
  });
});

describe("checkForUpdate", () => {
  let errorSpy: jest.SpyInstance;
  const prevEnv = process.env.FINTECIA_UPDATE_CHECK;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.FINTECIA_UPDATE_CHECK;
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (prevEnv === undefined) delete process.env.FINTECIA_UPDATE_CHECK;
    else process.env.FINTECIA_UPDATE_CHECK = prevEnv;
  });

  test("opt-out: no-op when FINTECIA_UPDATE_CHECK=off|0", async () => {
    for (const value of ["off", "0"]) {
      process.env.FINTECIA_UPDATE_CHECK = value;
      const getLatestVersion = jest.fn(async () => "9.9.9");
      await checkForUpdate(deps({ getLatestVersion }));
      expect(getLatestVersion).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    }
  });

  test("TTL: skips when checked within the last 24h", async () => {
    const now = 1_000_000_000;
    const getLatestVersion = jest.fn(async () => "9.9.9");
    const writeLastCheck = jest.fn();

    await checkForUpdate(
      deps({ now: () => now, readLastCheck: () => now - 60_000, getLatestVersion, writeLastCheck }),
    );

    expect(getLatestVersion).not.toHaveBeenCalled();
    expect(writeLastCheck).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("TTL: checks when the last check is older than 24h", async () => {
    const now = 1_000_000_000;
    const getLatestVersion = jest.fn(async () => "1.1.1");

    await checkForUpdate(
      deps({ now: () => now, readLastCheck: () => now - 25 * 60 * 60 * 1000, getLatestVersion }),
    );

    expect(getLatestVersion).toHaveBeenCalledTimes(1);
  });

  test("newer version writes the notice with the update command", async () => {
    const now = 1_000_000_000;
    const writeLastCheck = jest.fn();

    await checkForUpdate(
      deps({
        now: () => now,
        readLastCheck: () => null,
        getInstalledVersion: () => "1.1.1",
        getLatestVersion: async () => "1.2.0",
        writeLastCheck,
      }),
    );

    expect(writeLastCheck).toHaveBeenCalledWith(now);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain("hay una versión nueva (v1.1.1 → v1.2.0)");
    expect(message).toContain("npm install -g fintecia");
  });

  test("no notice when installed is already up to date", async () => {
    await checkForUpdate(
      deps({ getInstalledVersion: () => "1.1.1", getLatestVersion: async () => "1.1.1" }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("no notice when the latest version cannot be fetched", async () => {
    await checkForUpdate(
      deps({ getInstalledVersion: () => "1.1.1", getLatestVersion: async () => null }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("no-op when a getLatestVersion failure is thrown (never surfaces)", async () => {
    await expect(
      checkForUpdate(
        deps({ getLatestVersion: async () => Promise.reject(new Error("boom")) }),
      ),
    ).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
