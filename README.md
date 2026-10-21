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
to calculate and audit an update without Git or PR writes. A valid no-update
result submits nothing; missing or failed livecheck data fails closed.

A separate fresh hosted job validates the run's bounded data outside its exact
source-SHA checkout. Only the stable upstream archive URL and SHA-256 may change.
It verifies a newer published stable release without loading candidate Ruby or
downloading/executing the archive. Only this job has OIDC permission; the App
stays in Launchplane. `LAUNCHPLANE_PUBLIC_URL` is an Actions variable, and the
exact default-branch workflow selector must already be approved.
[Launchplane#3404](https://github.com/cbusillo/launchplane/issues/3404) owns live
readiness and real-run qualification. Ordinary formula CI, review and train gates
still apply; this source change grants no access or policy activation.

The [producer contract](https://github.com/cbusillo/launchplane/blob/main/docs/service-boundary.md#updater-source-proposals)
defines proposal dispositions, limits and reconciliation. For recovery, re-run
**all jobs** so calculation produces a fresh attempt-bound artifact; re-running
submit alone cannot reuse the earlier attempt's artifact. Request content stays
stable for the same base and update. Retain the exact request and available
response from the seven-day recovery artifact when investigating uncertainty.
If the base or upstream changes, preserve the original evidence and treat the
new request separately. There is no alternate PR publisher.

The required `formula` CI job runs the whole helper safety module and all existing
Homebrew gates on PRs and train candidates. Local commands are declared in
[`.github/github.json`](.github/github.json); formula edits also require its
audit, source-install, command and linkage checks.
