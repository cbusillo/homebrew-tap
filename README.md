# Homebrew Tap

Homebrew formulae for Shiny Computers command-line tools.

## BD_to_AVP CLI

The `bd-to-avp` formula installs the Apple Silicon command-line version of
[BD_to_AVP](https://github.com/cbusillo/BD_to_AVP) on macOS 14 or later.

```bash
brew tap cbusillo/tap
brew trust cbusillo/tap
brew install bd-to-avp
bd-to-avp --help
```

The formula intentionally omits the PySide6 GUI. Install the signed DMG from
the BD_to_AVP releases page for the desktop app. MakeMKV remains a separate
optional requirement for reading Blu-ray discs; existing MKV, MTS, and M2TS
sources do not require it.
