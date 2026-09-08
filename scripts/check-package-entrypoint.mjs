#!/usr/bin/env node

import { accessSync, readFileSync } from "node:fs";

const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
accessSync(new URL(`../${metadata.types}`, import.meta.url));

const packageExports = await import("ii-outreach");
const framework = packageExports.outreachFramework;

if (!framework || framework.schemaVersion !== "ii-outreach.framework.v1") {
  throw new Error("ii-outreach package entrypoint did not expose the stateless framework");
}

for (const capability of framework.capabilityNames) {
  for (const entrypoint of framework.capabilityEntrypoints[capability]) {
    if (typeof packageExports[entrypoint] !== "function") {
      throw new Error(`ii-outreach package entrypoint is missing ${entrypoint}`);
    }
  }
}
