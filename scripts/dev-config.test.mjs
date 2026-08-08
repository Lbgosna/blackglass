import assert from "node:assert/strict";
import test from "node:test";

import { readDevConfig } from "./dev-config.mjs";

test("uses default development ports only when values are missing", () => {
  assert.deepEqual(readDevConfig({}), { apiPort: 3001, webPort: 5173 });
});

test("accepts decimal ports across the valid range", () => {
  assert.deepEqual(
    readDevConfig({ BLACKGLASS_API_PORT: "1", BLACKGLASS_WEB_PORT: "65535" }),
    { apiPort: 1, webPort: 65_535 },
  );
});

for (const [name, value] of [
  ["BLACKGLASS_API_PORT", ""],
  ["BLACKGLASS_API_PORT", "0"],
  ["BLACKGLASS_API_PORT", "65536"],
  ["BLACKGLASS_API_PORT", "1.5"],
  ["BLACKGLASS_API_PORT", "+1"],
  ["BLACKGLASS_WEB_PORT", " 5173"],
  ["BLACKGLASS_WEB_PORT", "5173 "],
  ["BLACKGLASS_WEB_PORT", "1e3"],
]) {
  test(`rejects invalid ${name} value ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => readDevConfig({ [name]: value }),
      new RegExp(`${name} must be a decimal integer from 1 through 65535`),
    );
  });
}

test("rejects equal API and web ports", () => {
  assert.throws(
    () => readDevConfig({ BLACKGLASS_API_PORT: "4000", BLACKGLASS_WEB_PORT: "4000" }),
    /must use different ports/,
  );
});
