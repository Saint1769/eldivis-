
# CoolChat Full Messenger Demo

Features:
- Registration and login (username + password) with JWT
- Private real-time chats via Socket.IO
- Delete messages and delete account
- Simulated coin purchases and gifting coins to users
- NFT-like gifts (mocked items) that can be gifted
- SQLite persistence (data.sqlite)

Deploy on Render:
1. Create GitHub repo, push project files.
2. Create Render Web Service, connect repo.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Set JWT_SECRET environment variable on Render for production.

Notes:
- This demo simulates purchases; no real payment integration is included.
- SQLite persists on instance but may be lost on redeploy; use external DB for production.
