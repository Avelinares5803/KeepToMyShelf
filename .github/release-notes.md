<!-- Plantilla del texto de cada release (ver docs/RELEASING.md). Antes de publicar el borrador,
     sustituye este comentario por los cambios de la versión, copiados de CHANGELOG.md. -->

## Español

Descarga **uno** de estos archivos:

- **`KeepToMyShelf-Setup-<versión>.exe`**: instalador para Windows 10 y 11. No necesita permisos de administrador.
- **`KeepToMyShelf-Portable-<versión>.zip`**: versión portable, sin instalar. Descomprímela donde quieras (también en una memoria USB) y abre `KeepToMyShelf\KeepToMyShelf.exe`. Guarda tus datos en la carpeta `KeepToMyShelf Data`, junto al `.exe`.

**Aviso de Windows:** la aplicación no está firmada digitalmente, así que Windows puede mostrar «Windows protegió su PC». Pulsa **«Más información» → «Ejecutar de todas formas»**.

**Comprobar la descarga:** en PowerShell, `Get-FileHash .\<archivo>` debe dar el mismo valor que aparece en `SHA256SUMS.txt`.

Todos los cambios están en el [registro de cambios](https://github.com/Avelinares5803/KeepToMyShelf/blob/main/CHANGELOG.md).

## English

Download **one** of these files:

- **`KeepToMyShelf-Setup-<version>.exe`**: installer for Windows 10 and 11. No administrator rights needed.
- **`KeepToMyShelf-Portable-<version>.zip`**: portable version, no installation. Unzip it anywhere (a USB drive too) and open `KeepToMyShelf\KeepToMyShelf.exe`. It keeps your data in the `KeepToMyShelf Data` folder, next to the `.exe`.

**Windows warning:** the app is not digitally signed, so Windows may show "Windows protected your PC". Click **"More info" → "Run anyway"**.

**Check the download:** in PowerShell, `Get-FileHash .\<file>` must give the value listed in `SHA256SUMS.txt`.

All the changes are in the [changelog](https://github.com/Avelinares5803/KeepToMyShelf/blob/main/CHANGELOG.md).
