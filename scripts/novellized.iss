; Inno Setup Script for Novellized Studio (Novelist & Literature IDE)
; Documentation: https://jrsoftware.org/ishelp/

#define MyAppName "Novellized Studio"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Novellized"
#define MyAppURL "https://github.com/justlimorina/novellized-editor"
#define MyAppExeName "Novellized.exe"

[Setup]
; Unique application GUID
AppId={{8B2F36A1-94E5-47B2-A8E9-4E65939F80C1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Novellized Studio
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Allow installing either for Current User (no UAC prompt) or All Users (elevated)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputBaseFilename=Novellized-Studio-Setup-{#MyAppVersion}-x64
OutputDir=..\dist-ide
SetupIconFile=..\resources\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "addcontextmenu"; Description: "Add ""Open Novel Project with Novellized Studio"" to Windows Explorer folder context menu"; GroupDescription: "Windows Explorer Integration:"

[Files]
Source: "..\dist-ide\Novellized-Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "data\*,data"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Right-click folder context menu (Both directory click and background click)
Root: HKA; Subkey: "Software\Classes\Directory\shell\NovellizedStudio"; ValueType: string; ValueData: "Open Novel Project with Novellized Studio"; Flags: uninsdeletekey; Tasks: addcontextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\NovellizedStudio"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: addcontextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\NovellizedStudio\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: addcontextmenu

Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\NovellizedStudio"; ValueType: string; ValueData: "Open Novel Project with Novellized Studio"; Flags: uninsdeletekey; Tasks: addcontextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\NovellizedStudio"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: addcontextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\NovellizedStudio\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: addcontextmenu

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
