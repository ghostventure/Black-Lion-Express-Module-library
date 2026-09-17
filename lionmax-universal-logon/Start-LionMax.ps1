$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime=Join-Path $root 'runtime\node.exe'
if(!(Test-Path -LiteralPath $runtime)){$runtime=(Get-Command node -ErrorAction Stop).Source}
$storeRoot=Join-Path $env:LOCALAPPDATA 'LionMax'
New-Item -ItemType Directory -Force -Path $storeRoot | Out-Null
$processRecords=@()
function Ensure-LionMaxService($port,$entry,$expected,$logName){
 $url="http://127.0.0.1:$port/health"
 try{$health=Invoke-RestMethod -Uri $url -TimeoutSec 2;if($health.service -ne $expected){throw 'Port belongs to another service'};return}catch{
  if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw "Port $port is already in use. Close the conflicting application or contact support."}
 }
 $started=Start-Process -FilePath $runtime -ArgumentList ('"'+(Join-Path $root $entry)+'"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $storeRoot "$logName.out.log") -RedirectStandardError (Join-Path $storeRoot "$logName.err.log")
 $script:processRecords+=@{id=$started.Id;entry=(Join-Path $root $entry);runtime=$runtime}
 for($attempt=0;$attempt -lt 40;$attempt++){Start-Sleep -Milliseconds 250;try{$health=Invoke-RestMethod -Uri $url -TimeoutSec 1;if($health.service -eq $expected){return}}catch{};if($started.HasExited){break}}
 throw "LionMax could not start. See logs in $storeRoot."
}
Ensure-LionMaxService 4545 'src\server.js' 'LionMax Universal Logon' 'lionmax'
Ensure-LionMaxService 4546 'examples\demo-app.js' 'Northstar Demo' 'demo'
if($processRecords.Count){$recordsFile=Join-Path $storeRoot 'launcher-processes.json';$old=@();if(Test-Path -LiteralPath $recordsFile){$old=@(Get-Content -LiteralPath $recordsFile -Raw | ConvertFrom-Json)};@($old)+@($processRecords) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $recordsFile -Encoding UTF8}
Start-Process 'http://127.0.0.1:4545/login'
