# Cricket Auction App — Full Stack Prompt

## Project Overview

Build a **real-time multiplayer cricket auction web app** using **Next.js 14 (App Router)**, **Supabase** (database + real-time + auth), deployable to **Vercel**. The app supports four concurrent user roles: Admin, Auctioneer, Team, and Spectator — all seeing live updates instantly via Supabase real-time subscriptions.

---

## Tech Stack

- **Framework**: Next.js 14 with App Router (`/app` directory)
- **Database + Real-time**: Supabase (Postgres + Supabase Realtime)
- **Auth**: Supabase Auth (email/password) — one account per role/team
- **Styling**: Tailwind CSS + custom CSS for animations
- **Fonts**: Google Fonts — `Bebas Neue` for display, `DM Sans` for body
- **Deployment**: Vercel (connect GitHub repo → auto-deploy)
- **Environment**: `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Supabase Database Schema

Run these in the Supabase SQL editor:

```sql
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

-- Auction state table (single row, tracks global state)
create table auction_state (
  id integer primary key default 1,
  current_player_id uuid references players(id),
  status text default 'setup' check (status in ('setup','live','paused','completed')),
  current_highest_bid integer default 0,
  current_highest_team_id uuid references teams(id),
  last_updated timestamptz default now()
);

-- Insert the single auction state row
insert into auction_state (id) values (1);

-- App config table (passcodes, settings)
create table app_config (
  key text primary key,
  value text not null
);

insert into app_config values
  ('admin_passcode', 'admin123'),
  ('auctioneer_passcode', 'auction123'),
  ('auction_locked', 'false');
```

**Enable Realtime** on tables: `players`, `bids`, `auction_state`, `teams`
(Supabase Dashboard → Database → Replication → enable for these tables)

**Row Level Security**: Disable RLS for all tables for this app (it's passcode-protected at the app layer, not the DB layer). Run:

```sql
alter table teams disable row level security;
alter table players disable row level security;
alter table bids disable row level security;
alter table auction_state disable row level security;
alter table app_config disable row level security;
```

---

## Project File Structure

```
/app
  /page.tsx                  → Mode selector (landing)
  /admin/page.tsx            → Admin dashboard
  /auctioneer/page.tsx       → Auctioneer control panel
  /team/page.tsx             → Team bidding interface
  /spectator/page.tsx        → Read-only live view
  /layout.tsx                → Root layout with fonts
/components
  /ModeSelector.tsx          → Landing mode picker
  /PasscodeGate.tsx          → Reusable passcode entry modal
  /PlayerCard.tsx            → Player display card
  /TeamCard.tsx              → Team budget + squad summary
  /BidTracker.tsx            → Live bid feed component
  /AuctionHero.tsx           → Big current-player display
  /AdminPlayerForm.tsx       → Add/edit player form
  /AdminTeamForm.tsx         → Add/edit team form
  /SquadTable.tsx            → Team's players list with prices
/lib
  /supabase.ts               → Supabase client init
  /useAuctionState.ts        → Global real-time state hook
  /useRealtime.ts            → Supabase channel subscription hook
  /formatPrice.ts            → ₹ formatting utility
/types
  /index.ts                  → All TypeScript interfaces
```

---

## TypeScript Types (`/types/index.ts`)

```typescript
export interface Team {
  id: string;
  name: string;
  primary_color: string;
  budget: number;
  budget_remaining: number;
  captain_name: string;
  passcode: string;
}

export interface Player {
  id: string;
  name: string;
  role: 'Batsman' | 'Bowler' | 'All-rounder' | 'Wicket-keeper';
  base_price: number;
  photo_url?: string;
  country?: string;
  batting_style?: string;
  bowling_style?: string;
  status: 'unsold' | 'on_auction' | 'sold';
  sold_to?: string;
  sold_price?: number;
  queue_order?: number;
}

export interface Bid {
  id: string;
  player_id: string;
  team_id: string;
  amount: number;
  created_at: string;
  team?: Team;
}

export interface AuctionState {
  id: number;
  current_player_id?: string;
  status: 'setup' | 'live' | 'paused' | 'completed';
  current_highest_bid: number;
  current_highest_team_id?: string;
  last_updated: string;
}
```

---

## Page-by-Page Behavior

### `/` — Mode Selector
- Full-screen dark landing with the app name **"NO RUN"**
- Four large mode cards: Admin, Auctioneer, Team, Spectator
- Clicking Admin / Auctioneer → opens `PasscodeGate` modal
- Clicking Team → opens `PasscodeGate` for auctioneer passcode, then a team selector dropdown (pick your team from DB), then that team's passcode
- Clicking Spectator → goes directly to `/spectator`
- Store selected mode + team in `sessionStorage` for page persistence

---

### `/admin` — Admin Dashboard
Tabs: **Players | Teams | Settings | Overview**

**Players tab:**
- Table of all players with status badges (Unsold / On Auction / Sold)
- "Add Player" button → slide-in form: name, role, base price, photo URL, country, batting style, bowling style
- Edit / Delete each player (only if status is `unsold`)
- "Randomize Queue Order" button — shuffles all unsold players and assigns `queue_order`
- Bulk import via CSV paste (optional enhancement)

**Teams tab:**
- Table of all teams: name, color swatch, budget, captain, passcode
- "Add Team" button → form: name, color picker, budget (₹), captain name, passcode
- Edit / Delete teams (only before auction is locked)

**Settings tab:**
- Change admin passcode
- Change auctioneer passcode
- Set per-team passcodes (or each team sets their own on first login)
- "Lock & Start Auction" button → sets `auction_state.status = 'live'`, sets `auction_locked = true` in `app_config`
- "Reset Entire Auction" (danger zone) → clears all bids, resets all player statuses to `unsold`, restores all team budgets

**Overview tab:**
- Read-only summary: all players grouped by status, all teams with squad + spend

---

### `/auctioneer` — Auctioneer Control Panel

**Layout**: Two-column — left is the active auction controls, right is a live sidebar of all teams.

**Left panel — Current Player on the Block:**
- Large `AuctionHero` card showing current player: name, role badge, base price, photo
- Current highest bid amount (live, updates in real-time from `bids` table)
- Current highest bidding team name + color
- Bid history for this player (scrollable list: team → amount → timestamp)
- Action buttons:
  - **"Next Player"** → picks next in `queue_order` from unsold players, sets `current_player_id` in `auction_state`, sets that player's status to `on_auction`
  - **"Close Bid & Allocate"** → dropdown to confirm winning team (pre-filled with highest bidder) → on confirm: sets player `status = 'sold'`, `sold_to = team_id`, `sold_price = amount`, deducts from `team.budget_remaining`
  - **"Mark Unsold"** → resets player status to `unsold`, clears from auction table, moves to end of queue
  - **"Undo Last Allocation"** (visible after each allocation) → reverses last sold player, restores budget

**Right sidebar — All Teams:**
- For each team: name, color bar, budget remaining, mini squad list (player name + price paid)
- Sorted by budget remaining descending

---

### `/team` — Team Bidding Interface

**On entry**: Team selector → team passcode → enter

**Layout**: Three sections

**Top — Current Auction (hero):**
- Player on the block: name, role, photo, base price
- Current highest bid + who placed it
- If your team is the highest bidder: green highlight "YOU'RE WINNING"
- If outbid: red highlight "YOU'VE BEEN OUTBID"
- **Bid input**: number field (must be > current highest bid and > base price, in increments of ₹10,000) + "Place Bid" button
- Bid button disabled once auctioneer closes the bid
- Bid button disabled if team has insufficient budget

**Middle — Your Squad:**
- Your team's remaining budget (large, prominent)
- Table: player name | role | price paid
- Total spent so far

**Bottom — All Teams Overview:**
- Collapsed accordion per team: name, budget remaining, squad count
- Expand to see full squad + prices

---

### `/spectator` — Read-Only Live View

**Layout**: Full dashboard, no interactions

**Section 1 — Auction Hero (top, full width):**
- Current player on the block with all details
- Live bid ticker: shows all bids placed for current player, newest on top
- Highest bid + team highlighted

**Section 2 — Teams Grid:**
- Card per team showing: name, color, budget remaining, % of budget used (progress bar), squad list

**Section 3 — Full Player Registry (bottom):**
- All players in a filterable table
- Columns: name, role, base price, status, sold to, sold for
- Filter by: role, status, team
- Sorts by: price (asc/desc), name

---

## Real-Time Implementation

Use Supabase Realtime channels. In `/lib/useRealtime.ts`:

```typescript
import { useEffect } from 'react';
import { supabase } from './supabase';

export function useRealtime(table: string, callback: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, callback]);
}
```

Subscribe to `auction_state`, `bids`, `players`, `teams` in each page and re-fetch relevant data on any change.

---

## Design System

### Colors (CSS variables in `globals.css`)

```css
:root {
  --bg-primary: #08090d;
  --bg-secondary: #111318;
  --bg-card: #16191f;
  --border: #2a2d35;
  --gold: #f0b429;
  --gold-dim: #b88a1a;
  --text-primary: #f0f0f0;
  --text-secondary: #8a8f9e;
  --green: #22c55e;
  --red: #ef4444;
  --blue: #3b82f6;
}
```

### Typography
- Display/headings: `Bebas Neue` (Google Fonts)
- Body: `DM Sans` (Google Fonts)
- Monospace amounts: `JetBrains Mono`

### Key Animations

```css
/* Player reveal on new auction */
@keyframes slideUp {
  from { transform: translateY(40px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Bid amount tick */
@keyframes bidPulse {
  0% { transform: scale(1); color: var(--text-primary); }
  50% { transform: scale(1.08); color: var(--gold); }
  100% { transform: scale(1); color: var(--text-primary); }
}

/* Sold stamp */
@keyframes stampIn {
  from { transform: scale(2) rotate(-15deg); opacity: 0; }
  to { transform: scale(1) rotate(-15deg); opacity: 1; }
}
```

### Component Patterns
- All cards: `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: 12px`
- Gold accent on active states, hover borders
- Team color used as left border accent on team cards
- Status badges: pill-shaped, color-coded (gold = on_auction, green = sold, gray = unsold)
- Price amounts always formatted as `₹X,XX,XXX` (Indian numbering system)

---

## Vercel Deployment

1. Push project to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Next.js

The Supabase anon key is safe to expose publicly (it's designed for client-side use). RLS is disabled since auth is handled at the app layer via passcodes.

---

## Edge Cases to Handle

- **Bid below base price**: Reject with inline error
- **Bid below current highest**: Reject with inline error
- **Team budget exceeded**: Disable bid button, show warning
- **No players left**: Auctioneer sees "Auction Complete" state
- **Two teams submit same bid simultaneously**: Use `created_at` timestamp — earlier bid wins
- **Auctioneer refreshes mid-auction**: Re-hydrate from `auction_state` table on mount
- **Team tries to bid after close**: Button disabled once `current_player_id` changes or status updates

---

## Optional Enhancements (Phase 2)

- **Timer**: Countdown per bid (e.g. 30 seconds after last bid → auto-close)
- **Sound effects**: Gavel sound on allocation, bid placed sound
- **Export**: Download final auction results as CSV/PDF
- **Team logo upload**: Via Supabase Storage
- **Mobile-optimized team view**: For bidding from phones
- **Auction replay**: Step through bid history post-auction
