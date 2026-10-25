$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$installer = (Get-Item 'artifacts/NexoraRemote-0.1.0-win-x64-unsigned.exe').FullName
$installRoot = Join-Path $env:RUNNER_TEMP 'NexoraRemoteInstallerSmoke'
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{7D311E70-72E1-4C69-BD13-EE690C930E98}_is1'
if (Test-Path $installRoot) { throw 'Smoke destination must be empty' }
if (Test-Path $registryPath) { throw 'Unexpected pre-existing installation' }
$installLog = Join-Path (Get-Location) 'artifacts/installer-install.log'
$removeLog = Join-Path (Get-Location) 'artifacts/installer-uninstall.log'
$installed = $false
try {
    $process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$installRoot`"", "/LOG=`"$installLog`"") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer returned $($process.ExitCode)" }
    $installed = $true
    if (-not (Test-Path (Join-Path $installRoot 'Nexora.Remote.Agent.exe'))) { throw 'Agent executable missing after install' }
    $registration = Get-ItemProperty $registryPath
    if ($registration.DisplayName -ne 'NEXORA Remote Agent version 0.1.0') {
        if ($registration.DisplayName -ne 'NEXORA Remote Agent') { throw "Unexpected installed-app entry: $($registration.DisplayName)" }
    }
    $shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'NEXORA Remote/NEXORA Remote Agent.lnk'
    if (-not (Test-Path $shortcut)) { throw 'Visible Start Menu shortcut missing' }
    if (Get-Process -Name 'Nexora.Remote.Agent' -ErrorAction SilentlyContinue) { throw 'Silent installer must not start remote access' }
    if (-not (Test-Path (Join-Path $installRoot 'licenses/Microsoft-NETCore-LICENSE.txt'))) { throw 'Redistributable license missing' }
} finally {
    if ($installed) {
        $uninstaller = Join-Path $installRoot 'unins000.exe'
        $process = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$removeLog`"") -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Uninstaller returned $($process.ExitCode)" }
    }
}
if (Test-Path (Join-Path $installRoot 'Nexora.Remote.Agent.exe')) { throw 'Agent executable remained after uninstall' }
if (Test-Path $registryPath) { throw 'Installed-app registration remained after uninstall' }
if (Test-Path $shortcut) { throw 'Start Menu shortcut remained after uninstall' }
@{ installed = $true; visibleInstalledApp = $true; startMenuShortcut = $true; silentInstallStartedAgent = $false; runtimeLicenseIncluded = $true; uninstalled = $true; remoteDesktopTested = $false } | ConvertTo-Json | Set-Content 'artifacts/installer-smoke.json'
Write-Host 'Installer install/registration/shortcut/license/uninstall smoke checks passed; no desktop control tested.'
