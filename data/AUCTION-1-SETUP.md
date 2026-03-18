# Auction 1 — Setup Guide

Use this with the admin panel **before** importing players.

## 1. Auction settings (Admin → Settings)

Set these values and save:

| Setting | Value |
|--------|--------|
| **Bid increment (min bid)** | 100 |
| **Default team budget** | 1500 |
| **Max players per team** | 8 (7 members + captain) |
| **Min players per team** | 8 |
| **Default base price** | 100 |

## 2. Teams (Admin → Teams)

Create these three teams. Budget is set per team when creating (use **1500** for each).

| Team name | Budget | Captain (optional, set in team edit) |
|-----------|--------|--------------------------------------|
| Team Pramod | 1500 | _(already selected, no budget)_ |
| Team Hriday | 1500 | _(already selected, no budget)_ |
| Team PV | 1500 | _(already selected, no budget)_ |

## 3. Players (Admin → Players → CSV Import)

- Open **CSV Import**.
- Paste the contents of `auction-1-players.csv` (or upload/paste from that file).
- Format is: **Name, Role, Base Price, Country** (one player per line). All players use base price 100; roles can be edited later if needed.
- Click **Import**.

## 4. Optional

- **Shuffle** the player queue (Admin → Players → Shuffle) to randomize order.
- Set **captain name** on each team in Admin → Teams if you want it displayed.

After that, you can start the auction from the auctioneer view.
