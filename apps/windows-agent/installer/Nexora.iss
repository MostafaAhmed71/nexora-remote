[Setup]
AppId={{7D311E70-72E1-4C69-BD13-EE690C930E98}
AppName=NEXORA Remote Agent
AppVersion=0.1.0
AppPublisher=NEXORA
DefaultDirName={localappdata}\Programs\NexoraRemote
DefaultGroupName=NEXORA Remote
OutputDir=..\..\..\artifacts
OutputBaseFilename=NexoraRemote-0.1.0-win-x64-unsigned
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Nexora.Remote.Agent.exe
[Files]
Source: "..\..\..\artifacts\agent\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{group}\NEXORA Remote Agent"; Filename: "{app}\Nexora.Remote.Agent.exe"
[Run]
Filename: "{app}\Nexora.Remote.Agent.exe"; Description: "Open NEXORA Remote Agent"; Flags: postinstall nowait skipifsilent
