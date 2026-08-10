@echo off
setlocal

rem LMU Steward - live capture sidecar build.
rem
rem Produces build\lmu-spike.exe, which electron-builder copies into the packaged
rem app as resources\lmu-spike.exe. See package.json "build:sidecar".
rem
rem A Le Mans Ultimate install is NOT required. The shared memory layout is
rem declared in lmu-shared-memory-layout.hpp so a CI runner can build this.
rem
rem   build.bat            build the sidecar
rem   build.bat --verify   additionally cross-check the vendored layout against
rem                        the SDK header in your game install. Local only -
rem                        needs LMU installed. Run after every LMU update.

set "VERIFY="
if /i "%~1"=="--verify" set "VERIFY=1"

where cl >nul 2>nul
if %errorlevel%==0 goto :toolset_ready

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :novs

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"

if not defined VSPATH goto :novs
if not exist "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" goto :novs

call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul
where cl >nul 2>nul
if errorlevel 1 goto :novs

:toolset_ready
if not exist "%~dp0build" mkdir "%~dp0build"

rem x64 deliberately: the layout assertions assume 8-byte pointers, and LMU is
rem a 64-bit process.
cl /nologo /EHsc /std:c++17 /W3 /O2 /Fe:"%~dp0build\lmu-spike.exe" /Fo:"%~dp0build\\" "%~dp0main.cpp" /link User32.lib
if errorlevel 1 goto :failed

echo.
echo Built: %~dp0build\lmu-spike.exe

if not defined VERIFY goto :done

echo.
echo Cross-checking the vendored layout against the installed SDK header...

if "%LMU_SDK_DIR%"=="" set "LMU_SDK_DIR=C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Support\SharedMemoryInterface"
if not exist "%LMU_SDK_DIR%\SharedMemoryInterface.hpp" goto :nosdk

cl /nologo /EHsc /std:c++17 /W3 /I "%LMU_SDK_DIR%" /Fe:"%~dp0build\layout-check.exe" /Fo:"%~dp0build\\" "%~dp0layout-check.cpp"
if errorlevel 1 goto :layout_mismatch

"%~dp0build\layout-check.exe"
if errorlevel 1 goto :layout_mismatch

:done
exit /b 0

:novs
echo.
echo ERROR: MSVC toolset not found.
echo Open the Visual Studio Installer and add "Desktop development with C++",
echo or install the standalone Build Tools for Visual Studio.
exit /b 1

:nosdk
echo.
echo ERROR: --verify needs the SDK header, not found under:
echo   %LMU_SDK_DIR%
echo.
echo Set LMU_SDK_DIR to your Le Mans Ultimate Support\SharedMemoryInterface
echo folder. The plain build does not need this; only --verify does.
exit /b 1

:layout_mismatch
echo.
echo LAYOUT CHECK FAILED.
echo.
echo lmu-shared-memory-layout.hpp no longer matches the SDK header in your game
echo install. The failing static_assert names the field that moved. Fix the
echo vendored header, then update the measured baseline in
echo docs\live-capture-investigation.md.
exit /b 1

:failed
echo.
echo Build FAILED.
exit /b 1
