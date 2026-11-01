-- Short labels on a prediction (T20, Semi-final). Kept as typed; one tag per
-- prediction whatever the case.
create table if not exists public.prediction_tags (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  constraint prediction_tags_tag_trimmed check (
    tag = btrim(tag)
    and length(tag) between 1 and 24
  )
);

create index if not exists idx_prediction_tags_prediction_id on public.prediction_tags(prediction_id, created_at asc);
create unique index if not exists uq_prediction_tags_prediction_tag
  on public.prediction_tags (prediction_id, lower(tag));
