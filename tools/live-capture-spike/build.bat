@echo off
setlocal

rem LMU Steward - Phase 0 live capture spike build script.
rem
rem Requires an MSVC toolset. SDK headers are read from the game install and are
rem never copied into this repository - Studio 397 forbids redistribution.

if "%LMU_SDK_DIR%"=="" set "LMU_SDK_DIR=C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Support\SharedMemoryInterface"

if not exist "%LMU_SDK_DIR%\SharedMemoryInterface.hpp" goto :nosdk

where cl >nul 2>nul
if %errorlevel%==0 goto :build

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :novs

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"

if not defined VSPATH goto :novs
if not exist "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" goto :novs

call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul
where cl >nul 2>nul
if errorlevel 1 goto :novs

:build
if not exist "%~dp0build" mkdir "%~dp0build"

cl /nologo /EHsc /std:c++17 /W3 /O2 /I "%LMU_SDK_DIR%" /Fe:"%~dp0build\lmu-spike.exe" /Fo:"%~dp0build\\" "%~dp0main.cpp" /link User32.lib
if errorlevel 1 goto :failed

echo.
echo Built: %~dp0build\lmu-spike.exe
exit /b 0

:nosdk
echo.
echo ERROR: SharedMemoryInterface.hpp not found under:
echo   %LMU_SDK_DIR%
echo.
echo Set LMU_SDK_DIR to your Le Mans Ultimate Support\SharedMemoryInterface folder.
exit /b 1

:novs
echo.
echo ERROR: MSVC toolset not found.
echo Open the Visual Studio Installer and add "Desktop development with C++",
echo or install the standalone Build Tools for Visual Studio.
exit /b 1

:failed
echo.
echo Build FAILED.
exit /b 1
