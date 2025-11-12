
# coolchat-eldivis

Simple real-time chat (Socket.IO) served from a single Node.js project.
Designed to be deployed to Render (or any Node host).

## How to deploy to Render
1. Create a new Web Service on Render and connect your GitHub repo.
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Root Directory: `/`

## Notes
- SQLite file `data.sqlite` is used for storage. It's listed in .gitignore to avoid committing it.
- For persistent production storage across redeploys, use an external database (Postgres, MongoDB).
