$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$installer = (Get-Item 'artifacts/NexoraRemote-0.2.0-win-x64-unsigned.exe').FullName
$installRoot = Join-Path $env:ProgramFiles 'NexoraRemoteSmoke'
$registryPath = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{7D311E70-72E1-4C69-BD13-EE690C930E98}_is1'
$dataRoot = Join-Path $env:ProgramData 'NexoraRemote'
if (Test-Path $installRoot) { throw 'Smoke destination must be empty' }
$installed = $false
try {
    $process = Start-Process $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installRoot`"",'/LOG=artifacts/installer-install.log') -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Install exit $($process.ExitCode)" }
    $installed = $true
    if (-not (Test-Path "$installRoot/Nexora.Remote.Agent.exe")) { throw 'Missing executable' }
    $registration = Get-ItemProperty $registryPath
    if ($registration.DisplayVersion -ne '0.2.0') { throw 'Incorrect installed version' }
    $service = Get-Service NexoraRemote
    if ($service.Status -ne 'Running') { throw 'Service did not start' }
    $config = Get-CimInstance Win32_Service -Filter "Name='NexoraRemote'"
    if ($config.StartMode -ne 'Auto' -or $config.StartName -ne 'LocalSystem') { throw 'Service startup/account incorrect' }
    if ($config.PathName -notlike '*--service*') { throw 'Missing service role' }
    $recovery = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\NexoraRemote'
    if (-not $recovery.FailureActions) { throw 'Missing service crash recovery policy' }
    $service | Stop-Service
    (Get-Service NexoraRemote).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
    Start-Service NexoraRemote
    (Get-Service NexoraRemote).WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
    $workers = Get-CimInstance Win32_Process -Filter "Name='Nexora.Remote.Agent.exe'" | Where-Object { $_.CommandLine -like '*--worker*' }
    if ($workers) { throw 'Unenrolled service must not start an interactive worker' }
    $shortcut = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'NEXORA Remote/NEXORA Remote Agent.lnk'
    if (-not (Test-Path $shortcut)) { throw 'Visible Start Menu shortcut missing' }
    if (-not (Test-Path "$installRoot/licenses/Microsoft-NETCore-LICENSE.txt")) { throw 'License missing' }
    New-Item -ItemType Directory -Force $dataRoot | Out-Null
    Set-Content "$dataRoot/upgrade-test-marker.txt" 'disposable test data, not an identity'
    $upgrade = Start-Process $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installRoot`"",'/LOG=artifacts/installer-upgrade.log') -Wait -PassThru
    if ($upgrade.ExitCode -ne 0) { throw "Upgrade exit $($upgrade.ExitCode)" }
    if (-not (Test-Path "$dataRoot/upgrade-test-marker.txt")) { throw 'Upgrade lost machine data' }
    if ((Get-Service NexoraRemote).Status -ne 'Running') { throw 'Upgrade failed to restart service' }
} finally {
    if ($installed) {
        $remove = Start-Process "$installRoot/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/LOG=artifacts/installer-uninstall.log') -Wait -PassThru
        if ($remove.ExitCode -ne 0) { throw "Uninstall exit $($remove.ExitCode)" }
    }
}
if (Get-Service NexoraRemote -ErrorAction SilentlyContinue) { throw 'Service remained after uninstall' }
if (Test-Path "$installRoot/Nexora.Remote.Agent.exe") { throw 'Executable remained after uninstall' }
if (Test-Path $registryPath) { throw 'Installed Apps registration remained' }
if (Test-Path "$dataRoot/upgrade-test-marker.txt") { throw 'Machine data remained after clean uninstall' }
@{ installed=$true; automaticService=$true; serviceStartStop=$true; upgradePreservesMachineData=$true; uninstalled=$true; remoteDesktopTested=$false } | ConvertTo-Json | Set-Content 'artifacts/installer-smoke.json'
Write-Host 'Machine service install/start/stop/restart/upgrade/uninstall checks passed.'
