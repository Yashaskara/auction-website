import type { AuctionSettings, Team } from "@/types";

export function calculateMaxBid(
  team: Team,
  squadCount: number,
  settings: AuctionSettings
): number {
  const remainingMandatory = Math.max(
    0,
    settings.min_players_per_team - squadCount - 1
  );
  return team.budget_remaining - remainingMandatory * settings.default_base_price;
}

export function getRemainingMandatorySlots(
  squadCount: number,
  settings: AuctionSettings
): number {
  return Math.max(0, settings.min_players_per_team - squadCount);
}
