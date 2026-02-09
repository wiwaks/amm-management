# amm-management

POC front to import Google Forms responses into Supabase via an Edge Function.
UI built with shadcn/ui + Tailwind CSS.

## Setup

```bash
bun install
bun run dev
```

Create `.env.local` from `.env.example`:

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_FORM_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_IMPORT_ENDPOINT=
VITE_GENERATE_INVITATION_ENDPOINT=
VITE_SEARCH_SUBMISSIONS_ENDPOINT=
```

## Google OAuth (Web)

1) Create a Google OAuth Client ID (type "Web").
2) Authorized JavaScript origins: `http://localhost:5173`
3) Enable Google Forms API in your Google Cloud project.

## Usage

- Click "Se connecter a Google" to obtain an access token via Google Identity Services.
- "Previsualiser reponses" calls `forms.responses.readonly` and shows raw JSON.
- "Importer dans Supabase" calls your Edge Function with `{ formId, googleAccessToken }`.

No sensitive keys are embedded in the frontend; only `VITE_SUPABASE_ANON_KEY` is used.

## Les fonctionalités ajoutées et précision

- Système de session qui s'expire au bout de 1h avec bouton "se déconnecter"
- des logs pour savoir qui c'est connecté avec quel adresse

## Les fichiers modifié ou créé

- App.tsx (authentification Google uniquement)
- dashboard.tsx (création - import & prévisualisation + déconnection)
- sessionManager.ts
- types.ts

Les lignes modifié ou ajoutées sont commenté 
