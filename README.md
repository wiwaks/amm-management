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
