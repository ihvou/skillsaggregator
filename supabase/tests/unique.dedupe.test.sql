begin;

create extension if not exists pgtap;

select plan(1);

insert into public.suggestions (type, status, origin_type, payload_json, dedupe_key)
values
  ('LINK_UPVOTE_SKILL', 'pending', 'agent', '{"link_id":"l1","target_skill_id":"s1"}', 'duplicate-key');

select throws_ok(
  $$insert into public.suggestions (type, status, origin_type, payload_json, dedupe_key)
    values ('LINK_UPVOTE_SKILL', 'pending', 'agent', '{"link_id":"l1","target_skill_id":"s1"}', 'duplicate-key')$$,
  '23505',
  'pending suggestion dedupe key is unique'
);

select * from finish();
rollback;
