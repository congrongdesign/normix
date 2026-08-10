# Release

## Version

Use semantic versioning:

```text
1.0.0
1.1.0
1.1.0-beta.1
```

Git tags:

```text
v1.0.0
```

## Local packaging

macOS:

```bash
npm run package:mac
npm run package:mac:arm64
npm run package:mac:x64
```

Windows:

```bash
npm run package:win
```

If Electron downloads time out:

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## GitHub Release

Pushing a `v*` tag triggers `.github/workflows/release.yml`.

The workflow builds:

- macOS arm64 DMG and ZIP
- macOS x64 DMG and ZIP
- Windows x64 NSIS installer
- Windows x64 portable executable
- Source archive and checksums

## Local GitHub publish

Install and authenticate GitHub CLI first:

```bash
brew install gh
gh auth login
```

Then run:

```bash
npm run publish:github
```

This creates the public repository, pushes `main` and the `v1.0.0` tag, and uploads the existing `release/` artifacts to a GitHub Release.
