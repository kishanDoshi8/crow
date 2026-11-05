-- Function access is an explicit allowlist.
-- Supabase grants EXECUTE on new public functions to anon and authenticated by default,
-- and Postgres grants it to PUBLIC, so every function starts locked down here and only the
-- RPCs the app calls are granted back. Internal helpers (stats, ratings, duel settlement)
-- run inside these RPCs as the owner and need no grant.
-- When you add an RPC the app calls, add it below and to the allowlist in
-- supabase/tests/security_hardening.sql.

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- Called from RLS policies, so they run as the querying user.
grant execute on function private.get_player_id_from_auth() to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.shares_room_with(uuid) to authenticated;
grant execute on function private.can_view_prediction(uuid) to authenticated;
grant execute on function private.can_view_duel(uuid) to authenticated;
grant execute on function private.can_view_series(uuid) to authenticated;

-- RPCs the web app calls.
-- Paused while duels are hidden: create_duel_view, join_duel_queue_view.
-- Retired with series wallets: claim_weekly_points, get_room_leaderboard.
grant execute on function public.activate_series(uuid) to authenticated;
grant execute on function public.archive_series(uuid) to authenticated;
grant execute on function public.cancel_bet(uuid) to authenticated;
grant execute on function public.cancel_duel_queue_view(uuid, uuid) to authenticated;
grant execute on function public.cancel_duel_view(uuid, uuid) to authenticated;
grant execute on function public.collect_series_rewards(uuid) to authenticated;
grant execute on function public.complete_series(uuid) to authenticated;
grant execute on function public.create_prediction(uuid, text, text[], timestamp with time zone, uuid) to authenticated;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.create_series(uuid, text, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_my_series_wallets(uuid) to authenticated;
grant execute on function public.get_player() to authenticated;
grant execute on function public.get_prediction_duel_summary(uuid) to authenticated;
grant execute on function public.get_prediction_duels_view(uuid) to authenticated;
grant execute on function public.get_preferences(uuid) to authenticated;
grant execute on function public.get_room_activities(uuid, integer, timestamp with time zone, uuid, text, uuid) to authenticated;
grant execute on function public.get_room_by_code(text) to authenticated;
grant execute on function public.get_room_has_unseen_activities(uuid) to authenticated;
grant execute on function public.get_room_manage_queue(uuid) to authenticated;
grant execute on function public.get_room_member_recent_predictions(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.get_room_member_stats(uuid, uuid) to authenticated;
grant execute on function public.get_room_overall_standings(uuid) to authenticated;
grant execute on function public.get_room_member_style(uuid, uuid) to authenticated;
grant execute on function public.get_room_prediction_history(uuid, integer, timestamp with time zone, uuid, text, text, uuid) to authenticated;
grant execute on function public.get_room_series(uuid) to authenticated;
grant execute on function public.get_room_series_selector(uuid, uuid, text) to authenticated;
grant execute on function public.get_room_stat_cards(uuid, integer) to authenticated;
grant execute on function public.get_series_awards(uuid, uuid) to authenticated;
grant execute on function public.get_series_leaderboard(uuid, uuid, text) to authenticated;
grant execute on function public.get_series_placements(uuid, uuid) to authenticated;
grant execute on function public.get_series_weekly_recap(uuid, uuid) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.record_share(uuid, text) to authenticated;

-- Server-only: the invite-preview edge function, using the service key.
grant execute on function public.get_room_invite_preview(text) to service_role;
grant execute on function public.mark_how_to_play_seen() to authenticated;
grant execute on function public.mark_ratings_tip_seen() to authenticated;
grant execute on function public.mark_room_activities_seen(uuid) to authenticated;
grant execute on function public.place_bet(uuid, uuid, integer) to authenticated;
grant execute on function public.register_player(text) to authenticated;
grant execute on function public.reset_room_preferences(uuid) to authenticated;
grant execute on function public.resolve_prediction_v2(uuid, uuid, text, uuid, character varying) to authenticated;
grant execute on function public.correct_prediction_result(uuid, uuid, text, uuid, character varying) to authenticated;
grant execute on function public.set_last_visited_room(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.update_global_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_prediction(uuid, text, timestamp with time zone, text[]) to authenticated;
grant execute on function public.update_room(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.update_room_preferences(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_series(uuid, text, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.upsert_user_push_subscription(jsonb) to authenticated;
grant execute on function public.delete_my_push_subscription(text) to authenticated;
grant execute on function public.get_series_suggestions(uuid) to authenticated;
grant execute on function public.suggest_series(uuid, text) to authenticated;
grant execute on function public.toggle_series_suggestion_vote(uuid) to authenticated;
grant execute on function public.remove_series_suggestion(uuid) to authenticated;
grant execute on function public.mark_series_suggestion_played(uuid, uuid) to authenticated;
grant execute on function public.get_my_unseen_results(uuid, uuid) to authenticated;
grant execute on function public.mark_results_seen(uuid[]) to authenticated;
grant execute on function public.get_my_weekly_recap(uuid, uuid) to authenticated;
grant execute on function public.dismiss_weekly_recap(uuid, text) to authenticated;
grant execute on function public.set_prediction_details(uuid, text, text[]) to authenticated;
grant execute on function public.get_room_tags(uuid) to authenticated;
