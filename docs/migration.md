# Migrating from the earlier outreach scaffolding

The September 2026 candidate replaces the earlier Python and Docker outreach
scaffolding with a stateless TypeScript library. This is a breaking change to
the repository layout and commands. The version remains `0.1.0-alpha` while
the public candidate is reviewed.

The earlier repository's public Git history remains available. Existing
projects, authentication files, queues, and operator state must be preserved
outside a new checkout. There is no automatic state migration or legacy
command compatibility layer in this release.

| Earlier surface | Current integration |
| --- | --- |
| Python scripts and Docker Compose | Node.js package exports and an optional CLI |
| Reddit and X scaffolding | Reddit qualification, drafting, approval, scheduling, and receipts |
| Per-project auth and runtime directories | Application-owned adapters and storage |
| Local operator queues | Explicit snapshots passed into library functions |
| Background execution | Application-owned job runner |

Start with [the working example](../examples/quick-start.mjs), then implement
the [host adapters](stateless-framework.md#host-adapters). Import old records
only after translating and validating their schema. Keep the old workspace
available until the new integration has been verified.

This release does not publish an npm registry package. Build the source and
install the local package as described in the README.
