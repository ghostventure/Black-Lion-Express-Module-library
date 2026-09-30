!include "x64.nsh"
!include "WinVer.nsh"
!macro customInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "LionMax requires 64-bit Windows 10 or Windows 11."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "LionMax requires Windows 10 build 19041 or later."
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $0 < 19041
    MessageBox MB_OK|MB_ICONSTOP "LionMax requires Windows 10 build 19041 or later. Update Windows before installing."
    Abort
  ${EndIf}
!macroend
