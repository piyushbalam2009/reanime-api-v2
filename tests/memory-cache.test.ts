import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCache } from "../src/cache/memory-cache.js";

describe("MemoryCache", () => {
  let cache: MemoryCache;
  beforeEach(() => { cache = new MemoryCache(); });

  it("stores and retrieves values", () => {
    cache.set("anime", { title: "Example" }, 30);
    expect(cache.get<{ title: string }>("anime")).toEqual({ title: "Example" });
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("does not store values with a non-positive TTL", () => {
    cache.set("expired", "value", 0);
    expect(cache.get("expired")).toBeUndefined();
  });

  it("clears all entries", () => {
    cache.set("one", 1, 30);
    cache.set("two", 2, 30);
    cache.clear();
    expect(cache.get("one")).toBeUndefined();
    expect(cache.get("two")).toBeUndefined();
  });
});
