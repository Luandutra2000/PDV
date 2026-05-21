@echo off
cd /d "%~dp0.."
"C:\Users\luand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 5500 --bind 127.0.0.1
