-- Table pour stocker les invitations client (inscription par lien)
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  form_submission_id uuid not null,
  email text,
  phone text,
  first_name text,
  last_name text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  invited_by text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_invitations_token on public.invitations(token);
create index if not exists ix_invitations_status on public.invitations(status);
create index if not exists ix_invitations_form_submission
  on public.invitations(form_submission_id);
