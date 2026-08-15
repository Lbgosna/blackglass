import { describe, expect, it } from "vitest";

import { engagementMatchesFilter } from "./workspace-context.js";

describe("engagementMatchesFilter", () => {
  it("matches name or kind and ignores surrounding spaces", () => {
    expect(engagementMatchesFilter("Target lab", "Lab", "")).toBe(true);
    expect(engagementMatchesFilter("Target lab", "Lab", "  target  ")).toBe(true);
    expect(engagementMatchesFilter("Target lab", "Lab", "ctf")).toBe(false);
    expect(engagementMatchesFilter("Parked box", "CTF", "ctf")).toBe(true);
  });
});
