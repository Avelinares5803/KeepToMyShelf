// Builds the portable .zip from the app electron-builder left in release/<version>/win-unpacked
// (run `npm run package`, which calls this script at the end).
//
// The zip holds a single "KeepToMyShelf" folder, so "Extract here" never scatters the app's
// files. Inside it, next to KeepToMyShelf.exe, the "KeepToMyShelf Data" folder makes the app
// portable: it keeps its data there instead of in %APPDATA% (src/main/infrastructure/
// user-data-location.ts). electron-builder's own zip target cannot add that folder to the zip
// alone, without adding it to the installer too.
import { Buffer } from 'node:buffer';
import { createWriteStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import yazl from 'yazl';

const ROOT_FOLDER = 'KeepToMyShelf';
const DATA_FOLDER = 'KeepToMyShelf Data';
const README = `KeepToMyShelf portable
======================

ESPAÑOL
Esta carpeta guarda tus datos de KeepToMyShelf: perfiles, bibliotecas, imágenes, documentos,
fondos y copias de seguridad automáticas.

- No la borres ni le cambies el nombre. Sin ella, KeepToMyShelf guardaría los datos en la
  carpeta de Windows (%APPDATA%\\KeepToMyShelf), como la versión instalada.
- Para llevarte la app a otro equipo o a una memoria USB, copia la carpeta KeepToMyShelf entera.
- Para actualizar, descomprime la versión nueva y sustituye su carpeta "KeepToMyShelf Data"
  por esta.

ENGLISH
This folder holds your KeepToMyShelf data: profiles, libraries, images, documents,
backgrounds and automatic backups.

- Do not delete or rename it. Without it, KeepToMyShelf would keep its data in the Windows
  folder (%APPDATA%\\KeepToMyShelf), like the installed version.
- To take the app to another computer or a USB drive, copy the whole KeepToMyShelf folder.
- To update, unzip the new version and replace its "KeepToMyShelf Data" folder with this one.
`.replace(/\n/g, '\r\n');

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
const releaseDir = join(projectDir, 'release', version);
const appDir = join(releaseDir, 'win-unpacked');
const zipPath = join(releaseDir, `KeepToMyShelf-Portable-${version}.zip`);

if (!existsSync(join(appDir, 'KeepToMyShelf.exe'))) {
  throw new Error(`No packaged app in ${appDir}: run electron-builder first.`);
}
if (existsSync(join(appDir, DATA_FOLDER))) {
  // The installer is built from this same folder: a data folder here would make it portable too.
  throw new Error(`${appDir} must not contain "${DATA_FOLDER}".`);
}

function* filesIn(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

const zip = new yazl.ZipFile();
let count = 0;
for (const file of filesIn(appDir)) {
  const inZip = `${ROOT_FOLDER}/${relative(appDir, file).split('\\').join('/')}`;
  zip.addFile(file, inZip, { mtime: statSync(file).mtime });
  count += 1;
}
zip.addBuffer(Buffer.from(README, 'utf8'), `${ROOT_FOLDER}/${DATA_FOLDER}/LEEME - README.txt`);
zip.end();

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  output.on('close', resolve);
  output.on('error', reject);
  zip.outputStream.on('error', reject);
  zip.outputStream.pipe(output);
});

const megabytes = (statSync(zipPath).size / 1024 / 1024).toFixed(1);
process.stdout.write(`Portable zip: ${zipPath} (${count + 1} files, ${megabytes} MB)\n`);
