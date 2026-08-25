@echo off
set EXT=%~dp0..\chrome-extension
for %%C in (
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do if exist %%C (
  start "" %%C --load-extension="%EXT%" "chrome://extensions/"
  echo Chrome opened with TRH extension from %EXT%
  exit /b 0
)
echo Chrome not found. Manual: chrome://extensions - Load unpacked - %EXT%
