$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WithRender = $args -contains "--with-render-deps"
$SkipCli = $args -contains "--skip-cli"
$SetupArgs = @($args | Where-Object { $_ -ne "--with-render-deps" })

function Has-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

if (-not (Has-Command "node") -or -not (Has-Command "npm")) {
  if (-not (Has-Command "winget")) { throw "Node.js 20+ is required. Install it from https://nodejs.org and rerun install.ps1." }
  winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
$NodeMajor = [int](& node -p "Number(process.versions.node.split('.')[0])")
if ($NodeMajor -lt 20) { throw "Node.js 20+ is required; found $NodeMajor." }

if ($WithRender) {
  if (-not (Has-Command "winget") -and ((-not (Has-Command "soffice")) -or (-not (Has-Command "pdftoppm")))) {
    throw "Optional preview tools are missing and WinGet is unavailable. Rerun without --with-render-deps, or install LibreOffice and Poppler manually."
  }
  if (-not (Has-Command "soffice")) {
    winget install --id TheDocumentFoundation.LibreOffice -e --source winget --silent --accept-source-agreements --accept-package-agreements
  }
  if (-not (Has-Command "pdftoppm")) {
    winget install --id oschwartz10612.Poppler -e --source winget --silent --accept-source-agreements --accept-package-agreements
  }
}

& node "$ProjectRoot\scripts\setup.mjs" @SetupArgs
$Bin = if ($env:SLIDE_AGENT_CLI_PREFIX) { Join-Path $env:SLIDE_AGENT_CLI_PREFIX "bin" } else { Join-Path $HOME ".local\bin" }
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($null -eq $UserPath) { $UserPath = "" }
if (($UserPath -split ";") -notcontains $Bin) {
  $NewUserPath = if ($UserPath) { ($UserPath.TrimEnd(";")) + ";" + $Bin } else { $Bin }
  [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
}
$env:Path = "$Bin;$env:Path"
if (-not $SkipCli) { & (Join-Path $Bin "slide-agent.cmd") doctor }
Write-Host "`nSlide Agent is ready. Install once; use it from Codex, Copilot, Claude, Gemini, or any tool-capable agent."
