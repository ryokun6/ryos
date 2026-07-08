# ryOS Tests

Bun native test suites (`bun:test`). Layout:

```
tests/
├── setup.ts                 # Global preload (bunfig.toml)
├── helpers/                 # Shared helpers (not suites)
│   ├── test-utils.ts        # API HTTP/auth helpers
│   ├── fake-redis.ts        # In-memory Redis double
│   ├── local-storage-stub.ts
│   └── theme-css-fixtures.ts
├── fixtures/                # Static fixture files
├── unit/<domain>/           # No-server unit / wiring suites
└── integration/
    ├── api/                 # Server-backed API suites (need `bun run dev:api`)
    └── opt-in/              # Env-gated suites (e.g. local WebSocket)
```

## Commands

```bash
bun run test:unit            # all unit suites (no server)
bun run test:api             # all API suites (server required)
bun run test:registration    # validate API/opt-in registry
bun test tests/unit/chat/    # one domain
bun test path/to/file.test.ts
```

## Adding a suite

| Kind | Put it in | Register? |
|------|-----------|-----------|
| Unit / wiring | `tests/unit/<domain>/test-<feature>.test.ts` | Auto-discovered |
| API integration | `tests/integration/api/test-<feature>.test.ts` | Append to `API_TEST_FILES` in `scripts/test-groups.ts` |
| Opt-in / env-gated | `tests/integration/opt-in/test-<feature>.test.ts` | Append to `OPT_IN_TEST_FILES` |

Then run `bun run test:registration`.

See `.cursor/skills/write-tests/SKILL.md` for conventions and helpers.
