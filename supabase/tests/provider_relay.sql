begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select throws_ok(
  $$ select public.provider_http_get('https://example.com/steal') $$,
  'P0001', 'That URL isn''t an allowed provider',
  'the relay only calls allowed providers'
);
select lives_ok(
  $$ select public.provider_http_get('https://api.cricapi.com/v1/series?offset=0') $$,
  'a CricketData.org request is queued'
);
select is(
  public.provider_http_response(-1)->>'done',
  'false',
  'a reply that hasn''t arrived says so'
);

set local role authenticated;
select throws_ok(
  $$ select public.provider_http_get('https://api.cricapi.com/v1/series') $$,
  '42501', null,
  'app users can''t use the relay'
);
select throws_ok(
  $$ select public.provider_http_response(1) $$,
  '42501', null,
  'or read its replies'
);
reset role;

select * from finish();
rollback;
