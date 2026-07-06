# EVG Reputation Report

This is a working MVP for the Executive Reputation Snapshot.

## What it includes
- Firebase Authentication for create account and login
- Firestore profile saving
- Railway/Node backend
- SerpAPI-powered Google search endpoint
- Dashboard with Google Results, AI Visibility, Achievement Vault, 10-Year Timeline, Bio Proof Points, Annual Report, Monitoring, Action Plan, and Upgrade tabs

## Railway setup
1. Upload these files to GitHub.
2. In Railway, connect the GitHub repo.
3. Add this variable in Railway Variables:
   - `SERPAPI_KEY` = your SerpAPI key
4. Optional variable:
   - `ALLOWED_ORIGINS` = `https://dancing-jalebi-a40209.netlify.app,http://localhost:3000`
5. Click Deploy.

## Netlify setup
If you want the frontend to stay on Netlify, update the API URL in `public/index.html`:

```js
const API_BASE = "https://YOUR-RAILWAY-DOMAIN.up.railway.app";
```

If you deploy the whole project on Railway, leave it as:

```js
const API_BASE = window.location.origin;
```

## Local test
```bash
npm install
cp .env.example .env
npm start
```
Then open http://localhost:3000
