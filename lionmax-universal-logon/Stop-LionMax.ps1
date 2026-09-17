$ErrorActionPreference='Stop'
$recordsFile=Join-Path $env:LOCALAPPDATA 'LionMax\launcher-processes.json'
if(Test-Path -LiteralPath $recordsFile){
 foreach($record in @(Get-Content -LiteralPath $recordsFile -Raw | ConvertFrom-Json)){
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.id)" -ErrorAction SilentlyContinue
  if($process -and $process.ExecutablePath -eq $record.runtime -and $process.CommandLine.Contains($record.entry)){Stop-Process -Id $record.id}
 }
 Remove-Item -LiteralPath $recordsFile
}
