import assert from "node:assert/strict";
import test from "node:test";

import { formatErrors } from "./check-files.mjs";

test("accepts normalized text", () => {
  assert.deepEqual(formatErrors("one\ntwo\n"), []);
});

test("reports carriage returns, missing final newline, and trailing whitespace", () => {
  assert.deepEqual(formatErrors("one \r\ntwo"), [
    "contains carriage returns",
    "does not end with a newline",
    "line 1 has trailing whitespace",
  ]);
});
