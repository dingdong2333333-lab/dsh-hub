# Installer build

This folder turns a prepared portable release into a single Windows installer EXE.

## Requirements

- Inno Setup 6 (`winget install --id JRSoftware.InnoSetup -e`)
- A portable release from `npm run package:zip`, containing
  `data/self-test.json` with `ok:true`
- Node.js 22.15+

## Build

From the repository root:

```powershell
$env:DSH_HUB_APP_DIR = "<delivery>\release\DSH-Hub-0.2.2-win-x64"
$env:DSH_HUB_INSTALLER_OUT = "<delivery>"
$env:DSH_HUB_INSTALLER_STAGE = "<delivery>\installer\payload"
npm run installer:win
```

Defaults:

- Source: `release/DSH-Hub-<version>-win-x64`, then
  `<delivery>\release\DSH-Hub-<version>-win-x64`
- Output: `<delivery>` when it exists, otherwise `release/`
- Staging: `installer/payload`
- Compiler: `ISCC` env, or the standard Inno Setup 6 install locations

Outputs:

- `DSH-Hub-<version>-Setup.exe`
- `DSH-Hub-<version>-Setup.json` (size, SHA-256, source, embedded self-test)

## What the script does

1. Copies the portable release into the staging directory.
2. **Removes the live `data/` state** (settings, logs, Chromium cache,
   `.running.json`) and keeps only `self-test.json` + README + empty logs/crashes.
   This is important: never ship a running app's data directory.
3. Compiles `DSH-Hub.iss` with Inno Setup.
4. Writes a build metadata JSON with the installer SHA-256.

The `.iss` uses:

- `PrivilegesRequired=lowest` (per-user install, no UAC)
- Default directory `%LOCALAPPDATA%\Programs\DSH Hub`
- **Custom install location page enabled** (`DisableDirPage=no`)
- A writability check on the chosen directory (the app stores `data/` beside
  the EXE)
- A directory guard: an existing non-empty directory without the
  `.dsh-hub-install-root` marker is refused. Empty directories are allowed.
- Start Menu shortcut, optional desktop shortcut, standard uninstaller
- Chinese Simplified installer UI
- Embedded app icon and version metadata

The uninstaller only removes files installed by Inno Setup plus the install
marker. It deliberately **does not** delete `{app}\data` or any untracked file
the user created later. Plugin metadata and sets live in the DSH profile's
`.dsh-hub` directory, not in the install directory, so they are unaffected by
uninstalling DSH Hub.

## Silent test used during delivery

```powershell
$args = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS',
          '/MERGETASKS=!desktopicon',
          '/DIR=E:\temp\dsh-hub-install',
          '/LOG=E:\temp\dsh-hub-install.log')
Start-Process '<delivery>\DSH-Hub-0.2.2-Setup.exe' -ArgumentList $args -Wait
```

In a DSH-hosted terminal, the installed app self-test may need
`--no-sandbox` because of host sandbox restrictions; a normal Explorer launch
does not.

## Notes

- `installer/payload/` is generated and gitignored.
- Do not commit generated setup EXEs to the repo.
- After changing the payload version, keep `AppId` stable so upgrades replace
  the previous install instead of creating a second entry.
