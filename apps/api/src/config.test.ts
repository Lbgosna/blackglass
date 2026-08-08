import { describe, expect, it } from "vitest";

import { apiPortFromEnvironment, dataDirectoryFromEnvironment } from "./config.js";

describe("apiPortFromEnvironment", () => {
  it("uses the default only when the value is missing", () => {
    expect(apiPortFromEnvironment({})).toBe(3001);
  });

  it("accepts the complete port range", () => {
    expect(apiPortFromEnvironment({ BLACKGLASS_API_PORT: "1" })).toBe(1);
    expect(apiPortFromEnvironment({ BLACKGLASS_API_PORT: "65535" })).toBe(65_535);
  });

  it.each(["", "0", "65536", "1.5", "+1", " 3001", "3001 ", "1e3", "abc"])(
    "rejects invalid value %j",
    (value) => {
      expect(() => apiPortFromEnvironment({ BLACKGLASS_API_PORT: value })).toThrow(
        "BLACKGLASS_API_PORT must be a decimal integer from 1 through 65535.",
      );
    },
  );
});

describe("dataDirectoryFromEnvironment", () => {
  it("accepts and resolves an explicit absolute path", () => {
    expect(
      dataDirectoryFromEnvironment({
        BLACKGLASS_DATA_DIR: "/tmp/blackglass-api-config/data/../runtime",
      }),
    ).toBe("/tmp/blackglass-api-config/runtime");
  });

  it.each([undefined, "", "relative/path", "data\0directory"])(
    "rejects missing or unsafe value %j",
    (value) => {
      expect(() =>
        dataDirectoryFromEnvironment({ BLACKGLASS_DATA_DIR: value }),
      ).toThrow("BLACKGLASS_DATA_DIR must be an explicit absolute path without NUL bytes.");
    },
  );
});
