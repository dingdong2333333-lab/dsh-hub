; DSH Hub Windows installer (Inno Setup 6)
; Parameters are supplied by scripts/build-installer.mjs through environment variables:
;   DSH_HUB_APP_VERSION, DSH_HUB_VERSION_INFO, DSH_HUB_INSTALLER_OUT,
;   DSH_HUB_PAYLOAD_DIR, DSH_HUB_ICON, DSH_HUB_LANG_FILE
#define MyAppName "DSH Hub"
#define MyAppVersion GetEnv("DSH_HUB_APP_VERSION")
#define MyAppVersionInfo GetEnv("DSH_HUB_VERSION_INFO")
#define MyAppPublisher "DSH Hub contributors"
#define MyAppExeName "DSH-Hub.exe"
#define MyAppId "{{9E5B7B7C-3D6A-4A2B-9F5D-6C3B1E2A7C41}"
#define MyPayloadDir GetEnv("DSH_HUB_PAYLOAD_DIR")
#define MyOutputDir GetEnv("DSH_HUB_INSTALLER_OUT")
#define MyIconFile GetEnv("DSH_HUB_ICON")
#define MyLanguageFile GetEnv("DSH_HUB_LANG_FILE")

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=DeepSeek Harness 本地控制中枢
DefaultDirName={localappdata}\Programs\DSH Hub
DefaultGroupName=DSH Hub
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
UsePreviousAppDir=yes
AllowNoIcons=yes
OutputDir={#MyOutputDir}
OutputBaseFilename=DSH-Hub-{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#MyIconFile}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
VersionInfoVersion={#MyAppVersionInfo}
VersionInfoDescription={#MyAppName} {#MyAppVersion} Setup
VersionInfoProductName={#MyAppName}
VersionInfoCompany={#MyAppPublisher}
VersionInfoCopyright=Copyright (C) 2026 DSH Hub contributors
VersionInfoOriginalFileName=DSH-Hub-{#MyAppVersion}-Setup.exe
LicenseFile={#MyPayloadDir}\LICENSE
MinVersion=10.0.17763
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
ChangesAssociations=no
ChangesEnvironment=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "{#MyLanguageFile}"

[Messages]
SelectDirDesc=选择 DSH Hub 的安装位置。应用会在程序旁创建 data 文件夹保存设置和日志，请选择当前用户有写入权限的目录。
SelectDirLabel3=安装程序将把 DSH Hub 安装到以下文件夹。
SelectDirBrowseLabel=点击“下一步”继续；如果希望安装到其他文件夹，请点击“浏览”。

[CustomMessages]
CreateDesktopIcon=创建桌面快捷方式
AdditionalIcons=附加快捷方式：
LaunchProgram=启动 DSH Hub

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#MyPayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data\logs"
Name: "{app}\data\crashes"

[Icons]
Name: "{group}\DSH Hub"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 DSH Hub"; Filename: "{uninstallexe}"
Name: "{autodesktop}\DSH Hub"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Only remove the install-root marker. User data under {app}\data (settings,
; logs, crash reports) is deliberately left on disk. Do not add {app}\data
; here: uninstalling must never delete user data or an unrelated pre-existing
; data directory.
Type: files; Name: "{app}\.dsh-hub-install-root"

[Code]
const
  InstallMarker = '.dsh-hub-install-root';

function MarkerPath(const Dir: String): String;
begin
  Result := AddBackslash(Dir) + InstallMarker;
end;

function DirectoryHasEntries(const Dir: String): Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;
  if FindFirst(AddBackslash(Dir) + '*', FindRec) then
  try
    repeat
      if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
      begin
        Result := True;
        Exit;
      end;
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  TestFile: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    if DirExists(WizardDirValue) and not FileExists(MarkerPath(WizardDirValue)) and DirectoryHasEntries(WizardDirValue) then
    begin
      MsgBox('这个目录已经存在并且包含其他文件，不是 DSH Hub 的安装目录。为避免覆盖或误删已有文件，请选择一个新目录。', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if not ForceDirectories(WizardDirValue) then
    begin
      MsgBox('无法创建安装目录。请选择当前用户有写入权限的位置。', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    TestFile := AddBackslash(WizardDirValue) + '.dsh-hub-write-test.tmp';
    if not SaveStringToFile(TestFile, 'write-test', False) then
    begin
      MsgBox('当前用户无法写入这个目录。DSH Hub 需要把日志和设置保存在程序旁的 data 文件夹，请选择其他位置。', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    DeleteFile(TestFile);
    // Mark this directory as ours before PrepareToInstall runs. The marker is
    // also created after a silent install in CurStepChanged.
    SaveStringToFile(MarkerPath(WizardDirValue), 'DSH Hub installation root', False);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if DirExists(ExpandConstant('{app}')) and not FileExists(MarkerPath(ExpandConstant('{app}'))) and DirectoryHasEntries(ExpandConstant('{app}')) then
    Result := '安装目录已经存在并且包含其他文件，不是 DSH Hub 的安装目录。为避免覆盖或误删已有文件，请选择一个新目录。';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    SaveStringToFile(MarkerPath(ExpandConstant('{app}')), 'DSH Hub installation root', False);
end;
