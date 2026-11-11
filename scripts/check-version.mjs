#!/usr/bin/env node
// Version gate: package.json `version` must be valid semver, and — when the
// pipeline runs under a release tag (GITHUB_REF=refs/tags/v*) — the tag must
// equal `v<version>`.
//
// Used by both CI (`version_check` job) and Release (pre-publish guard). Fails
// fast so a drift between the git tag and the published version never ships.

import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const version = pkg.version;

// semver: MAJOR.MINOR.PATCH with optional -prerelease and +build metadata.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (typeof version !== "string" || !SEMVER_RE.test(version)) {
  console.error(`FAIL: package.json version "${version}" is not valid semver.`);
  process.exit(1);
}

const ref = process.env.GITHUB_REF ?? "";
if (ref.startsWith("refs/tags/v")) {
  const tag = ref.slice("refs/tags/".length);
  if (tag !== `v${version}`) {
    console.error(
      `FAIL: tag "${tag}" does not match package.json version "v${version}".`,
    );
    process.exit(1);
  }
  console.log(`OK: tag "${tag}" matches package version v${version}.`);
} else {
  console.log(`OK: package.json version ${version} is valid semver.`);
}
