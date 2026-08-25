# TimeFlow OS (V0.1)

Local-first personal time-management platform. Data persists in your
browser's localStorage — private to your device and browser, not synced
across devices yet (cloud sync is a later milestone).

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview   # serve the built dist/ folder locally to sanity-check
```

## Deploy

See the chat walkthrough for step-by-step Termux → GitHub → Vercel
instructions. Short version once it's on GitHub:

1. Go to vercel.com → New Project → Import this GitHub repo.
2. Framework preset: Vite. Build command: `npm run build`. Output dir: `dist`.
3. Deploy — Vercel gives you a free `*.vercel.app` URL and redeploys
   automatically on every push to `main`.
