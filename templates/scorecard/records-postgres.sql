-- HQ scorecard: a starting point for reporting a business's OWN records from Postgres or Supabase.
-- Guide: docs/guides/scorecard-records.md. Claude adapts this to the business's schema (every `ADAPT:` line),
-- tests it on a local copy first, then the owner applies it through their normal migrations.
--
-- What it creates:
--   hq_membership_changes   history of every tier/status change (a trigger fills it; it can never block a write)
--   hq_scorecard_tokens     the SHA-256 of the HQ adapter's token (the token itself lives in the owner's Keychain)
--   hq_scorecard(token, weeks)  totals only: counts and rates by week. No emails, ids or names ever leave.
--
-- Assumed shape (ADAPT to the real tables and columns):
--   users(id uuid, created_at timestamptz)                                   -- one row per signup
--   memberships(user_id uuid, tier text, status text, updated_at timestamptz) -- one row per user, current plan
--   first_value_events(user_id uuid, created_at timestamptz)                  -- the "first value" action
-- Paying = tier in ('pro','team') and status = 'active'.                     -- ADAPT: your paid tiers and status

create extension if not exists pgcrypto;  -- ADAPT: on Supabase it lives in schema "extensions" already

-- ---------------------------------------------------------------- history
create table if not exists public.hq_membership_changes (
  id bigserial primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  op text not null check (op in ('seed', 'insert', 'update')),
  tier text,
  status text
);
create index if not exists hq_membership_changes_user_at on public.hq_membership_changes (user_id, at desc);
alter table public.hq_membership_changes enable row level security;
revoke all on table public.hq_membership_changes from public;

create or replace function public.hq_log_membership_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' or old.tier is distinct from new.tier or old.status is distinct from new.status then  -- ADAPT columns
      insert into public.hq_membership_changes (user_id, op, tier, status)
      values (new.user_id, lower(tg_op), new.tier, new.status);
    end if;
  exception when others then
    raise warning 'hq_membership_changes not recorded: %', sqlerrm;   -- never blocks the membership write
  end;
  return new;
end $$;
revoke all on function public.hq_log_membership_change() from public;

drop trigger if exists hq_membership_history on public.memberships;          -- ADAPT table
create trigger hq_membership_history after insert or update on public.memberships
  for each row execute function public.hq_log_membership_change();

insert into public.hq_membership_changes (user_id, op, tier, status)
select m.user_id, 'seed', m.tier, m.status from public.memberships m       -- ADAPT table
where not exists (select 1 from public.hq_membership_changes where op = 'seed');

-- ---------------------------------------------------------------- token
create table if not exists public.hq_scorecard_tokens (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  label text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.hq_scorecard_tokens enable row level security;
revoke all on table public.hq_scorecard_tokens from public;

-- ---------------------------------------------------------------- helpers
create or replace function public.hq_is_paying(_tier text, _status text) returns boolean
language sql immutable as $$ select coalesce(_tier in ('pro', 'team') and _status = 'active', false) $$;  -- ADAPT

create or replace function public.hq_state_at(_ts timestamptz) returns table (user_id uuid, tier text, paying boolean)
language sql stable set search_path = public as $$
  select distinct on (c.user_id) c.user_id, c.tier, public.hq_is_paying(c.tier, c.status)
  from public.hq_membership_changes c where c.at <= _ts order by c.user_id, c.at desc, c.id desc
$$;

create or replace function public.hq_metric(_id text, _value numeric, _quality text, _note text, _breakdown jsonb default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', _id, 'value', _value, 'quality', case when _value is null then 'missing' else _quality end, 'note', coalesce(_note, ''))
    || case when _breakdown is not null and _value is not null and jsonb_array_length(_breakdown) > 0 then jsonb_build_object('breakdown', _breakdown) else '{}'::jsonb end
$$;
revoke all on function public.hq_is_paying(text, text), public.hq_state_at(timestamptz), public.hq_metric(text, numeric, text, text, jsonb) from public;

-- ---------------------------------------------------------------- the report
create or replace function public.hq_scorecard(p_token text, p_weeks int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'UTC';                      -- ADAPT: the business's time zone, e.g. 'Australia/Sydney'
  currency constant text := 'USD';                -- ADAPT: must equal the HQ profile's currency
  t0 timestamptz; monday timestamp; weeks jsonb := '[]'::jsonb; k int; s timestamptz; e timestamptz; m jsonb;
  v_cohort int; v_active int; v_base int; v_lost int; v_new int; v_paying int; v_by jsonb;
begin
  if p_token is null or not exists (select 1 from public.hq_scorecard_tokens
      where token_sha256 = encode(digest(p_token, 'sha256'), 'hex') and revoked_at is null) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  p_weeks := least(greatest(coalesce(p_weeks, 12), 1), 26);
  select coalesce(min(at), now()) into t0 from public.hq_membership_changes where op = 'seed';
  monday := date_trunc('week', now() at time zone tz);

  for k in 1..p_weeks loop
    s := (monday - make_interval(days => 7 * k)) at time zone tz;
    e := (monday - make_interval(days => 7 * (k - 1))) at time zone tz;
    m := jsonb_build_array(public.hq_metric('new_signups',
      (select count(*) from public.users u where u.created_at >= s and u.created_at < e), 'exact', ''));   -- ADAPT table

    -- Activation: of last week's signups, how many reached first value within 7 days.
    select count(*), count(*) filter (where exists (select 1 from public.first_value_events f       -- ADAPT table
             where f.user_id = u.id and f.created_at < u.created_at + interval '7 days'))
      into v_cohort, v_active from public.users u where u.created_at >= s - interval '7 days' and u.created_at < s;
    m := m || jsonb_build_array(public.hq_metric('activation_rate', case when v_cohort > 0 then round(v_active::numeric / v_cohort, 4) end,
      'exact', case when v_cohort > 0 then 'First value within 7 days, for the signups of the week before' else 'No signups in the cohort week' end));

    -- Churn and new paying need history covering the whole week.
    if s >= t0 then
      select count(*), count(*) filter (where not coalesce(b.paying, false)) into v_base, v_lost
        from public.hq_state_at(s) a left join public.hq_state_at(e) b on b.user_id = a.user_id where a.paying;
      select count(*) into v_new from public.hq_state_at(e) a left join public.hq_state_at(s) b on b.user_id = a.user_id
        where a.paying and not coalesce(b.paying, false);
      m := m || jsonb_build_array(
        public.hq_metric('paying_churn_rate', case when v_base > 0 then round(v_lost::numeric / v_base, 4) end, 'exact',
          case when v_base > 0 then v_lost || ' of ' || v_base || ' stopped paying' else 'Nobody was paying at the start of the week' end),
        public.hq_metric('new_paying', v_new, 'exact', ''));
    else
      m := m || jsonb_build_array(
        public.hq_metric('paying_churn_rate', null, 'missing', 'Needs membership history (starts ' || to_char(t0, 'YYYY-MM-DD') || ')'),
        public.hq_metric('new_paying', null, 'missing', 'Needs membership history (starts ' || to_char(t0, 'YYYY-MM-DD') || ')'));
    end if;

    -- Paying customers TODAY for the newest week (HQ's billing check compares this with billing), by tier.
    if k = 1 then
      select count(*) filter (where public.hq_is_paying(tier, status)) into v_paying from public.memberships;   -- ADAPT table
      select coalesce(jsonb_agg(jsonb_build_object('label', initcap(tier), 'value', n) order by tier), '[]'::jsonb) into v_by
        from (select tier, count(*) n from public.memberships where public.hq_is_paying(tier, status) group by tier) x;
      m := m || jsonb_build_array(public.hq_metric('paying_customers', v_paying, 'exact', 'As of today', v_by));
    end if;

    weeks := weeks || jsonb_build_array(jsonb_build_object('week', to_char(monday - make_interval(days => 7 * k), 'IYYY-"W"IW'), 'metrics', m));
  end loop;
  return jsonb_build_object('version', 1, 'observedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'currency', currency, 'weeks', weeks);
end $$;

-- Who may call it. Supabase: the public anon key plus the token (anon's 3 s statement timeout applies, so keep
-- every query index-backed). Plain Postgres: create a login role that can ONLY execute this function.
revoke all on function public.hq_scorecard(text, int) from public;
-- ADAPT one of:
-- grant execute on function public.hq_scorecard(text, int) to anon;                    -- Supabase
-- create role hq_reader login password '<typed by the owner>'; grant execute on function public.hq_scorecard(text, int) to hq_reader;  -- Postgres
