# Stateless outreach framework

`ii-outreach` is a reusable outreach policy core. Its public
surface is `outreachFramework` plus the same functions as top-level named
exports. Functions receive their state and provider readback explicitly,
expose time and random inputs so deterministic hosts can supply them, and
return validated data. Importing the package does not
start a server, read credentials, open a browser, make a network request, or
schedule recurring work.

## Capability surface

The canonical list is `contracts/outreach-framework.v1.json`. It maps these
capabilities to mechanically checked package entrypoints:

- Reddit account references, lead standards, job selection, and draft-mode setup;
- campaign planning and strategy;
- subreddit selection from campaign-owned configuration;
- human review queues and decisions;
- resumable participant discovery and exact-source qualification;
- constrained participant drafting and model-output materialization;
- rate-limited participant scheduling and stale-schedule detection;
- delivery claims, batch validation, receipts, and fail-closed outcomes;
- bounded, explicit response checks;
- confirmed messages-per-day and stored-response statistics.

The contract SHA-256 is exported alongside the facade. A non-TypeScript host
can generate or consume language-native constants from this contract and test
the same schema, operation kinds, capabilities, limits, and scheduling policy.

## Host adapters

A complete host supplies these boundaries:

| Boundary | Host responsibility |
| --- | --- |
| Identity and tenancy | Authenticate the human and scope every record to its workspace and campaign. |
| Persistence | Load snapshots before a call and atomically persist returned state or events. |
| Clock and randomness | Pass explicit timestamps and random values for deterministic execution. |
| Research/model | Gather sources or run a model, then pass untrusted output through package validators. |
| Platform transport | Open Reddit through an approved provider and return exact readback evidence. |
| Execution | Run model, browser, and delivery effects ephemerally with resource limits and cleanup proof. |
| Recurrence | Let the host scheduler initiate recurring work; the framework itself never polls. |
| Analytics sink | Store validated counters/events and query them with host-enforced bounds. |

Provider SDKs and credential mechanics stay in these adapters. A missing
adapter fails closed; a host must never silently switch providers.

## Integration sequence

1. Import `outreachFramework` and record its `schemaVersion` and
   `contractSha256` in the host build.
2. Implement the boundaries above without placing provider identifiers in
   domain state.
3. Map the adapter entry IDs in the contract to your own host-native commands.
   Your application supplies their execution and authorization boundaries.
4. Exercise each registered capability against recorded-real provider fixtures
   and run `npm run check && npm test`.
5. Keep human approval mandatory before scheduling or delivery, and keep
   response checks explicit and read-only.

The package ships development checks only. Outreach workflow providers,
execution runtimes, host APIs, account secrets, and browser setup are
deployment-specific and belong in the host implementation.
