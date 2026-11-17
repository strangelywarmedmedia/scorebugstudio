; Inno Setup script - wraps dist\ScorebugStudio into ScorebugStudio-Setup-<version>.exe
; Build:  iscc /DAppVersion=2.1.0 packaging\windows-installer.iss   (from the repo root)
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{12DA3DF7-2FE0-4476-BAE2-EA126B948A6D}
AppName=Scorebug Studio
AppVersion={#AppVersion}
AppVerName=Scorebug Studio {#AppVersion}
DefaultDirName={autopf}\Scorebug Studio
DefaultGroupName=Scorebug Studio
UninstallDisplayIcon={app}\ScorebugStudio.exe
SetupIconFile=icon.ico
OutputDir=..\dist-installer
OutputBaseFilename=ScorebugStudio-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Start Scorebug Studio when I sign in to Windows"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\dist\ScorebugStudio\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Scorebug Studio"; Filename: "{app}\ScorebugStudio.exe"
Name: "{group}\Uninstall Scorebug Studio"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Scorebug Studio"; Filename: "{app}\ScorebugStudio.exe"; Tasks: desktopicon
Name: "{userstartup}\Scorebug Studio"; Filename: "{app}\ScorebugStudio.exe"; Tasks: startup

[Run]
Filename: "{app}\ScorebugStudio.exe"; Description: "Start Scorebug Studio now"; Flags: nowait postinstall skipifsilent
