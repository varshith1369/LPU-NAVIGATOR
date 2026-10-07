$ErrorActionPreference = 'Stop'
$releaseRoot = Split-Path -Parent $PSScriptRoot
$releaseFiles = @('frontend','backend','ai-service','ml-service','database','data','docs','scripts','.github','package.json','package-lock.json','vite.config.ts','tsconfig.json','README.md','.env.example','.gitignore','.dockerignore','Dockerfile','compose.yaml','render.yaml')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$releasePath = Join-Path $releaseRoot 'lpu-campus-navigator-source.zip'
if (Test-Path -LiteralPath $releasePath) { throw 'Release ZIP already exists. Rename it before creating another release.' }
$archive = [System.IO.Compression.ZipFile]::Open($releasePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in $releaseFiles) {
        $itemPath = Join-Path $releaseRoot $relative
        $items = if (Test-Path -LiteralPath $itemPath -PathType Container) { Get-ChildItem -LiteralPath $itemPath -Recurse -File -Force } else { Get-Item -LiteralPath $itemPath -Force }
        foreach ($item in $items) {
            $entryPath = [System.IO.Path]::GetRelativePath($releaseRoot, $item.FullName).Replace('\','/')
            if ($entryPath -match '(^|/)(__pycache__|node_modules|\.venv)(/|$)' -or $entryPath.EndsWith('.pyc')) { continue }
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, $entryPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
} finally { $archive.Dispose() }
Write-Output $releasePath
