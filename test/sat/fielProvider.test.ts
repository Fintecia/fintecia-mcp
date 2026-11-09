import { InMemoryFielProvider } from "../../src/sat/fielProvider.js";

describe("InMemoryFielProvider", () => {
  test("loads material by RFC (case-insensitive)", async () => {
    const provider = new InMemoryFielProvider();
    provider.set("AAA010101AAA", { cer: "cer", key: "key", password: "pass" });
    const loaded = await provider.load("aaa010101aaa");
    expect(loaded).toEqual({ cer: "cer", key: "key", password: "pass" });
  });

  test("returns null for an unknown RFC", async () => {
    expect(await new InMemoryFielProvider().load("ZZZ010101ZZZ")).toBeNull();
  });
});
