# Builds the two Windows executables into ..\dist\ (run from anywhere).
#   Krillion.exe        standard edition
#   Krillion-Qwen.exe   Qwen edition (local Ollama AI judge)
# Needs Python 3.12 and internet for the first run. The virtual environment lives OUTSIDE OneDrive.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:USERPROFILE "krillion-build"
New-Item -ItemType Directory -Force $work | Out-Null
if (-not (Test-Path "$work\venv")) { python -m venv "$work\venv" }
& "$work\venv\Scripts\python.exe" -m pip install -q pywebview pyinstaller
Copy-Item "$repo\index.html" "$work\index.html" -Force
Copy-Item "$PSScriptRoot\main.py" "$work\main.py" -Force
Copy-Item "$PSScriptRoot\main_ai.py" "$work\main_ai.py" -Force
Push-Location $work
& "$work\venv\Scripts\pyinstaller.exe" --noconfirm --onefile --windowed --name Krillion --add-data "index.html;." main.py
& "$work\venv\Scripts\pyinstaller.exe" --noconfirm --onefile --windowed --name Krillion-Qwen --add-data "index.html;." main_ai.py
Pop-Location
New-Item -ItemType Directory -Force "$repo\dist" | Out-Null
Copy-Item "$work\dist\Krillion.exe" "$repo\dist\Krillion.exe" -Force
Copy-Item "$work\dist\Krillion-Qwen.exe" "$repo\dist\Krillion-Qwen.exe" -Force
Get-ChildItem "$repo\dist" | Select-Object Name, Length
