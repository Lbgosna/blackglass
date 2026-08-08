import { describe, expect, it } from "vitest";

import { cn } from "./cn.js";

describe("cn", () => {
  it("combines conditional classes and keeps the final Tailwind utility", () => {
    expect(cn("px-2 text-sm", false && "hidden", ["px-4", { block: true }])).toBe(
      "text-sm px-4 block",
    );
  });
});
