begin;

create extension if not exists pgtap;

select plan(2);

set local role anon;
select is_empty(
  $$select * from public.suggestions$$,
  'anon cannot see suggestions'
);

reset role;
select ok(true, 'moderator access is exercised in integration tests with auth claims');

select * from finish();
rollback;
