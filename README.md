# KeepToMyShelf

**English** | [Español](README.es.md)

A desktop app to organize your collection of **video games, movies and TV series**: covers, ratings, progress, filters, collections and separate profiles. It works offline: everything stays on your computer, with no account and no internet connection.

## Features

- **Profiles:** each person gets their own library, catalogs, collections and preferences.
- **Three libraries** (video games, movies and TV series) shown as a shelf of covers, at the size you choose.
- **Detailed records:** alternate titles, cover, image gallery, PDF documents (manuals, guides…), description, release dates by region, platforms, genres, series, companies, people and their roles (director, cast…), rating with half stars, status, start and end dates, hours played, seasons and episodes, format (physical or digital), favorite, tags and notes.
- **Editable catalogs** of platforms, genres, companies, people, tags… They start with lists in your language and never leave broken references. Duplicate values can be merged, and catalogs copied from another profile.
- **Search and filters:** search by title (ignoring case and accents), simple filters, advanced AND/OR filters, and sorting.
- **Collections** that mix games, movies and series.
- **Images handled for you:** optimized copies (WebP), optionally keeping the original, thumbnails and no duplicates.
- **Spanish and English**, light and dark theme, and backgrounds with adjustable blur and dimming.
- **Backups:** save a profile to a `.zip` and restore it as a new profile or over the open one. Scheduled backups are saved on their own.
- **Export:** take the data of the library out to JSON, or each kind to CSV for spreadsheets.
- **Trash:** deleted items can be restored.

## Download and install

KeepToMyShelf runs on **Windows 10 and 11** (64-bit). Download it from the [Releases](https://github.com/Avelinares5803/KeepToMyShelf/releases) page. There are two options:

| File                                   | When to choose it                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KeepToMyShelf-Setup-<version>.exe`    | **Recommended.** Installs the app for your user, with no administrator rights, and adds shortcuts.                                                                       |
| `KeepToMyShelf-Portable-<version>.zip` | No installation. Unzip it anywhere (a USB drive too) and open `KeepToMyShelf\KeepToMyShelf.exe`. Your data stays in the `KeepToMyShelf Data` folder, next to the `.exe`. |

**"Windows protected your PC":** the app is not digitally signed, so Windows SmartScreen may warn you. Click **More info → Run anyway**.

**Check the download (optional):** in PowerShell, `Get-FileHash .\<file>` must give the value listed in the release's `SHA256SUMS.txt`.

## Your data

| Version   | Where the data is                                     |
| --------- | ----------------------------------------------------- |
| Installed | `%APPDATA%\KeepToMyShelf` (paste it in File Explorer) |
| Portable  | `KeepToMyShelf Data`, next to `KeepToMyShelf.exe`     |

- **The files you add are copied** into that folder. Your originals are never modified, moved or deleted.
- **Backups:** in **Settings → Backups**, "Create backup…" saves the open profile to a `.zip`. Keep it somewhere else (another disk, the cloud…). To restore it, use "Restore backup…" on the profile screen (as a new profile) or "Restore backup over this profile…" in Settings.
- **Scheduled backups:** in **Settings → Backups**, each profile chooses never, every day, every week (by default) or every month. The app saves one in the background when you open the profile, if one is due and something has changed, and keeps the last 10 of each profile. They include the images and documents, so they can take up a lot of space, and they are deleted with the profile.
- **Export:** **Settings → Export** saves the data of the library to a JSON file (with the trash) or the items of one kind to a CSV file (without it). It does not include images, documents or settings, so it does not replace a backup.
- **Automatic backups:** the app saves one before deleting a profile and before restoring over one (it keeps the last 10). It also backs up each database before updating its format.
- **Uninstalling never deletes your data.** To remove it too, delete the folder above after uninstalling.

## Updating

- **Installed:** download and run the installer of the new version. Your data is kept.
- **Portable:** unzip the new version and move the `KeepToMyShelf Data` folder from the old one into it, next to the new `.exe`.

A new version may update the format of your data the first time it opens it, after saving a backup copy of each database. **An older version cannot open data that a newer one has updated**, so do not go back to an older version without a backup made with it.

## Problems

- **The portable version says it cannot write to its folder:** move it to a folder you can write to, such as Documents or a USB drive (not `Program Files`).
- **Something else:** open an [issue](https://github.com/Avelinares5803/KeepToMyShelf/issues) describing what you did and what happened.

## Development

KeepToMyShelf is built with Electron, TypeScript, React and SQLite. To work on it:

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): setup, scripts, conventions and how to build the installer.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app is organized.
- [docs/TESTING.md](docs/TESTING.md): testing strategy.
- [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md) and [docs/RELEASING.md](docs/RELEASING.md): branches, pull requests and releases.
- [CHANGELOG.md](CHANGELOG.md): changes in each version.

The project plan ([docs/ROADMAP.md](docs/ROADMAP.md)), the architecture decision records ([docs/adr/](docs/adr/)) and the original specification are written in Spanish.

## License

[MIT](LICENSE)
