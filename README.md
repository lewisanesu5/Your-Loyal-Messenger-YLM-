Your Loyal Messenger (YLM) - MVP

Quick start (Windows / Node.js):

Requirements:
- Node.js 16+ and npm

Install and run:

```bash
cd "c:/Users/lewis/OneDrive/Desktop/Your Loyal Messenger (YLM)"
npm install
npm start
```

Then open http://localhost:3000 in your browser. The frontend is served from the `frontend/` folder and connects to the backend API at `/api/*`.

Next steps:
- Replace in-memory stores with a database (SQLite/Postgres).
- Add authentication for customers and providers.
- Integrate a payment gateway and SMS notifications.
- Add real-time GPS tracking (WebSockets or polling) and provider verification flows.
