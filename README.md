# Shiny Computers Homebrew Tap

Homebrew formulae and casks maintained by Shiny Computers.

## Add The Tap

Add and trust the tap once before installing any package from it:

```bash
brew tap cbusillo/tap
brew trust cbusillo/tap
```

## Available Formulae

| Formula | Description | Platform |
| --- | --- | --- |
| `bd-to-avp` | Convert 3D Blu-ray video to Apple spatial video | Apple Silicon, macOS 14+ |

### `bd-to-avp`

The `bd-to-avp` formula installs the Apple Silicon command-line version of
[BD_to_AVP](https://github.com/cbusillo/BD_to_AVP) on macOS 14 or later.

```bash
brew install bd-to-avp
bd-to-avp --help
```

The formula intentionally omits the PySide6 GUI. Install the signed DMG from
the BD_to_AVP releases page for the desktop app. MakeMKV remains a separate
optional requirement for reading Blu-ray discs; existing MKV, MTS, and M2TS
sources do not require it.

## Repository Policy

Changes land through pull requests on protected `main`. Formula changes must
pass audit, source installation, command tests, and linkage checks before merge.
The same checks run on Launchplane train candidates. Routine Actions updates
wait seven days before Dependabot opens them; security updates remain separate.

## Formula Updates

The scheduled/manual updater uses Homebrew livecheck and
[`bump-formula-pr --write-only`](https://docs.brew.sh/Manpage#bump-formula-pr-options-formula)
to calculate and audit an update without Git or PR writes. A missing or failed
livecheck is a failure; a valid no-update result creates no proposal.

A separate fresh hosted job reads that run's bounded data artifact outside an
exact run-SHA checkout. The dependency-free helper preserves every formula byte
except the stable archive URL and SHA-256, checks a newer numeric version of the
same upstream and verifies its published stable GitHub release metadata. It never
loads candidate Ruby or downloads/executes the archive. Homebrew calculates the
checksum in the unprivileged job; ordinary formula CI verifies the archive and
installation. Unexpected files, executable edits, modes, provenance or oversized
requests fail before requesting OIDC. Scheduled runs use GitHub's documented
default-branch ref; manual runs also require the default branch.

Only the submit job has OIDC permission. It uses the existing Launchplane
updater-proposal route and service-held App, with `LAUNCHPLANE_PUBLIC_URL` supplied
as an Actions variable. The exact default-branch workflow selector must already be
approved in Launchplane. Source changes do not grant access or activate policy;
[Launchplane#3404](https://github.com/cbusillo/launchplane/issues/3404) owns live
readiness and real-run qualification. Existing formula CI, review and train gates
apply to App-authored proposals.

Created/replayed results report the actual returned PR and head. Replays may refer
to closed history. Pending means this run's files were not applied and the existing
proposal needs ordinary review. A stale-base conflict needs a fresh calculation
from default. A refusal stops that action; unknown effects retain the exact request
and available response in the workflow's seven-day recovery artifact for supported
reconciliation. There is no direct PR publisher or ref-replacement fallback.
For recovery, re-run **all jobs** on the same run/base so calculation produces a
fresh attempt-bound artifact. Re-running only the submit job cannot reuse the
previous attempt's artifact. Request content stays stable across run IDs/attempts
for the same base and formula update, so the service can reconcile the identical
request, including closed history. Preserve original evidence when the base or
upstream changes; do not treat a different request as reconciliation.

The whole helper test module covers the data-to-proposal safety boundary. The
required `formula` CI job runs it plus all existing Homebrew gates on PRs and train
candidates. For local helper/workflow changes with the formula unchanged, use
`qualityGate.test.local` and `qualityGate.syntax` in
[`.github/github.json`](.github/github.json). Formula edits also require its
audit, source-install, command and linkage commands.
