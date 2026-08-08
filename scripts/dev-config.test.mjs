import assert from "node:assert/strict";
import test from "node:test";

import { readDevConfig } from "./dev-config.mjs";

const repositoryRoot = "/tmp/blackglass-config-test";

test("uses default development ports only when values are missing", () => {
  assert.deepEqual(readDevConfig({}, repositoryRoot), {
    apiPort: 3001,
    dataDirectory: "/tmp/blackglass-config-test/.blackglass/dev",
    webPort: 5173,
  });
});

test("accepts decimal ports and a resolved absolute data directory", () => {
  assert.deepEqual(
    readDevConfig(
      {
        BLACKGLASS_API_PORT: "1",
        BLACKGLASS_DATA_DIR: "/tmp/blackglass-config-test/data/../runtime",
        BLACKGLASS_WEB_PORT: "65535",
      },
      repositoryRoot,
    ),
    {
      apiPort: 1,
      dataDirectory: "/tmp/blackglass-config-test/runtime",
      webPort: 65_535,
    },
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
      () => readDevConfig({ [name]: value }, repositoryRoot),
      new RegExp(`${name} must be a decimal integer from 1 through 65535`),
    );
  });
}

test("rejects equal API and web ports", () => {
  assert.throws(
    () =>
      readDevConfig(
        { BLACKGLASS_API_PORT: "4000", BLACKGLASS_WEB_PORT: "4000" },
        repositoryRoot,
      ),
    /must use different ports/,
  );
});

for (const value of ["", "relative/path", "./data", "data\0directory"]) {
  test(`rejects unsafe BLACKGLASS_DATA_DIR value ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => readDevConfig({ BLACKGLASS_DATA_DIR: value }, repositoryRoot),
      /BLACKGLASS_DATA_DIR must be a non-empty absolute path without NUL bytes/,
    );
  });
}

test("requires an absolute repository root for the default data directory", () => {
  assert.throws(() => readDevConfig({}, "relative/repository"), /repository root must be absolute/);
});
