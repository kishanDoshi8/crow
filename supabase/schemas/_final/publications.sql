-- Tables the app listens to for live updates. Only add a table here when a
-- client subscribes to it: every published change costs the database work.
do $$ begin alter publication supabase_realtime add table public.bets; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.predictions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.room_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.room_activities; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.prediction_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.prediction_posts; exception when duplicate_object then null; end $$;
