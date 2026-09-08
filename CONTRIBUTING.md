# Contributing

Create a branch from the latest `main`. Describe the behavior being changed
and include a small reproduction or test that exercises it.

Use Node.js 22 or later. From the package root, run:

```bash
npm ci
npm run check
npm test
node examples/quick-start.mjs
```

Tests use supplied snapshots, explicit clocks, and generic examples. They must
not contact live accounts, run models, send messages, or read real credentials.
Use uniquely owned temporary directories and remove only test-owned data.

Keep networking, persistence, credentials, UI, and recurring jobs in host
adapters. Changes to the capability contract must update its generated source
with `npm run generate` and include behavior tests.

By contributing, you agree that your contribution is licensed under the
project's [MIT license](LICENSE).
