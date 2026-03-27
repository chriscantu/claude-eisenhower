# GitHub Release Automation — Feature Spec

**Plugin**: claude-eisenhower
**Version**: 0.7.0 (planned)
**Status**: Draft — pending author review
**Last updated**: 2026-02-21
**Author**: Cantu

---

## Problem Statement

Today, producing and distributing a new plugin version is a manual multi-step process:

1. Bump `plugin.json` version by hand
2. Update `ROADMAP.md` by hand
3. Run `npm run package` locally
4. Upload the `.plugin` artifact somewhere manually

There is no enforced gate between "bump the version" and "artifact exists on GitHub." A version can be committed without a corresponding artifact, or an artifact can be built from a dirty/uncommitted tree. There is also no canonical download URL — recipients get the file however the author remembers to send it.

---

## Goals

1. **Tag-triggered build** — Pushing a `v*` git tag automatically produces a `.plugin` artifact and attaches it to a GitHub Release.
2. **Single source of truth for version** — `plugin.json` is the canonical version; the workflow reads it, never hardcodes it.
3. **Artifact on every release** — GitHub Releases page becomes the canonical distribution point. Anyone can download the `.plugin` from a stable URL.
4. **Reuse existing build script** — The workflow calls `npm run package` (the same script used locally), not a separate CI-only path. No duplication.
5. **No secrets required** — Uses the built-in `GITHUB_TOKEN` provided by Actions; no PAT or external credentials.
6. **macOS runner** — The build script targets macOS (`git archive`, Apple toolchain). The workflow uses `macos-latest`.

---

## Non-Goals

1. **No auto version-bump** — The engineer bumps `plugin.json` and ROADMAP manually before tagging. The workflow does not write back to the repo.
2. **No branch protection rules** — This spec does not define branch protection; that is a repo settings concern.
3. **No npm publish** — The artifact is a `.plugin` file, not an npm package.
4. **No Slack/email notifications** — Out of scope for v0.7.0.
5. **No pre-release builds on every push** — Only tags trigger the release job.

---

## Trigger Convention

Tags must follow the pattern `v{semver}` to trigger the workflow:

```
v0.7.0    ← triggers release
v0.7.1    ← triggers release
feature/x ← does NOT trigger
main      ← does NOT trigger
```

The version in the tag **must match** `plugin.json`. The workflow validates this and fails loudly if they diverge.

---

## User Stories (Gherkin)

### Scenario 1: Engineer pushes a version tag

```gherkin
Feature: Automated plugin build on tag push

  Scenario: Engineer tags v0.7.0 and pushes
    Given plugin.json contains version "0.7.0"
    And the working tree is clean and committed
    When the engineer runs:
      git tag v0.7.0 && git push origin v0.7.0
    Then GitHub Actions triggers the release workflow
    And the workflow builds claude-eisenhower-0.7.0.plugin via npm run package
    And a GitHub Release named "v0.7.0" is created
    And the .plugin file is attached as a release asset
    And the release body contains the ROADMAP.md entry for v0.7.0
```

### Scenario 2: Tag version does not match plugin.json

```gherkin
  Scenario: Tag and plugin.json are out of sync
    Given plugin.json contains version "0.6.0"
    When the engineer pushes tag "v0.7.0"
    Then the workflow fails at the version-check step
    And the error message is:
      "Tag v0.7.0 does not match plugin.json version 0.6.0. Align them before releasing."
    And no GitHub Release is created
    And no artifact is uploaded
```

### Scenario 3: Release already exists for that tag

```gherkin
  Scenario: Engineer re-runs workflow for an existing tag
    Given a GitHub Release for v0.7.0 already exists
    When the workflow runs again for tag v0.7.0
    Then the workflow overwrites the existing release asset
    And the release notes are updated
    And the release is NOT duplicated
```

---

## Workflow Design

### File location

```
.github/workflows/release.yml
```

### Steps

```
1. Checkout repo (full history for ROADMAP extraction)
2. Setup Node.js (version from .nvmrc or hardcoded LTS)
3. Install npm deps in scripts/  (npm ci)
4. Read version from .claude-plugin/plugin.json
5. Validate tag name matches plugin.json version — fail if mismatch
6. Run npm run package (produces claude-eisenhower-{version}.plugin)
7. Extract release notes for this version from ROADMAP.md
8. Create GitHub Release via gh CLI or softprops/action-gh-release
   - tag: v{version}
   - name: v{version}
   - body: extracted ROADMAP notes
   - files: claude-eisenhower-{version}.plugin
   - draft: false
   - prerelease: false
```

### Release notes extraction

The workflow extracts the ROADMAP.md row for the current version and uses it as the release body. If no matching row is found, the body falls back to `"See ROADMAP.md for details."`.

---

## Files to Create or Update

| File | Change |
|------|--------|
| `.github/workflows/release.yml` | New — release workflow |
| `integrations/specs/github-release-spec.md` | New — this spec |
| `STRUCTURE.md` | Add `.github/workflows/` to directory listing |
| `ROADMAP.md` | Add v0.7.0 entry when implemented |

---

## Local Developer Workflow (unchanged)

The local workflow from build-spec.md is preserved:

```sh
# Dev build (no test gate, no tag required)
cd scripts && npm run package:dev

# Production build (runs tests first)
cd scripts && npm run release

# Tag and trigger CI release
git tag v0.7.0 && git push origin v0.7.0
```

---

## Open Questions

1. **Release notes format** — Should the release body be just the ROADMAP table row, or a richer format? Could extract a full markdown section if ROADMAP is restructured to use `## v0.7.0` headers instead of a table.
2. **Draft releases** — Should releases be drafted for review before publishing? Keeping `draft: false` keeps it simple for now.
3. **Prerelease tagging** — Should `v0.7.0-beta.1` tags produce pre-releases? Out of scope for v0.7.0 but worth noting.
