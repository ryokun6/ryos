---
name: desktop-release
description: Cut and publish ryOS Electron desktop releases on GitHub. Covers bumping package.json version, tagging v*, triggering Build Electron, and verifying the GitHub release. Use when the user asks to release the desktop app, bump the desktop version, trigger an Electron build, or publish macOS/Windows installers.
---

# Desktop Release (Electron)

ryOS desktop builds are **Electron** artifacts published by GitHub Actions. The **desktop app version** lives in `package.json` (`version` field). Do **not** confuse it with the web app version in `scripts/generate-build-version.ts` / `public/version.json` — those are separate.

## Workflow

| Item | Location |
|------|----------|
| CI workflow | `.github/workflows/build-electron.yml` |
| Builder config | `electron-builder.yml` |
| Build scripts | `bun run electron:build:mac`, `bun run electron:build:windows` |
| Output artifacts | `release/` (DMG, ZIP, NSIS, `latest-mac.yml`, `latest.yml`) |

### Triggers

1. **Versioned release (preferred)** — push a tag matching `v*` (e.g. `v1.0.9`)
   - Builds macOS + Windows
   - Publishes GitHub release **ryOS v1.0.9** (tag = version)
   - Sets release as latest

2. **Manual / dev build** — `workflow_dispatch` on `main`
   - Republishes to the **`desktop`** tag (overwrites assets)
   - Use for unsigned test builds, not semver releases

## Release checklist

```
- [ ] 1. Confirm main is clean and up to date
- [ ] 2. Bump package.json version (semver, e.g. 1.0.8 → 1.0.9)
- [ ] 3. Commit and push to main
- [ ] 4. Create and push tag v{version} (must match package.json)
- [ ] 5. Verify Build Electron workflow started
- [ ] 6. Confirm GitHub release assets when CI completes
```

## Standard release commands

Replace `1.0.9` with the target version.

```bash
# 1. Bump version in package.json, then:
git add package.json
git commit -m "$(cat <<'EOF'
Bump desktop app version to 1.0.9.

EOF
)"
git push origin main

git tag v1.0.9
git push origin v1.0.9
```

## Verify CI

```bash
gh run list --workflow=build-electron.yml --limit 3
gh run watch   # optional: pass run ID from list output
```

When the run succeeds, check:
- https://github.com/ryokun6/ryos/releases/tag/v1.0.9

Expected assets:
- macOS: `ryOS_{version}_aarch64.dmg`, `.zip`, `.zip.blockmap`, `latest-mac.yml`
- Windows: `ryOS_{version}_x64.exe`, `.exe.blockmap`, `latest.yml`

## Manual workflow dispatch (no new tag)

Only when the user explicitly wants a **`desktop`** channel rebuild, not a semver release:

```bash
gh workflow run build-electron.yml --ref main
```

This does **not** bump version. Artifacts land on the `desktop` release with overwrite.

## Version rules

- **Bump only `package.json` `version`** for desktop releases.
- **Tag name must be `v` + that version** (`1.0.9` → `v1.0.9`).
- Check existing tags before choosing a version: `git tag -l 'v1.0.*'` and `gh release list --limit 5`.
- Do not re-tag an existing release unless the user explicitly requests a rebuild of that version (requires deleting/moving the old tag — ask first).

## Git safety

- Never force-push `main` or tags unless the user explicitly asks.
- Do not commit unrelated files with the version bump.
- Do not amend pushed commits.

## Local builds (optional)

For local verification before tagging (requires signing secrets in `.env.local` for mac):

```bash
bun run electron:build:mac      # signed + notarized when Apple env is set
bun run electron:build:windows
```

Local builds do not publish to GitHub. Production releases should go through the CI workflow.

## CI secrets (reference)

macOS signed builds need GitHub Actions secrets documented in `.github/workflows/build-electron.yml` (`APPLE_*`, `EVS_*`). If CI fails on signing, inspect the workflow log — do not paste secret values.

## When the user asks to "trigger a desktop build"

1. Ask for the target version if not stated (suggest next patch bump from latest tag).
2. Bump `package.json`, commit, push, tag, push tag.
3. Report the Actions run URL and expected release tag.
