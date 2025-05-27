# Plan Classifier – Quick Deploy

This repo contains:

* **frontend/PlanClassifierApp.jsx** – React component (drop into a Vite/CRA project)
* **backend/** – Node/Express API that keeps CMS Part D + State Medicaid tables up to date and exposes `/api/classify`
* **.github/workflows/update-data.yml** – GitHub Action that refreshes data quarterly

## First‑time setup

```bash
git clone <this‑repo>.git
cd <this‑repo>
npm init -y            # if no package.json
npm i express node-fetch papaparse
```

### Run backend locally

```bash
node backend/server.js
# → API at http://localhost:3000/api/classify
```

### Run frontend (example with Vite)

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm i tailwindcss framer-motion papaparse @shadcn/ui lucide-react
# copy PlanClassifierApp.jsx into src/
npm run dev
```

## Deploy

* **Backend** → Vercel / Netlify function (point frontend to the `/api/classify` URL)
* **Frontend** → Usual Vite build + deploy

The GitHub Action commits new CSVs every quarter so your host redeploys automatically.
