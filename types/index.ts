export interface Team {
  id: string;
  name: string;
  primary_color: string;
  budget: number;
  budget_remaining: number;
  captain_name: string | null;
  passcode: string;
  created_at?: string;
}

export interface Player {
  id: string;
  name: string;
  role: "Batsman" | "Bowler" | "All-rounder" | "Wicket-keeper";
  base_price: number;
  photo_url?: string | null;
  country?: string | null;
  batting_style?: string | null;
  bowling_style?: string | null;
  status: "unsold" | "on_auction" | "sold";
  sold_to?: string | null;
  sold_price?: number | null;
  queue_order?: number | null;
  created_at?: string;
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
  current_player_id?: string | null;
  status: "setup" | "live" | "paused" | "completed";
  current_highest_bid: number;
  current_highest_team_id?: string | null;
  timer_expires_at?: string | null;
  current_round: number;
  last_updated: string;
}

export interface AuctionSettings {
  id: number;
  bid_increment: number;
  max_players_per_team: number;
  min_players_per_team: number;
  timer_enabled: boolean;
  timer_duration_seconds: number;
  default_team_budget: number;
  default_base_price: number;
}

export type UserRole = "admin" | "auctioneer" | "team" | "spectator";

export interface SessionData {
  role: UserRole;
  teamId?: string;
  teamName?: string;
}
