$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$installer = (Get-Item 'artifacts/NexoraRemote-0.3.0-win-x64-unsigned.exe').FullName
$baseline = (Get-Item 'upgrade-baseline/artifacts/NexoraRemote-0.2.0-win-x64-unsigned.exe').FullName
$installRoot = Join-Path $env:ProgramFiles 'NexoraRemoteSmoke'
$registryPath = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{7D311E70-72E1-4C69-BD13-EE690C930E98}_is1'
$dataRoot = Join-Path $env:ProgramData 'NexoraRemote'
if (Test-Path $installRoot) { throw 'Smoke destination must be empty' }
$installed = $false
$testFailure = $null
$logRoot = (Resolve-Path 'artifacts').Path
$installLog = Join-Path $logRoot 'installer-install.log'
$upgradeLog = Join-Path $logRoot 'installer-upgrade.log'
$uninstallLog = Join-Path $logRoot 'installer-uninstall.log'
function Wait-ServiceState([string]$state) { $controller = Get-Service NexoraRemote; try { $controller.WaitForStatus($state,[TimeSpan]::FromSeconds(30)) } finally { $controller.Dispose() } }
try {
    $process = Start-Process $baseline -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installRoot`"","/LOG=`"$installLog`"") -Wait -PassThru
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
    $service.Dispose()
    Stop-Service NexoraRemote
    Wait-ServiceState 'Stopped'
    Start-Service NexoraRemote
    Wait-ServiceState 'Running'
    $workers = Get-CimInstance Win32_Process -Filter "Name='Nexora.Remote.Agent.exe'" | Where-Object { $_.CommandLine -like '*--worker*' }
    if ($workers) { throw 'Unenrolled service must not start an interactive worker' }
    $shortcut = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'NEXORA Remote/NEXORA Remote Agent.lnk'
    if (-not (Test-Path $shortcut)) { throw 'Visible Start Menu shortcut missing' }
    if (-not (Test-Path "$installRoot/licenses/Microsoft-NETCore-LICENSE.txt")) { throw 'License missing' }
    New-Item -ItemType Directory -Force $dataRoot | Out-Null
    Set-Content "$dataRoot/upgrade-test-marker.txt" 'disposable test data, not an identity'
    $upgrade = Start-Process $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installRoot`"","/LOG=`"$upgradeLog`"") -Wait -PassThru
    if ($upgrade.ExitCode -ne 0) { throw "Upgrade exit $($upgrade.ExitCode)" }
    if (-not (Test-Path "$dataRoot/upgrade-test-marker.txt")) { throw 'Upgrade lost machine data' }
    Wait-ServiceState 'Running'
    if ((Get-ItemProperty $registryPath).DisplayVersion -ne '0.3.0') { throw 'Upgrade version mismatch' }
    if ((Get-Item "$installRoot/Nexora.Remote.Agent.exe").VersionInfo.ProductVersion -notlike '0.3.0*') { throw 'Executable not upgraded' }
} catch {
    $testFailure = $_
    Write-Host "Primary installer test failure: $($_.Exception.Message)"
} finally {
    if (Test-Path "$dataRoot/logs/agent.jsonl") { Copy-Item "$dataRoot/logs/agent.jsonl" "$logRoot/service-smoke.log" }
    if ($installed) {
        $remove = Start-Process "$installRoot/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/LOG=`"$uninstallLog`"") -Wait -PassThru
        if ($remove.ExitCode -ne 0) {
            Write-Host "Uninstall exit $($remove.ExitCode)"
            if ($null -eq $testFailure) { throw "Uninstall exit $($remove.ExitCode)" }
        }
    }
}
if ($null -ne $testFailure) { throw $testFailure }
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
if (Get-Service NexoraRemote -ErrorAction SilentlyContinue) { throw 'Service remained after uninstall' }
if (Test-Path "$installRoot/Nexora.Remote.Agent.exe") { throw 'Executable remained after uninstall' }
if (Test-Path $registryPath) { throw 'Installed Apps registration remained' }
if (Test-Path "$dataRoot/upgrade-test-marker.txt") { throw 'Machine data remained after clean uninstall' }
# Independently prove fresh 0.3 installation after the upgraded install was removed.
try {
    $freshLog = Join-Path $logRoot 'installer-fresh03.log'
    $fresh = Start-Process $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installRoot`"","/LOG=`"$freshLog`"") -Wait -PassThru
    if ($fresh.ExitCode -ne 0) { throw "Fresh 0.3 install exit $($fresh.ExitCode)" }
    Wait-ServiceState 'Running'
    if ((Get-ItemProperty $registryPath).DisplayVersion -ne '0.3.0') { throw 'Fresh version mismatch' }
} finally {
    if (Test-Path "$installRoot/unins000.exe") {
        $freshRemoveLog = Join-Path $logRoot 'installer-fresh03-uninstall.log'
        $freshRemove = Start-Process "$installRoot/unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/LOG=`"$freshRemoveLog`"") -Wait -PassThru
        if ($freshRemove.ExitCode -ne 0) { throw 'Fresh uninstall failed' }
    }
}
if (Get-Service NexoraRemote -ErrorAction SilentlyContinue) { throw 'Fresh install service not removed' }
if (Test-Path "$installRoot/Nexora.Remote.Agent.exe") { throw 'Fresh executable remained' }
@{ installed=$true; fresh03Validated=$true; automaticService=$true; serviceStartStop=$true; upgradePreservesMachineData=$true; upgradeFrom='0.2.0'; upgradeTo='0.3.0'; rollbackValidated=$false; uninstalled=$true; remoteDesktopTested=$false } | ConvertTo-Json | Set-Content 'artifacts/installer-smoke.json'
Write-Host 'Machine service install/start/stop/restart/upgrade/uninstall checks passed.'
