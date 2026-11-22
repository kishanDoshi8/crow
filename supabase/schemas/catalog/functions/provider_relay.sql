-- Provider calls made by the database instead of the edge function.
-- CricketData.org resets connections from the edge runtime (its TLS client)
-- but answers the database's own HTTP client (pg_net), so the sync-fixtures
-- and catalog-admin functions ask the database to make the request, wait a
-- moment and read the reply. Server only (service role).

-- Queues a GET to an allowed provider and returns its request id. pg_net
-- sends it once this call's transaction commits.
create or replace function public.provider_http_get(p_url text)
returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Only the providers that need it: this is not a general proxy.
  if p_url is null or p_url not like 'https://api.cricapi.com/v1/%' then
    raise exception 'That URL isn''t an allowed provider' using errcode = 'P0001';
  end if;

  return net.http_get(url := p_url, timeout_milliseconds := 15000);
end;
$$;

-- The reply to a request from provider_http_get: {"done": false} while it's
-- on its way, then its status, body and any error. A reply is read once:
-- it's deleted here, since a provider can echo the API key in its body.
create or replace function public.provider_http_response(p_request_id bigint)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_reply record;
begin
  select r.status_code, r.content, r.error_msg, r.timed_out
    into v_reply
  from net._http_response r
  where r.id = p_request_id;

  if not found then
    return json_build_object('done', false);
  end if;

  begin
    delete from net._http_response where id = p_request_id;
  exception when insufficient_privilege then
    -- pg_net clears its replies itself within hours.
    null;
  end;

  return json_build_object(
    'done', true,
    'status', v_reply.status_code,
    'body', v_reply.content,
    'error', v_reply.error_msg,
    'timed_out', coalesce(v_reply.timed_out, false)
  );
end;
$$;
