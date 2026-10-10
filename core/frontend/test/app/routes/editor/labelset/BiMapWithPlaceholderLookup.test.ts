import { describe, expect, it } from "vitest";

import { BiMapWithPlaceholderLookup } from "../../../../../app/routes/editor/labelset/BiMapWithPlaceholderLookup";
import { Placeholder } from "../../../../../app/routes/editor/labelset/Placeholder";

async function flushPromises() {
  await Promise.resolve();
}

describe("BiMapWithPlaceholderLookup", () => {
  it("ignores a placeholder that resolves after deletion", async () => {
    const placeholder = new Placeholder<string>();
    const map = new BiMapWithPlaceholderLookup<string, string>();
    map.set(placeholder, "temporary");
    map.delete(placeholder);

    placeholder.put("resolved");
    await flushPromises();

    expect(map.get("resolved")).toBeUndefined();
  });

  it("removes resolved aliases when clearing the map", async () => {
    const placeholder = new Placeholder<string>();
    const map = new BiMapWithPlaceholderLookup<string, string>();
    map.set(placeholder, "temporary");
    placeholder.put("resolved");
    await flushPromises();
    expect(map.get("resolved")).toBe("temporary");

    map.clear();
    expect(map.get("resolved")).toBeUndefined();
  });

  it("prefers a subsequently inserted real key over a resolved alias", async () => {
    const placeholder = new Placeholder<string>();
    const map = new BiMapWithPlaceholderLookup<string, string>();
    map.set(placeholder, "temporary");
    placeholder.put("resolved");
    await flushPromises();

    map.set("resolved", "permanent");
    expect(map.get("resolved")).toBe("permanent");
    expect(map.size).toBe(1);
    expect(map.getKey("temporary")).toBeUndefined();
  });

  it("exposes resolved keys through reverse lookup", async () => {
    const placeholder = new Placeholder<string>();
    const map = new BiMapWithPlaceholderLookup<string, string>();
    map.set(placeholder, "value");

    expect(map.getKey("value")).toBe(placeholder);
    placeholder.put("resolved");
    await flushPromises();

    expect(map.getKey("value")).toBe("resolved");
  });

  it("uses resolved keys consistently for membership, deletion, and size", async () => {
    const placeholder = new Placeholder<string>();
    const map = new BiMapWithPlaceholderLookup<string, string>();
    map.set(placeholder, "value");
    placeholder.put("resolved");
    await flushPromises();

    expect(map.has("resolved")).toBe(true);
    expect(map.size).toBe(1);

    map.delete("resolved");
    expect(map.has("resolved")).toBe(false);
    expect(map.get("resolved")).toBeUndefined();
    expect(map.getKey("value")).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it("distinguishes resolution state from value equality", () => {
    const placeholder = new Placeholder<string>();
    expect(placeholder.isResolved).toBe(false);
    expect(placeholder.hasValue("resolved")).toBe(false);

    placeholder.put("resolved");
    expect(placeholder.isResolved).toBe(true);
    expect(placeholder.hasValue("resolved")).toBe(true);
  });
});
