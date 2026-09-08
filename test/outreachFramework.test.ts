import assert from "node:assert/strict";

import * as packageExports from "../src/index.js";
import { outreachFramework } from "../src/framework.js";

assert.equal(outreachFramework.schemaVersion, "ii-outreach.framework.v1");
assert.equal(outreachFramework.contractSha256.length, 64);
assert.deepEqual(
  Object.keys(outreachFramework.capabilities),
  [...outreachFramework.capabilityNames]
);

for (const capability of outreachFramework.capabilityNames) {
  const expected = outreachFramework.capabilityEntrypoints[capability];
  const exposed = outreachFramework.capabilities[capability];
  assert.deepEqual(Object.keys(exposed), [...expected]);
  const exposedFunctions = exposed as Record<string, unknown>;
  for (const entrypoint of expected) {
    assert.equal(typeof exposedFunctions[entrypoint], "function", `${capability}.${entrypoint}`);
    assert.equal(
      exposedFunctions[entrypoint],
      (packageExports as Record<string, unknown>)[entrypoint],
      `${entrypoint} must also be a top-level package export`
    );
  }
}

assert.ok(Object.isFrozen(outreachFramework));
assert.ok(Object.isFrozen(outreachFramework.capabilities));
for (const capability of outreachFramework.capabilityNames) {
  assert.ok(Object.isFrozen(outreachFramework.capabilities[capability]));
}
