# GMX Windows installer

Builds a per-user Windows installer with a private Node runtime, a native .NET Framework account window and the host's supported local Codex registration flow. Codex must be installed and logged in separately. No npm install, PATH modification, background service or automatic email sending on the recipient's machine.

## Build

Acquire Inno Setup from https://jrsoftware.org/isdl.php and verify its Authenticode publisher (Pyrsys B.V.). The private Node ZIP, checksums, executable hash and complete license hash are pinned in runtime-lock.json. Verify the official archive and signature before extracting node.exe and LICENSE into a build-only runtime folder. No downloaded compiler/runtime is stored in this source tree.

Run from the repository:

```powershell
npm run lint
npm run build
npm test
node scripts/build-installer.mjs --compiler "PATH/ISCC.exe" --runtime "PATH/node-runtime" --output "PATH/output"
```

The GUI uses Windows' built-in .NET Framework compiler. The builder creates a new staging folder, checks an exact list of 26 payload files and refuses to overwrite an existing installer. Output is Setup.exe plus SHA-256. A detailed build record is kept in the project work folder. No credentials, developer profiles, tests or installer tools enter the package.

## Verification

- Tests/gmx-connection-check.test.ts covers fixed login endpoints and safe results without network or sending.
- installer/tests/Test-Integration.ps1 uses separate real Codex CLI profiles for registration, repeat, update, conflicts, active-process refusal, interrupted registration and removal. Pass -Payload and -WorkRoot; never point these at a live installation.
- installer/tests/check-setup-worker.mjs PAYLOAD WORK_ROOT creates its own positively marked synthetic account store, verifies UTF-8 secrets through Windows PowerShell 5.1 and private Node without global Node, update, corruption rejection and no plaintext outputs. Its Run-SetupWorker.ps1 driver forces the .NET Framework UTF-8 stdin preamble found on fresh Windows; only the JSON transport prefix is ignored, including a test that preserves a leading U+FEFF inside the password itself.
- installer/tests/check-mcp-offline.mjs PLUGIN_ROOT performs protocol initialization, tool/account listing and a send dry-run with the explicitly selected synthetic environment. No mailbox connection.
- installer/tests/Test-WindowsSandbox.ps1 is only for a disposable offline Windows Sandbox with the documented Input/Results mappings. It installs/reinstalls/removes the real EXE, checks hashes, account preservation and the installed MCP process. It must not be run on the normal user's Windows.

Test fixtures and result folders are local project work/evidence, not deliverables. The GUI must also be visually inspected at the actual Windows scaling.

## Lifecycle and boundaries

The user profile's account directory is separate from program files and is never included in uninstall operations. Codex itself performs registration/cache removal; unrelated marketplace roots and preferences are protected. A differing pre-existing gmx-projekt marketplace is refused. A registration receipt allows interrupted setup cleanup. Running plugin processes or the account window block removal, rather than being forcibly closed.

Remove this plugin before removing Codex itself; otherwise the supported deregistration command is unavailable and the uninstaller intentionally stops. Repair Codex or its registration first in that case. This is a documented dependency, not a successful removal claim.

Passwords necessarily exist briefly as managed strings during entry and process stdin transfer. No same-user process isolation is promised. Credentials are not placed on command lines, in temporary JSON files, logs or distribution artifacts. PowerShell Bypass applies only to each own child process and does not change Windows policy. Group-policy restrictions are not bypassed.

The installer is unsigned. Do not suppress Windows protection or claim a trusted publisher signature. A commercial signing certificate and public publication are outside this private build.
