-- ============================================================
-- STRIKE — Cricket Auction App Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Teams table
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  primary_color text default '#f0b429',
  budget integer not null default 1000000,
  budget_remaining integer not null default 1000000,
  captain_name text,
  passcode text not null,
  created_at timestamptz default now()
);

-- Players table
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text check (role in ('Batsman','Bowler','All-rounder','Wicket-keeper')),
  base_price integer not null default 100000,
  photo_url text,
  country text,
  batting_style text,
  bowling_style text,
  status text default 'unsold' check (status in ('unsold','on_auction','sold')),
  sold_to uuid references teams(id),
  sold_price integer,
  queue_order integer,
  created_at timestamptz default now()
);

-- Bids table
create table bids (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id),
  team_id uuid references teams(id),
  amount integer not null,
  created_at timestamptz default now()
);

-- Auction state (single row, tracks global state)
create table auction_state (
  id integer primary key default 1,
  current_player_id uuid references players(id),
  status text default 'setup' check (status in ('setup','live','paused','completed')),
  current_highest_bid integer default 0,
  current_highest_team_id uuid references teams(id),
  timer_expires_at timestamptz,
  current_round integer not null default 1,
  last_updated timestamptz default now()
);

insert into auction_state (id) values (1);

-- Auction settings (single row, admin-configurable)
create table auction_settings (
  id integer primary key default 1,
  bid_increment integer not null default 10000,
  max_players_per_team integer not null default 25,
  min_players_per_team integer not null default 15,
  timer_enabled boolean not null default true,
  timer_duration_seconds integer not null default 30,
  default_team_budget integer not null default 1000000,
  default_base_price integer not null default 100000
);

insert into auction_settings (id) values (1);

-- App config (key-value store for passcodes and settings)
create table app_config (
  key text primary key,
  value text not null
);

insert into app_config values
  ('admin_passcode', 'admin123'),
  ('auctioneer_passcode', 'auction123'),
  ('auction_locked', 'false');

-- ============================================================
-- Disable RLS (auth handled at app layer via passcodes)
-- ============================================================
alter table teams disable row level security;
alter table players disable row level security;
alter table bids disable row level security;
alter table auction_state disable row level security;
alter table auction_settings disable row level security;
alter table app_config disable row level security;

-- ============================================================
-- RPC Functions
-- ============================================================

-- Atomic bid placement with all validations
create or replace function place_bid(
  p_player_id uuid,
  p_team_id uuid,
  p_amount integer
) returns jsonb as $$
declare
  v_current auction_state%rowtype;
  v_settings auction_settings%rowtype;
  v_team teams%rowtype;
  v_squad_count integer;
  v_remaining_mandatory integer;
  v_max_bid integer;
begin
  select * into v_current from auction_state where id = 1 for update;
  select * into v_settings from auction_settings where id = 1;
  select * into v_team from teams where id = p_team_id for update;
  select count(*) into v_squad_count from players where sold_to = p_team_id;

  v_remaining_mandatory := greatest(0, v_settings.min_players_per_team - v_squad_count - 1);
  v_max_bid := v_team.budget_remaining - (v_remaining_mandatory * v_settings.default_base_price);

  if v_current.status != 'live' then
    return jsonb_build_object('error', 'Auction is not live');
  end if;

  if v_current.current_player_id is null or v_current.current_player_id != p_player_id then
    return jsonb_build_object('error', 'This player is not currently on auction');
  end if;

  if p_amount < v_current.current_highest_bid + v_settings.bid_increment then
    return jsonb_build_object('error', 'Bid must be at least ' || (v_current.current_highest_bid + v_settings.bid_increment));
  end if;

  if v_squad_count >= v_settings.max_players_per_team then
    return jsonb_build_object('error', 'Squad is full');
  end if;

  if p_amount > v_max_bid then
    return jsonb_build_object('error', 'Exceeds max bid. Reserve budget for ' || v_remaining_mandatory || ' more mandatory slots.', 'max_bid', v_max_bid);
  end if;

  if p_amount > v_team.budget_remaining then
    return jsonb_build_object('error', 'Insufficient budget');
  end if;

  insert into bids (player_id, team_id, amount) values (p_player_id, p_team_id, p_amount);

  update auction_state set
    current_highest_bid = p_amount,
    current_highest_team_id = p_team_id,
    timer_expires_at = case when v_settings.timer_enabled
      then now() + (v_settings.timer_duration_seconds || ' seconds')::interval
      else null end,
    last_updated = now()
  where id = 1;

  return jsonb_build_object('success', true, 'max_bid', v_max_bid);
end;
$$ language plpgsql;

-- Get max bid for a team (client-side helper)
create or replace function get_team_max_bid(p_team_id uuid)
returns integer as $$
declare
  v_settings auction_settings%rowtype;
  v_team teams%rowtype;
  v_squad_count integer;
  v_remaining_mandatory integer;
begin
  select * into v_settings from auction_settings where id = 1;
  select * into v_team from teams where id = p_team_id;
  select count(*) into v_squad_count from players where sold_to = p_team_id;
  v_remaining_mandatory := greatest(0, v_settings.min_players_per_team - v_squad_count - 1);
  return v_team.budget_remaining - (v_remaining_mandatory * v_settings.default_base_price);
end;
$$ language plpgsql;

-- Start unsold round: re-introduce all unsold players
create or replace function start_unsold_round()
returns jsonb as $$
declare
  v_current auction_state%rowtype;
  v_unsold_count integer;
  v_new_round integer;
begin
  select * into v_current from auction_state where id = 1 for update;

  if v_current.current_player_id is not null then
    return jsonb_build_object('error', 'Close current player first');
  end if;

  select count(*) into v_unsold_count from players where status = 'unsold';
  if v_unsold_count = 0 then
    return jsonb_build_object('error', 'No unsold players to re-introduce');
  end if;

  v_new_round := v_current.current_round + 1;

  with shuffled as (
    select id, row_number() over (order by random()) as new_order
    from players where status = 'unsold'
  )
  update players p set queue_order = s.new_order
  from shuffled s where p.id = s.id;

  update auction_state set
    current_round = v_new_round,
    last_updated = now()
  where id = 1;

  return jsonb_build_object('success', true, 'round', v_new_round, 'players_queued', v_unsold_count);
end;
$$ language plpgsql;

-- ============================================================
-- Enable Realtime (run in Supabase Dashboard or via SQL)
-- Go to Database > Replication and enable for:
--   players, bids, auction_state, teams, auction_settings
-- ============================================================
