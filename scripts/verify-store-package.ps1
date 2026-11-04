param(
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][string]$Identity,
    [Parameter(Mandatory)][string]$Publisher
)
$ErrorActionPreference = 'Stop'
$files = @(Get-ChildItem -LiteralPath $Directory -Filter '*.appx' -File)
if ($files.Count -ne 1) { throw "Un seul paquet APPX attendu" }
$zip = [IO.Compression.ZipFile]::OpenRead($files[0].FullName)
try {
    $reader = [IO.StreamReader]::new($zip.GetEntry('AppxManifest.xml').Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $id = $manifest.Package.Identity
    $version = [version]((Get-Content -Raw package.json | ConvertFrom-Json).version)
    $expected = "$($version.Major + 1).$($version.Minor).$($version.Build).0"
    if ($id.Name -cne $Identity -or $id.Publisher -cne $Publisher -or $id.Version -ne $expected -or $id.ProcessorArchitecture -ne 'x64') {
        throw 'Identité ou version APPX incorrecte'
    }
    $exe = $manifest.Package.Applications.Application.Executable.Replace('\','/')
    foreach ($name in $exe,'AppxBlockMap.xml','assets/StoreLogo.png','assets/Square44x44Logo.png','assets/Square150x150Logo.png','assets/Wide310x150Logo.png') {
        if (!$zip.GetEntry($name)) { throw "Ressource APPX absente : $name" }
    }
    $stream = $zip.GetEntry('app/resources/app.asar').Open()
    try { $embedded = (Get-FileHash -InputStream $stream).Hash } finally { $stream.Dispose() }
    if ($embedded -ne (Get-FileHash -LiteralPath (Join-Path $Directory 'win-unpacked/resources/app.asar')).Hash) {
        throw "Le paquet contient un launcher différent de celui vérifié"
    }
    Write-Host "Paquet APPX x64 vérifié : $Identity, version $expected"
} finally { $zip.Dispose() }
