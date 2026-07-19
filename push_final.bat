@echo off
git rm --cached push2.bat 2>nul
del push2.bat 2>nul
git add -A
git commit -m "chore: clean up helper scripts, final clean push"
git push origin main
echo.
echo All done! Repository is clean and up to date.
