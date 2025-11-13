
Eldivis - PostgreSQL-ready server and frontend.

IMPORTANT:
- Do NOT include your DATABASE_URL in code or commit it.
- In Render, set the environment variables:
    DATABASE_URL=postgresql://user:pass@host:port/dbname
    JWT_SECRET=your_jwt_secret_here

How to seed demo data:
1. npm install
2. export DATABASE_URL="postgresql://..."
3. node seed.js

Deploy on Render:
- Build Command: npm install
- Start Command: npm start
