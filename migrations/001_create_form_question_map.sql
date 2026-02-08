-- Creates mapping between Google Forms question IDs and human-readable labels.
create table if not exists public.form_question_map (
  question_id text primary key,
  label text not null,
  display_order int
);

create index if not exists form_question_map_display_order_idx
  on public.form_question_map (display_order);
