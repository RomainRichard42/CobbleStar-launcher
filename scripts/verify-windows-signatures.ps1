[CmdletBinding(DefaultParameterSetName = 'File')]
param(
    [Parameter(Mandatory, ParameterSetName = 'File')][string]$File,
    [Parameter(Mandatory, ParameterSetName = 'Installation')][string]$Installation,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Publisher
)

$ErrorActionPreference = 'Stop'
function Confirm-Signature([string]$Path, [bool]$OwnBinary) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate) {
        throw "Signature Windows refusée ($($signature.Status)) : $Path"
    }
    if ($OwnBinary) {
        if ($signature.SignatureType -ne 'Authenticode' -or !$signature.TimeStamperCertificate) {
            throw "Signature Authenticode intégrée et horodatée requise : $Path"
        }
        if ($signature.SignerCertificate.Subject -cne $Publisher) {
            throw "Éditeur inattendu : $Path ($($signature.SignerCertificate.Subject))"
        }
    }
}

if ($PSCmdlet.ParameterSetName -eq 'File') {
    Confirm-Signature $File $true
} else {
    foreach ($name in 'CobbleStar Launcher.exe', 'Uninstall CobbleStar Launcher.exe') {
        Confirm-Signature (Join-Path $Installation $name) $true
    }
    $nativeFiles = Get-ChildItem -LiteralPath $Installation -Recurse -File |
        Where-Object { $_.Extension -in '.exe','.dll','.node' }
    foreach ($binary in $nativeFiles) {
        Confirm-Signature $binary.FullName $false
    }
    Write-Host "$($nativeFiles.Count) binaires Windows vérifiés dans l’installation."
}
