create or replace function public.get_room_prediction_history(
  p_room_id uuid,
  p_limit   int default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_search text default null,
  p_filter text default 'all',
  p_series_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_is_member boolean;
  v_result    json;
  v_filter text;
  v_search text;
begin
  v_caller_id := private.get_player_id_from_auth();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  select exists(
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  p_limit  := greatest(1, least(p_limit, 100));
  v_filter := coalesce(nullif(lower(trim(p_filter)), ''), 'all');
  v_search := nullif(trim(p_search), '');

  /*
    Cursor pagination uses (created_at, id) so ordering is deterministic even when
    multiple predictions share the same created_at timestamp.
  */
  with fetched as (
    select
      pred.id             as prediction_id,
      pred.title,
      pred.description,
      pred.status,
      pred.no_result_reason,
      pred.resolved_at,
      pred.created_at,
      pred.winning_option_id,
      pred.series_id,
      pred.series_prediction_number,
      s.title as series_title,
      user_bet.option_id  as selected_option_id,
      -- The caller's own stake and payout, for "you won / lost" on each card.
      user_bet.amount     as my_bet_amount,
      user_bet.payout     as my_payout,
      selected_opt.label  as selected_option_label,
      creator.username    as creator_username,
      resolver.username   as resolver_username,
      winning_opt.label   as winning_option_label,
      (
        select coalesce(sum(po.total_bet), 0)
        from public.prediction_options po
        where po.prediction_id = pred.id
      ) as total_pool,
      coalesce(bs.participant_count, 0) as participant_count,
      coalesce(bs.participant_count, 0) as total_bets,
      coalesce(bs.winner_count, 0) as winner_count,
      coalesce(bs.total_paid_to_winners, 0) as total_paid_to_winners,
      coalesce(bs.biggest_payout, 0) as biggest_payout,
      -- Room talk on the card: the top three reactions, the caller's own,
      -- and how many phrases were posted.
      (
        select json_agg(json_build_object('reaction', tr.reaction, 'count', tr.n) order by tr.n desc, tr.reaction)
        from (
          select r.reaction, count(*)::int as n
          from public.prediction_reactions r
          where r.prediction_id = pred.id
          group by r.reaction
          order by count(*) desc, r.reaction
          limit 3
        ) tr
      ) as top_reactions,
      (
        select r.reaction from public.prediction_reactions r
        where r.prediction_id = pred.id and r.player_id = v_caller_id
      ) as my_reaction,
      (
        select count(*)::int from public.prediction_posts pp
        where pp.prediction_id = pred.id
      ) as post_count,
      (
        select json_agg(
          json_build_object(
            'id',            po2.id,
            'label',         po2.label,
            'total_bet',     po2.total_bet,
            'display_order', po2.display_order
          ) order by po2.display_order
        )
        from public.prediction_options po2
        where po2.prediction_id = pred.id
      ) as options,
      -- Its tags, in the order they were added, for the card.
      array(
        select pt.tag from public.prediction_tags pt
        where pt.prediction_id = pred.id
        order by pt.created_at, pt.tag
      ) as tags
    from public.predictions pred
    left join public.series s on s.id = pred.series_id
    join public.players creator on creator.id = pred.created_by
    left join public.players resolver on resolver.id = pred.resolved_by
    left join public.prediction_options winning_opt
      on winning_opt.id = pred.winning_option_id
    left join public.bets user_bet
      on user_bet.prediction_id = pred.id
      and user_bet.player_id = v_caller_id
    left join public.prediction_options selected_opt
      on selected_opt.id = user_bet.option_id
    left join (
      select
        b.prediction_id,
        count(*) as participant_count,
        count(*) filter (
          where pred2.status = 'revealed'
            and b.option_id = pred2.winning_option_id
        ) as winner_count,
        sum(
          case
            when pred2.status = 'revealed'
              then greatest(coalesce(b.payout, 0) - b.amount, 0)
            else 0
          end
        ) as total_paid_to_winners,
        max(
          case
            when pred2.status = 'revealed'
              then greatest(coalesce(b.payout, 0) - b.amount, 0)
            else 0
          end
        ) as biggest_payout
      from public.bets b
      join public.predictions pred2 on pred2.id = b.prediction_id
      where pred2.room_id = p_room_id
        and pred2.status in ('revealed', 'cancelled', 'no_result')
      group by b.prediction_id
    ) bs on bs.prediction_id = pred.id
    where pred.room_id = p_room_id
      and pred.status in ('revealed', 'cancelled', 'no_result')
      and (p_series_id is null or pred.series_id = p_series_id)
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or (pred.created_at, pred.id) < (p_cursor_created_at, p_cursor_id)
      )
      and (
        v_search is null
        or coalesce(pred.title, '') ilike '%' || v_search || '%'
      )
      and case v_filter
        when 'wins' then (
          pred.status = 'revealed'
          and user_bet.option_id is not null
          and user_bet.option_id = pred.winning_option_id
        )
        when 'losses' then (
          pred.status = 'revealed'
          and user_bet.option_id is not null
          and user_bet.option_id <> pred.winning_option_id
        )
        when 'my_bets' then user_bet.option_id is not null
        else true
      end
    order by pred.created_at desc, pred.id desc
    limit p_limit + 1
  ),
  items as (
    select *
    from fetched
    order by created_at desc, prediction_id desc
    limit p_limit
  ),
  pagination as (
    select count(*) > p_limit as has_more
    from fetched
  ),
  tail_item as (
    select i.created_at, i.prediction_id
    from items i
    order by i.created_at asc, i.prediction_id asc
    limit 1
  )
  select json_build_object(
    'items', coalesce((select json_agg(i order by i.created_at desc, i.prediction_id desc) from items i), '[]'::json),
    'next_cursor_created_at', case when p.has_more then t.created_at else null end,
    'next_cursor_id', case when p.has_more then t.prediction_id else null end,
    'has_more', p.has_more
  )
  into v_result
  from pagination p
  left join tail_item t on true;

  return coalesce(
    v_result,
    json_build_object(
      'items', '[]'::json,
      'next_cursor_created_at', null,
      'next_cursor_id', null,
      'has_more', false
    )
  );
end;
$$;
