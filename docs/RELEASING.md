# Releasing a version

**English** | [Español](RELEASING.es.md)

Each version is published on [GitHub Releases](https://github.com/Avelinares5803/KeepToMyShelf/releases) with two files for Windows and their checksums. The [`release.yml`](../.github/workflows/release.yml) workflow builds and tests them when a version tag is pushed, and leaves a **draft**. Nothing is published until you review it.

The technical details are in [ADR 0010](adr/0010-distribution.md) (in Spanish).

## Versions

Versions follow [SemVer](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **PATCH** (1.0.1): fixes.
- **MINOR** (1.1.0): new features that break nothing.
- **MAJOR** (2.0.0): changes that make users do something (for example, a backup that the previous version can no longer open).
- **Release candidate** (`1.1.0-rc.1`): to try the workflow or a version before publishing it. GitHub marks it as a _pre-release_.

## What the workflow makes

| File                             | For whom                                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| `KeepToMyShelf-Setup-<v>.exe`    | Per-user NSIS installer, no administrator rights needed                     |
| `KeepToMyShelf-Portable-<v>.zip` | Portable version: the data goes in `KeepToMyShelf Data`, next to the `.exe` |
| `SHA256SUMS.txt`                 | The SHA-256 of both, in `sha256sum -c` format                               |

Before creating the draft, the workflow:

1. Checks that the tag matches the version in `package.json` (`v1.0.0` ↔ `1.0.0`).
2. Runs the same checks as the CI, including the E2E tests.
3. Packages the app and runs the **smoke test** (`npm run test:smoke`): it installs the installer silently in a temporary folder, opens the installed app, creates a profile, checks where it keeps its data and that the `.exe` cannot be used as Node.js, and uninstalls it. Then it does the same with the portable zip.

If anything fails, no draft is created. The test traces are kept as the `test-traces` artifact of the workflow run (**Actions** tab).

## Step by step

### 1. Prepare the version (in a pull request)

On a `chore/release-<version>` branch:

1. Change the version without creating a tag:

   ```powershell
   npm version 1.1.0 --no-git-tag-version
   ```

   It updates `package.json` and `package-lock.json`.

2. In `CHANGELOG.md`, turn "Unreleased" into the version's section, with the date (`## [1.1.0] - 2027-01-15`), and add an empty "Unreleased" section above it. Each version has two blocks, "Español" and "English", in the same order as the release template.
3. Run the checks in [DEVELOPMENT.md](DEVELOPMENT.md#before-each-push) and, if you want to try the files on your computer:

   ```powershell
   npm run package; npm run test:smoke
   ```

   The smoke test refuses to start if KeepToMyShelf is already installed for your user, because the installer would replace that installation.

4. Open the pull request and, with the CI green, "Squash and merge" it as `chore(release): 1.1.0`.

### 2. Create the tag

On the updated `main`:

```powershell
git switch main
git pull --ff-only
git tag -a v1.1.0 -m "KeepToMyShelf 1.1.0"
git push origin v1.1.0
```

### 3. Review the draft

1. In the **Actions** tab, wait for the **Release** workflow to finish (about 15 minutes).
2. The draft "KeepToMyShelf 1.1.0" appears in **Releases** with the three files. For a release candidate, GitHub does not show the _Pre-release_ badge while it is a draft: it appears once published. To check it before, click **Edit** and look at the "Set as a pre-release" box.
3. Click **Edit** and replace the comment at the top with the version's changes, copied from `CHANGELOG.md`. The rest of the text comes from the [`.github/release-notes.md`](../.github/release-notes.md) template.
4. If you want, download the files and try them.
5. Click **Publish release**.

## If something goes wrong

- **The workflow fails:** fix the problem in a pull request and create a new tag (`v1.1.0-rc.2`, or `v1.1.1` if it had already been published). **Never move a tag that was already pushed**: someone may have downloaded what it pointed to.
- **The tag does not match the version:** delete it and create it again. It is safe because the workflow has created nothing:

  ```powershell
  git push origin :refs/tags/v1.1.0
  git tag -d v1.1.0
  ```

- **Discard a draft or a release candidate:** delete the release on GitHub (**Delete**) and then the tag, with the same two commands.

## Security

- The job that builds and tests can only read the repository. Only the job that creates the draft has write permission (`contents: write`).
- The draft is created by the `gh` CLI that comes with GitHub's runner, with the workflow's temporary token: no personal tokens and no third-party actions.
- Dependabot keeps the actions up to date (`actions/checkout`, `setup-node`, `upload-artifact` and `download-artifact`).
- The app is not signed: users see the SmartScreen warning, which the release template explains. The checksums let anyone check that a file has not been changed after it was published.
