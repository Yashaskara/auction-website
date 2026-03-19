# NO RUN — Cricket Auction Platform

Real-time multiplayer IPL-style cricket auction web app. Multiple users connect simultaneously as Admin, Auctioneer, Team owners, or Spectators — all seeing live updates as bids are placed, players are sold, and budgets deplete in real time.

---

## Table of Contents

- [How the Auction Works](#how-the-auction-works)
- [Roles & Access](#roles--access)
- [Auction Flow (Step by Step)](#auction-flow-step-by-step)
- [Bidding Mechanics](#bidding-mechanics)
- [Budget & Max Bid Calculation](#budget--max-bid-calculation)
- [Unsold Rounds (Accelerated Auction)](#unsold-rounds-accelerated-auction)
- [Timer System](#timer-system)
- [Admin Settings Reference](#admin-settings-reference)
- [Database Schema](#database-schema)
- [Real-time Architecture](#real-time-architecture)
- [Tech Stack](#tech-stack)
- [Setup & Installation](#setup--installation)
- [Deployment](#deployment)

---

## How the Auction Works

No Run replicates the IPL mega-auction format:

1. An **Admin** sets up the auction by creating teams, adding players (each with a base price), and configuring rules like bid increment, squad sizes, budgets, and timer duration.
2. The Admin **locks and starts** the auction, transitioning the system from `setup` to `live`.
3. An **Auctioneer** controls the flow — selecting the next player to put "on the block."
4. **Team owners** see the player appear on their screen in real time and place bids. Bids must meet the minimum (base price for the first bid, then current highest + increment for subsequent bids).
5. The Auctioneer either **sells** the player to the highest bidder or marks them **unsold**.
6. When all players in the queue have been processed, the Auctioneer can start an **Unsold Round** to re-introduce all unsold players for another pass (like the IPL accelerated auction).
7. The auction continues until the Admin marks it complete or all players are allocated.

All changes propagate in real time to every connected user via Supabase Realtime (Postgres change notifications).

---

## Roles & Access

The landing page (`/`) presents four role cards. Each role (except Spectator) is protected by a passcode.

| Role | Route | Access | Passcode |
|------|-------|--------|----------|
| **Admin** | `/admin` | Full control: manage players, teams, settings, start/pause/reset auction | Stored in `app_config` as `admin_passcode` (default: `admin123`) |
| **Auctioneer** | `/auctioneer` | Auction flow control: next player, sell, mark unsold, undo last sale, start unsold round | Stored in `app_config` as `auctioneer_passcode` (default: `auction123`) |
| **Team** | `/team` | Place bids, view own squad and budget, see all teams | Two-step gate: first enter the auctioneer passcode, then select team and enter team-specific passcode |
| **Spectator** | `/spectator` | Read-only live view: current player, bids, teams grid, full player registry | No passcode required |

Sessions are stored in `sessionStorage` (browser tab-scoped). Closing the tab or clicking "Exit" clears the session.

---

## Auction Flow (Step by Step)

### Phase 1: Setup (Admin)

1. **Add Players** — Manually via form or bulk-import from CSV.
   - CSV format: `Name, Role, BasePrice, Country` (one player per line)
   - Valid roles: `Batsman`, `Bowler`, `All-rounder`, `Wicket-keeper`
   - Each player gets a `queue_order` that determines the sequence they appear during the auction.
2. **Add Teams** — Name, primary color, budget, captain name, passcode.
3. **Configure Settings** — Bid increment, squad sizes, default budget/base price, timer.
4. **Randomize Queue** — Shuffle the order unsold players will appear.
5. **Lock & Start Auction** — Transitions status from `setup` → `live`. Once locked, players and teams cannot be added or removed.

### Phase 2: Live Auction (Auctioneer + Teams)

```
┌────────────────────────────────────────────────────────┐
│  Auctioneer clicks "NEXT PLAYER"                       │
│  → Player status changes to on_auction                 │
│  → current_highest_bid = player's base_price           │
│  → current_highest_team_id = null (no bids yet)        │
│  → Timer starts (if enabled)                           │
├────────────────────────────────────────────────────────┤
│  Teams see the player appear on their screens          │
│  → First bid must be ≥ base price                      │
│  → Each subsequent bid must be ≥ highest + increment   │
│  → Each bid resets the timer                           │
│  → Outbid notifications appear in real time            │
├────────────────────────────────────────────────────────┤
│  Auctioneer resolves:                                  │
│  → SELL: Player → sold, budget deducted from team      │
│  → UNSOLD: Player goes back to unsold queue            │
│  → UNDO: Reverses the last sale (one level deep)       │
├────────────────────────────────────────────────────────┤
│  Repeat for next player...                             │
└────────────────────────────────────────────────────────┘
```

### Phase 3: Unsold Rounds

When all queued players have been processed, the Auctioneer sees an "UNSOLD ROUND" button. Clicking it:
- Increments the round counter (Round 1 → Round 2, etc.)
- Re-shuffles all unsold players into a new random queue order
- The process repeats from Phase 2

### Phase 4: Completion

The Admin can pause, resume, or reset the auction at any time from the Settings tab.
- **Pause**: Freezes the auction; teams cannot bid.
- **Resume**: Resumes from paused state.
- **Reset**: Clears all bids, resets all player statuses to unsold, restores team budgets, returns to setup state. Requires double confirmation.

---

## Bidding Mechanics

Bidding follows IPL auction rules:

### First Bid on a Player
When a player is put on the block, `current_highest_bid` is set to the player's **base price** and `current_highest_team_id` is `null`. The first team to bid must bid **at least the base price** (not base price + increment). This lets teams match the base price exactly.

### Subsequent Bids
After the first bid, every new bid must be at least:

```
current_highest_bid + bid_increment
```

The bid increment is configurable in Admin Settings (e.g., ₹5,000 or ₹10,00,000).

### Bid Placement (Atomic RPC)
Bids are placed via a Postgres RPC function (`place_bid`) that runs atomically with row-level locking (`FOR UPDATE`) to prevent race conditions. The function validates:

1. Auction is in `live` status
2. The correct player is on the block
3. Bid amount meets the minimum (base price or highest + increment)
4. Team's squad is not full (`squad_count < max_players_per_team`)
5. Bid does not exceed the team's max bid (budget reservation)
6. Team has sufficient remaining budget

If any check fails, the bid is rejected with an error message. If all pass, the bid is recorded, `auction_state` is updated, and the timer resets.

### Bid Adjustment Controls
On the Team page, +/- buttons adjust the bid by the configured increment. The number input also accepts any value within the valid range (min bid to max bid).

---

## Budget & Max Bid Calculation

To prevent a team from blowing their entire budget on one player and being unable to fill their squad, NO RUN enforces a **max bid cap** derived from mandatory squad reservation:

```
remaining_mandatory_slots = max(0, min_players_per_team - current_squad_count - 1)
max_bid = budget_remaining - (remaining_mandatory_slots × default_base_price)
```

### Example
- Team budget remaining: ₹50,00,000
- Min players per team: 15
- Current squad: 10 players
- Default base price: ₹1,00,000

```
remaining_mandatory_slots = max(0, 15 - 10 - 1) = 4
max_bid = 50,00,000 - (4 × 1,00,000) = 46,00,000
```

The team can bid up to ₹46,00,000 on the current player, keeping ₹4,00,000 reserved to fill the remaining 4 mandatory slots at base price.

This cap is enforced both client-side (UI disables the bid button) and server-side (the `place_bid` RPC rejects bids exceeding the cap). The max bid is visible to:
- The **Team** on their bidding interface
- The **Auctioneer** in the team sidebar

If `min_players_per_team` is set to 0, there is no reservation — teams can spend their entire budget on a single player.

---

## Unsold Rounds (Accelerated Auction)

Mirrors the IPL accelerated auction:

1. After all players in the current queue have been presented, unsold players remain in the pool.
2. The Auctioneer clicks **"UNSOLD ROUND (N)"** where N is the count of unsold players.
3. The `start_unsold_round` RPC:
   - Validates no player is currently on the block
   - Increments `current_round` in `auction_state`
   - Randomly re-orders all unsold players with new `queue_order` values
4. The Auctioneer proceeds as normal with "NEXT PLAYER."
5. The round number is displayed in the header on all views.

Multiple unsold rounds can occur (Round 1, Round 2, Round 3, etc.) until all players are sold or the Admin ends the auction.

---

## Timer System

An optional countdown timer creates bidding urgency:

| Setting | Default | Description |
|---------|---------|-------------|
| `timer_enabled` | `true` | Toggle the timer on/off |
| `timer_duration_seconds` | `30` | Seconds per bid window |

### How it works
1. When a player is put on the block, `timer_expires_at` is set to `now + duration`.
2. Every new bid resets `timer_expires_at` to `now + duration` (server-side, in the `place_bid` RPC).
3. The countdown is computed client-side by comparing `timer_expires_at` to `Date.now()`, updated every 100ms.
4. Visual states:
   - **Green** (> 15s remaining)
   - **Yellow/warning** (5–15s remaining)
   - **Red/pulsing** (≤ 5s remaining)
   - **"TIME'S UP"** (expired)
5. On expiry, the Auctioneer page auto-triggers:
   - If there's a highest bidder → shows "Timer expired — confirming sale..." and auto-sells after 3 seconds
   - If no bids → shows "Timer expired — no bids placed" (Auctioneer manually marks unsold)

---

## Admin Settings Reference

All settings are in the **Settings** tab of the Admin dashboard:

| Parameter | Field | Default | Description |
|-----------|-------|---------|-------------|
| Bid Increment | `bid_increment` | ₹10,000 | Minimum raise between bids (after first bid) |
| Max Players Per Team | `max_players_per_team` | 25 | Maximum squad size; bidding disabled when full |
| Min Players Per Team | `min_players_per_team` | 15 | Mandatory squad size for budget reservation calc |
| Default Team Budget | `default_team_budget` | ₹10,00,000 | Pre-filled budget when creating a new team |
| Default Base Price | `default_base_price` | ₹1,00,000 | Pre-filled base price when adding a player; also used in max bid reservation |
| Timer Enabled | `timer_enabled` | On | Whether the countdown timer is active |
| Timer Duration | `timer_duration_seconds` | 30s | Countdown duration per bid window |

Additionally, from the Settings tab:
- **Passcodes**: Update Admin and Auctioneer passcodes (team passcodes are set per-team)
- **Auction Control**: Lock & Start, Pause, Resume, or Reset the entire auction

---

## Database Schema

Six tables in Supabase (Postgres):

### `teams`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text (unique) | Team name |
| `primary_color` | text | Hex color for UI badges |
| `budget` | integer | Total starting budget |
| `budget_remaining` | integer | Current remaining budget |
| `captain_name` | text | Optional |
| `passcode` | text | Team-specific auth |

### `players`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Player name |
| `role` | text | Batsman / Bowler / All-rounder / Wicket-keeper |
| `base_price` | integer | Starting bid price |
| `photo_url` | text | Optional image URL |
| `country` | text | Optional |
| `status` | text | `unsold` / `on_auction` / `sold` |
| `sold_to` | uuid (FK → teams) | Team that won the player |
| `sold_price` | integer | Final sale price |
| `queue_order` | integer | Position in auction queue |

### `bids`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `player_id` | uuid (FK → players) | Which player |
| `team_id` | uuid (FK → teams) | Which team bid |
| `amount` | integer | Bid amount |
| `created_at` | timestamptz | Bid timestamp |

### `auction_state` (single row, id=1)
| Column | Type | Description |
|--------|------|-------------|
| `status` | text | `setup` / `live` / `paused` / `completed` |
| `current_player_id` | uuid (FK) | Player currently on the block |
| `current_highest_bid` | integer | Highest bid (or base price if no bids) |
| `current_highest_team_id` | uuid (FK) | Team with highest bid (null if no bids) |
| `timer_expires_at` | timestamptz | When current timer expires |
| `current_round` | integer | Auction round number (starts at 1) |

### `auction_settings` (single row, id=1)
All configurable auction parameters (see [Admin Settings Reference](#admin-settings-reference)).

### `app_config` (key-value store)
| Key | Default Value | Description |
|-----|---------------|-------------|
| `admin_passcode` | `admin123` | Admin login passcode |
| `auctioneer_passcode` | `auction123` | Auctioneer login passcode |
| `auction_locked` | `false` | Whether auction is locked (no entity changes) |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `place_bid(p_player_id, p_team_id, p_amount)` | Atomic bid placement with all validations and row-level locking |
| `get_team_max_bid(p_team_id)` | Returns the maximum bid a team can place (budget minus mandatory reservation) |
| `start_unsold_round()` | Increments round counter and re-shuffles unsold players |

Row-Level Security is **disabled** on all tables — authentication is handled at the application layer via passcodes.

---

## Real-time Architecture

Every data change propagates to all connected clients via **Supabase Realtime** (Postgres change notifications over WebSockets):

```
Database change → Postgres WAL → Supabase Realtime → WebSocket → Client callback
```

Tables with realtime enabled:
- `auction_state` — triggers re-fetch of current player, bids, and state
- `bids` — triggers bid history refresh
- `teams` — triggers budget display updates
- `players` — triggers squad and player list updates
- `auction_settings` — triggers settings refresh

On the client side, the `useRealtime(table, callback)` hook subscribes to `postgres_changes` events for a given table and invokes the callback on any INSERT, UPDATE, or DELETE.

The central `useAuctionState()` hook orchestrates all subscriptions and provides a unified interface (`auctionState`, `settings`, `currentPlayer`, `bids`, `teams`) to any page that needs auction data.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Supabase (Postgres) |
| Real-time | Supabase Realtime (WebSocket) |
| Styling | Tailwind CSS + custom CSS variables |
| Auth | Passcode-based (sessionStorage) |
| Fonts | Bebas Neue (display), DM Sans (body), JetBrains Mono (prices/numbers) |
| Icons | Lucide React |
| Notifications | Sonner (toast) |
| Utilities | clsx (conditional classes) |
| Price formatting | `Intl.NumberFormat("en-IN")` — Indian numbering system (lakhs/crores) |

### File Structure

```
app/
  page.tsx            Landing page with role selection & passcode gates
  layout.tsx          Root layout (fonts, Toaster, force-dynamic)
  globals.css         CSS variables, keyframe animations, scrollbar styles
  admin/page.tsx      Admin dashboard (Players, Teams, Settings, Overview tabs)
  auctioneer/page.tsx Auctioneer control panel
  team/page.tsx       Team bidding interface
  spectator/page.tsx  Spectator read-only view
components/
  PasscodeGate.tsx    Reusable passcode modal
  CountdownTimer.tsx  Visual countdown with color states
  StatusBadge.tsx     Player status pill (unsold/on_auction/sold)
lib/
  supabase.ts         Supabase client initialization
  session.ts          sessionStorage helpers (get/set/clear)
  useRealtime.ts      Hook: subscribe to Postgres changes on a table
  useAuctionState.ts  Hook: central auction state with all real-time subscriptions
  useCountdown.ts     Hook: countdown timer from an expiry timestamp
  budgetCalc.ts       Max bid & mandatory slot calculations
  formatPrice.ts      Indian number formatting (₹ with lakhs/crores)
  constants.ts        Player roles, statuses, session key
types/
  index.ts            TypeScript interfaces (Team, Player, Bid, AuctionState, etc.)
schema.sql            Full database schema + RPC functions
```

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Install dependencies

```bash
npm install
```

### 2. Run the database schema

Open the Supabase SQL Editor and run everything in `schema.sql`. This creates all tables, inserts default rows, disables RLS, and creates the RPC functions.

### 3. Enable Realtime

In Supabase Dashboard → Database → Replication, enable realtime for:
- `players`
- `bids`
- `auction_state`
- `teams`
- `auction_settings`

### 4. Configure environment

Create or update `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Add players via CSV (optional)

In the Admin dashboard → Players tab → CSV Import, paste lines in the format:

```
Virat Kohli,Batsman,20000000,India
Jasprit Bumrah,Bowler,20000000,India
Ben Stokes,All-rounder,20000000,England
```

---

## Deployment

### Vercel (recommended)

1. Push to a GitHub repository
2. Connect the repo to [Vercel](https://vercel.com)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

Or use the Vercel CLI:

```bash
npx vercel --prod
```

The app uses `export const dynamic = "force-dynamic"` in the root layout to ensure all pages are server-rendered on demand (no static prerendering issues with Supabase).
