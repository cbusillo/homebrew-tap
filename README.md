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
