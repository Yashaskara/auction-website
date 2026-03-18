# STRIKE — Cricket Auction Platform

Real-time multiplayer IPL-style cricket auction web app built with Next.js 14, Supabase, and Tailwind CSS.

## Features

- **4 concurrent roles**: Admin, Auctioneer, Team, Spectator — all with live real-time updates
- **IPL auction format**: Players arrive with base prices, teams bid in configurable increments
- **Budget reservation**: Max bid cap ensures teams can fill mandatory squad slots at base price
- **Countdown timer**: Configurable per-bid timer that resets on each new bid
- **Unsold rounds**: Re-introduce all unsold players for additional bidding rounds
- **Admin dashboard**: Manage players, teams, auction settings, and passcodes
- **Live spectator view**: Read-only dashboard with bid ticker, teams grid, and full player registry

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database + Real-time**: Supabase (Postgres + Supabase Realtime)
- **Auth**: Passcode-based (admin, auctioneer, team)
- **Styling**: Tailwind CSS
- **Fonts**: Bebas Neue (display), DM Sans (body), JetBrains Mono (prices)

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Create Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.

### 3. Run the database schema

Open the Supabase SQL Editor and run everything in `schema.sql`.

### 4. Enable Realtime

In Supabase Dashboard → Database → Replication, enable realtime for:
`players`, `bids`, `auction_state`, `teams`, `auction_settings`

### 5. Configure environment

Copy `.env.local` and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Default Passcodes

| Role       | Passcode     |
|------------|--------------|
| Admin      | `admin123`   |
| Auctioneer | `auction123` |

Team passcodes are set when creating teams in the admin dashboard.

## Auction Flow

1. **Admin** adds players and teams, configures settings (bid increment, timer, squad limits)
2. **Admin** clicks "Lock & Start Auction"
3. **Auctioneer** clicks "Next Player" to put players on the block
4. **Teams** place bids (validated against budget, max bid cap, squad limits)
5. **Auctioneer** sells to highest bidder or marks unsold
6. When all players are processed, auctioneer can "Start Unsold Round" to re-introduce unsold players
7. Repeat until all players are sold or auction is marked complete

## Deploy to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables
4. Deploy
