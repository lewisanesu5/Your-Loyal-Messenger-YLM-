@echo off
git rm --cached ylm.db-shm 2>nul
git rm --cached ylm.db-wal 2>nul
git rm --cached ylm.db 2>nul
git add -A
git status
git commit -m "chore: remove SQLite artifacts, expand .gitignore, fix Neon pool crash handler"
git push origin main
echo Done!
