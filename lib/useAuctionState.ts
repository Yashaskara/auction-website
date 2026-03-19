"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import type { AuctionState, AuctionSettings, Player, Bid, Team } from "@/types";

const POLL_INTERVAL_MS = 2000;

interface UseAuctionStateReturn {
  auctionState: AuctionState | null;
  settings: AuctionSettings | null;
  currentPlayer: Player | null;
  bids: Bid[];
  teams: Team[];
  isLoading: boolean;
  refetch: () => void;
}

export function useAuctionState(): UseAuctionStateReturn {
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const pollingRef = useRef(false);

  const pollAll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;

    try {
      const [stateRes, settingsRes, teamsRes] = await Promise.all([
        supabase.from("auction_state").select("*").eq("id", 1).single(),
        supabase.from("auction_settings").select("*").eq("id", 1).single(),
        supabase.from("teams").select("*").order("budget_remaining", { ascending: false }),
      ]);

      if (stateRes.data) setAuctionState(stateRes.data);
      if (settingsRes.data) setSettings(settingsRes.data);
      if (teamsRes.data) setTeams(teamsRes.data);

      const playerId = stateRes.data?.current_player_id;
      if (playerId) {
        const [playerRes, bidsRes] = await Promise.all([
          supabase.from("players").select("*").eq("id", playerId).single(),
          supabase.from("bids").select("*, team:teams(*)").eq("player_id", playerId).order("created_at", { ascending: false }),
        ]);
        if (playerRes.data) setCurrentPlayer(playerRes.data);
        if (bidsRes.data) setBids(bidsRes.data);
      } else {
        setCurrentPlayer(null);
        setBids([]);
      }
    } finally {
      pollingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await pollAll();
      setIsLoading(false);
    };
    init();
  }, [pollAll]);

  // Poll every 2 seconds unconditionally
  useEffect(() => {
    const interval = setInterval(pollAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollAll]);

  return {
    auctionState,
    settings,
    currentPlayer,
    bids,
    teams,
    isLoading,
    refetch: pollAll,
  };
}
