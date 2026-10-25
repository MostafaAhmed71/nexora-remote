[Setup]
AppId={{7D311E70-72E1-4C69-BD13-EE690C930E98}
AppName=NEXORA Remote Agent
AppVersion=0.3.0
AppPublisher=NEXORA
DefaultDirName={autopf}\NexoraRemote
UsePreviousAppDir=no
DefaultGroupName=NEXORA Remote
OutputDir=..\..\..\artifacts
OutputBaseFilename=NexoraRemote-0.3.0-win-x64-unsigned
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Nexora.Remote.Agent.exe
[Files]
Source: "..\..\..\artifacts\agent\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{group}\NEXORA Remote Agent"; Filename: "{app}\Nexora.Remote.Agent.exe"; Parameters: "--configure-service"
[Run]
Filename: "{app}\Nexora.Remote.Agent.exe"; Parameters: "--configure-service"; Description: "Authorize machine enrollment and view service settings"; Flags: postinstall nowait skipifsilent runascurrentuser
[UninstallRun]
Filename: "{app}\Nexora.Remote.Agent.exe"; Parameters: "--uninstall-service"; Flags: runascurrentuser waituntilterminated; RunOnceId: "RemoveNexoraRemoteService"
[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\NexoraRemote"
[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var ExitCode: Integer;
begin
 Result := '';
 if FileExists(ExpandConstant('{app}\Nexora.Remote.Agent.exe')) then begin
  if (not Exec(ExpandConstant('{app}\Nexora.Remote.Agent.exe'), '--stop-service', '', SW_HIDE, ewWaitUntilTerminated, ExitCode)) or (ExitCode <> 0) then
   Result := 'Unable to stop NEXORA Remote service safely. Close active service operations and retry.';
 end;
end;
function InitializeSetup(): Boolean;
begin
 Result := not RegKeyExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{7D311E70-72E1-4C69-BD13-EE690C930E98}_is1');
 if not Result then MsgBox('A legacy per-user installation exists. Remove it using Windows Installed Apps before the machine-service installation. Existing machine enrollment is not imported automatically.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ExitCode: Integer;
begin
 if CurStep = ssPostInstall then begin
  if (not Exec(ExpandConstant('{app}\Nexora.Remote.Agent.exe'), '--install-service', '', SW_HIDE, ewWaitUntilTerminated, ExitCode)) or (ExitCode <> 0) then RaiseException('Service registration failed. Installation is not usable.');
  if (not Exec(ExpandConstant('{app}\Nexora.Remote.Agent.exe'), '--start-service', '', SW_HIDE, ewWaitUntilTerminated, ExitCode)) or (ExitCode <> 0) then RaiseException('Service start failed. Installation is not usable.');
 end;
end;
