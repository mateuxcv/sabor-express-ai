@echo off
setlocal

rem Garante acesso ao Node.js quando ele nao estiver no PATH do Windows.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"

rem Inicia cada servico em uma janela, usando a pasta deste arquivo.
start "Sabor Express - CrewAI" /D "%~dp0" "%ComSpec%" /k "call npm.cmd run dev:crew"
start "Sabor Express - Next.js" /D "%~dp0" "%ComSpec%" /k "call npm.cmd run dev"

endlocal
