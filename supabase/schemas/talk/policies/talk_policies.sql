-- Phrases are read through get_prediction_talk only.
alter table public.talk_phrases enable row level security;
revoke all on public.talk_phrases from anon, authenticated;

-- Members can read their room's reactions and posts (realtime needs this to
-- deliver changes); all writes go through the talk RPCs.
alter table public.prediction_reactions enable row level security;
revoke all on public.prediction_reactions from anon, authenticated;
drop policy if exists "prediction_reactions_select" on public.prediction_reactions;
create policy "prediction_reactions_select" on public.prediction_reactions
  for select to authenticated using (private.is_room_member(room_id));
grant select on public.prediction_reactions to authenticated;

alter table public.prediction_posts enable row level security;
revoke all on public.prediction_posts from anon, authenticated;
drop policy if exists "prediction_posts_select" on public.prediction_posts;
create policy "prediction_posts_select" on public.prediction_posts
  for select to authenticated using (private.is_room_member(room_id));
grant select on public.prediction_posts to authenticated;
