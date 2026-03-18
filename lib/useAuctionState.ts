"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { useRealtime } from "./useRealtime";
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

  const lastUpdatedRef = useRef<string | null>(null);

  const fetchAuctionState = useCallback(async () => {
    const { data } = await supabase
      .from("auction_state")
      .select("*")
      .eq("id", 1)
      .single();
    if (data) setAuctionState(data);
    return data;
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from("auction_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (data) setSettings(data);
  }, []);

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase
      .from("teams")
      .select("*")
      .order("budget_remaining", { ascending: false });
    if (data) setTeams(data);
  }, []);

  const fetchCurrentPlayer = useCallback(async (playerId: string | null | undefined) => {
    if (!playerId) {
      setCurrentPlayer(null);
      setBids([]);
      return;
    }
    const { data: player } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (player) setCurrentPlayer(player);

    const { data: bidData } = await supabase
      .from("bids")
      .select("*, team:teams(*)")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });
    if (bidData) setBids(bidData);
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const [stateData] = await Promise.all([
      fetchAuctionState(),
      fetchSettings(),
      fetchTeams(),
    ]);
    if (stateData) {
      await fetchCurrentPlayer(stateData.current_player_id);
    }
    setIsLoading(false);
  }, [fetchAuctionState, fetchSettings, fetchTeams, fetchCurrentPlayer]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Polling fallback: check auction_state every 2s, only do full refetch when last_updated changes
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("auction_state")
        .select("last_updated")
        .eq("id", 1)
        .single();
      if (data && data.last_updated !== lastUpdatedRef.current) {
        lastUpdatedRef.current = data.last_updated;
        const state = await fetchAuctionState();
        await fetchTeams();
        if (state) {
          await fetchCurrentPlayer(state.current_player_id);
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAuctionState, fetchTeams, fetchCurrentPlayer]);

  const handleAuctionChange = useCallback(async () => {
    const state = await fetchAuctionState();
    if (state) {
      lastUpdatedRef.current = state.last_updated;
      await fetchCurrentPlayer(state.current_player_id);
    }
  }, [fetchAuctionState, fetchCurrentPlayer]);

  const handleBidsChange = useCallback(async () => {
    if (auctionState?.current_player_id) {
      const { data } = await supabase
        .from("bids")
        .select("*, team:teams(*)")
        .eq("player_id", auctionState.current_player_id)
        .order("created_at", { ascending: false });
      if (data) setBids(data);
    }
    await fetchAuctionState();
  }, [auctionState?.current_player_id, fetchAuctionState]);

  useRealtime("auction_state", handleAuctionChange);
  useRealtime("bids", handleBidsChange);
  useRealtime("teams", fetchTeams);
  useRealtime("players", () => {
    if (auctionState?.current_player_id) {
      fetchCurrentPlayer(auctionState.current_player_id);
    }
  });
  useRealtime("auction_settings", fetchSettings);

  return {
    auctionState,
    settings,
    currentPlayer,
    bids,
    teams,
    isLoading,
    refetch,
  };
}
