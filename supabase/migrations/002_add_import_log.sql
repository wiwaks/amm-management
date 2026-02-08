-- Table pour tracker les imports et permettre le delta
create table if not exists public.form_import_log (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google_form',
  form_id text not null,
  last_import_at timestamptz not null default now(),
  total_responses int not null default 0,
  imported_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ix_form_import_log_source_form
  on public.form_import_log(source, form_id);
