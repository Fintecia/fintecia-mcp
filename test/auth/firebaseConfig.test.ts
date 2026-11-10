import { resolveApiBaseUrl } from "../../src/auth/firebaseConfig.js";

describe("resolveApiBaseUrl", () => {
  test("explicit FINTECIA_API_URL wins (and trims the trailing slash)", () => {
    expect(resolveApiBaseUrl("production", "https://custom.example.com/")).toBe(
      "https://custom.example.com",
    );
  });

  test("local defaults to the Hosting emulator (serves /api/v1/* rewrites)", () => {
    expect(resolveApiBaseUrl("local")).toBe("http://127.0.0.1:5000");
  });

  test("staging defaults to the staging web.app host", () => {
    expect(resolveApiBaseUrl("staging")).toBe("https://fintecia-staging.web.app");
  });

  test("production defaults to the prod custom domain", () => {
    expect(resolveApiBaseUrl("production")).toBe("https://app.fintecia.com.mx");
  });

  test("an unknown env fails safe to prod", () => {
    expect(resolveApiBaseUrl("nope")).toBe("https://app.fintecia.com.mx");
  });

  test("the local emulator base can be overridden", () => {
    expect(
      resolveApiBaseUrl("local", undefined, "http://127.0.0.1:5001/other/us-central1"),
    ).toBe("http://127.0.0.1:5001/other/us-central1");
  });

  test("a blank explicit value is ignored", () => {
    expect(resolveApiBaseUrl("production", "   ")).toBe("https://app.fintecia.com.mx");
  });
});
