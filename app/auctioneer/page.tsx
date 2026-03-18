"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useAuctionState } from "@/lib/useAuctionState";
import { useCountdown } from "@/lib/useCountdown";
import { formatPrice } from "@/lib/formatPrice";
import { calculateMaxBid } from "@/lib/budgetCalc";
import CountdownTimer from "@/components/CountdownTimer";
import StatusBadge from "@/components/StatusBadge";
import type { Player, Team } from "@/types";
import Image from "next/image";
import {
  LogOut, SkipForward, Gavel, XCircle, Undo2, RotateCcw,
  ChevronDown, ChevronUp, Users, List,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export default function AuctioneerPage() {
  const router = useRouter();
  const { auctionState, settings, currentPlayer, bids, teams, isLoading, refetch } = useAuctionState();
  const { isExpired } = useCountdown(auctionState?.timer_expires_at);
  const [lastSoldPlayer, setLastSoldPlayer] = useState<{ playerId: string; teamId: string; amount: number } | null>(null);
  const [showSoldStamp, setShowSoldStamp] = useState(false);
  const [autoCloseTriggered, setAutoCloseTriggered] = useState(false);
  const [unsoldPlayers, setUnsoldPlayers] = useState<Player[]>([]);
  
  const prevPlayerRef = useRef<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== "auctioneer") {
      router.push("/");
    }
  }, [router]);

  // Track unsold players list
  useEffect(() => {
    const fetchUnsoldPlayers = async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("status", "unsold")
        .order("queue_order", { ascending: true, nullsFirst: false });
      if (data) setUnsoldPlayers(data);
    };
    fetchUnsoldPlayers();
  }, [auctionState, bids]);

  const unsoldCount = unsoldPlayers.length;

  // Reset sold stamp when player changes
  useEffect(() => {
    if (currentPlayer?.id !== prevPlayerRef.current) {
      setShowSoldStamp(false);
      setAutoCloseTriggered(false);
      prevPlayerRef.current = currentPlayer?.id ?? null;
    }
  }, [currentPlayer?.id]);

  // Store sell handler in ref to avoid stale closures in useEffect
  const sellRef = useRef<() => Promise<void>>();
  
  // Auto-close on timer expiry
  useEffect(() => {
    if (isExpired && !autoCloseTriggered && auctionState?.current_player_id && settings?.timer_enabled) {
      setAutoCloseTriggered(true);
      if (auctionState.current_highest_team_id) {
        toast.info("Timer expired — confirming sale...", { duration: 3000 });
        const timer = setTimeout(() => { sellRef.current?.(); }, 3000);
        return () => clearTimeout(timer);
      } else {
        toast.info("Timer expired — no bids placed");
      }
    }
  }, [isExpired, autoCloseTriggered, auctionState?.current_player_id, auctionState?.current_highest_team_id, settings?.timer_enabled]);

  const handleNextPlayer = async () => {
    const { data: nextPlayer } = await supabase
      .from("players")
      .select("*")
      .eq("status", "unsold")
      .order("queue_order", { ascending: true })
      .limit(1)
      .single();

    if (!nextPlayer) {
      toast.error("No more unsold players");
      return;
    }

    await supabase.from("players").update({ status: "on_auction" }).eq("id", nextPlayer.id);

    const timerExpires = settings?.timer_enabled
      ? new Date(Date.now() + (settings.timer_duration_seconds * 1000)).toISOString()
      : null;

    await supabase.from("auction_state").update({
      current_player_id: nextPlayer.id,
      current_highest_bid: nextPlayer.base_price,
      current_highest_team_id: null,
      timer_expires_at: timerExpires,
      last_updated: new Date().toISOString(),
    }).eq("id", 1);

    setLastSoldPlayer(null);
    setShowSoldStamp(false);
    setAutoCloseTriggered(false);
    toast.success(`${nextPlayer.name} is on the block!`);
  };

  const handleSell = async () => {
    if (!auctionState?.current_player_id || !auctionState.current_highest_team_id) {
      toast.error("No valid bid to close");
      return;
    }

    const team = teams.find((t) => t.id === auctionState.current_highest_team_id);
    if (!team) return;

    await supabase.from("players").update({
      status: "sold",
      sold_to: auctionState.current_highest_team_id,
      sold_price: auctionState.current_highest_bid,
    }).eq("id", auctionState.current_player_id);

    await supabase.from("teams").update({
      budget_remaining: team.budget_remaining - auctionState.current_highest_bid,
    }).eq("id", team.id);

    setLastSoldPlayer({
      playerId: auctionState.current_player_id,
      teamId: auctionState.current_highest_team_id,
      amount: auctionState.current_highest_bid,
    });
    setShowSoldStamp(true);

    await supabase.from("auction_state").update({
      current_player_id: null,
      current_highest_bid: 0,
      current_highest_team_id: null,
      timer_expires_at: null,
      last_updated: new Date().toISOString(),
    }).eq("id", 1);

    toast.success(`SOLD to ${team.name} for ${formatPrice(auctionState.current_highest_bid)}!`);
  };

  sellRef.current = handleSell;

  const handleMarkUnsold = async () => {
    if (!auctionState?.current_player_id) return;

    const maxOrder = Math.max(0, ...teams.map(() => 0), ...(await supabase.from("players").select("queue_order").eq("status", "unsold").then(r => r.data?.map(p => p.queue_order ?? 0) ?? [0])));

    await supabase.from("players").update({
      status: "unsold",
      queue_order: maxOrder + 1,
    }).eq("id", auctionState.current_player_id);

    await supabase.from("auction_state").update({
      current_player_id: null,
      current_highest_bid: 0,
      current_highest_team_id: null,
      timer_expires_at: null,
      last_updated: new Date().toISOString(),
    }).eq("id", 1);

    toast.info("Player marked as unsold");
  };

  const handleUndo = async () => {
    if (!lastSoldPlayer) return;
    if (!confirm("Undo last allocation?")) return;

    await supabase.from("players").update({
      status: "unsold",
      sold_to: null,
      sold_price: null,
    }).eq("id", lastSoldPlayer.playerId);

    const team = teams.find((t) => t.id === lastSoldPlayer.teamId);
    if (team) {
      await supabase.from("teams").update({
        budget_remaining: team.budget_remaining + lastSoldPlayer.amount,
      }).eq("id", team.id);
    }

    setLastSoldPlayer(null);
    setShowSoldStamp(false);
    toast.success("Last allocation undone");
  };

  const handleStartUnsoldRound = async () => {
    if (!confirm(`Re-introduce ${unsoldCount} unsold players for Round ${(auctionState?.current_round ?? 1) + 1}?`)) return;

    const { data, error } = await supabase.rpc("start_unsold_round");
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to start unsold round");
      return;
    }
    toast.success(`Unsold Round ${data.round} started with ${data.players_queued} players`);
    refetch();
  };

  const isLive = auctionState?.status === "live";
  const hasPlayerOnBlock = !!auctionState?.current_player_id;
  const highestTeam = teams.find((t) => t.id === auctionState?.current_highest_team_id);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="skeleton w-96 h-64 rounded-2xl" /></div>;
  }

  return (
    <div className="min-h-screen relative z-10">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-primary/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-3xl text-gold tracking-wider">STRIKE</h1>
            <span className="text-txt-secondary text-sm">/ AUCTIONEER</span>
            <span className={clsx(
              "px-3 py-1 rounded-full text-xs font-semibold",
              auctionState?.status === "live" ? "bg-accent-green/20 text-accent-green" :
              auctionState?.status === "paused" ? "bg-yellow-500/20 text-yellow-400" :
              "bg-txt-secondary/20 text-txt-secondary"
            )}>
              {auctionState?.status?.toUpperCase()}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gold/20 text-gold">
              Round {auctionState?.current_round ?? 1}
            </span>
          </div>
          <button onClick={() => { clearSession(); router.push("/"); }} className="flex items-center gap-2 text-txt-secondary hover:text-txt-primary transition-colors text-sm">
            <LogOut size={16} /> Exit
          </button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 py-6 flex gap-6">
        {/* Left Panel */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Auction Hero */}
          {currentPlayer ? (
            <div className="relative bg-surface-card border border-border rounded-2xl p-8 animate-slide-up">
              {showSoldStamp && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="animate-stamp font-display text-7xl text-accent-green border-4 border-accent-green px-8 py-2 rotate-[-15deg] opacity-80">
                    SOLD
                  </div>
                </div>
              )}

              <div className="flex items-start gap-6">
                {currentPlayer.photo_url && (
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-border shrink-0">
                    <Image src={currentPlayer.photo_url} alt={currentPlayer.name} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-display text-5xl tracking-wider">{currentPlayer.name}</h2>
                    <StatusBadge status={currentPlayer.status} size="md" />
                  </div>
                  <div className="flex items-center gap-4 text-txt-secondary text-sm">
                    <span className="px-3 py-1 bg-surface-secondary rounded-full">{currentPlayer.role}</span>
                    {currentPlayer.country && <span>{currentPlayer.country}</span>}
                    <span className="font-mono">Base: {formatPrice(currentPlayer.base_price)}</span>
                  </div>
                </div>
              </div>

              {/* Current Bid */}
              <div className="mt-8 flex items-center justify-between">
                <div>
                  <p className="text-txt-secondary text-sm uppercase tracking-wider mb-1">Current Highest Bid</p>
                  <p className="font-mono text-5xl text-gold animate-bid-pulse" key={auctionState?.current_highest_bid}>
                    {formatPrice(auctionState?.current_highest_bid ?? 0)}
                  </p>
                  {highestTeam ? (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: highestTeam.primary_color }} />
                      <span className="font-medium">{highestTeam.name}</span>
                    </div>
                  ) : (
                    <p className="text-txt-secondary text-sm mt-2">Starting bid (no team yet)</p>
                  )}
                </div>

                {settings?.timer_enabled && (
                  <CountdownTimer timerExpiresAt={auctionState?.timer_expires_at} />
                )}
              </div>
            </div>
          ) : (
            <div className="bg-surface-card border border-border rounded-2xl p-12 text-center">
              {showSoldStamp && lastSoldPlayer ? (
                <div className="animate-stamp font-display text-6xl text-accent-green border-4 border-accent-green inline-block px-8 py-2 rotate-[-15deg] mb-4">
                  SOLD
                </div>
              ) : (
                <div className="text-txt-secondary">
                  <Gavel size={48} className="mx-auto mb-4 opacity-30" />
                  <p className="font-display text-2xl tracking-wider">
                    {auctionState?.status === "setup" ? "AUCTION NOT STARTED" :
                     auctionState?.status === "completed" ? "AUCTION COMPLETE" :
                     "SELECT NEXT PLAYER"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleNextPlayer}
              disabled={!isLive || hasPlayerOnBlock}
              className="flex items-center gap-2 px-6 py-3 bg-gold hover:bg-gold-dim text-surface-primary font-display tracking-wider rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipForward size={18} /> NEXT PLAYER
            </button>
            <button
              onClick={handleSell}
              disabled={!hasPlayerOnBlock || !auctionState?.current_highest_team_id}
              className="flex items-center gap-2 px-6 py-3 bg-accent-green hover:bg-accent-green/80 text-white font-display tracking-wider rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Gavel size={18} /> SELL
            </button>
            <button
              onClick={handleMarkUnsold}
              disabled={!hasPlayerOnBlock || !!auctionState?.current_highest_team_id}
              title={auctionState?.current_highest_team_id ? "Cannot mark unsold — a bid has been placed" : undefined}
              className="flex items-center gap-2 px-6 py-3 border border-border hover:border-accent-red text-txt-secondary hover:text-accent-red font-display tracking-wider rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <XCircle size={18} /> UNSOLD
            </button>
            {lastSoldPlayer && (
              <button
                onClick={handleUndo}
                className="flex items-center gap-2 px-6 py-3 border border-border hover:border-yellow-500 text-txt-secondary hover:text-yellow-400 font-display tracking-wider rounded-lg transition-colors"
              >
                <Undo2 size={18} /> UNDO
              </button>
            )}
            {!hasPlayerOnBlock && unsoldCount > 0 && isLive && (
              <button
                onClick={handleStartUnsoldRound}
                className="flex items-center gap-2 px-6 py-3 border border-gold/50 text-gold hover:bg-gold/10 font-display tracking-wider rounded-lg transition-colors"
              >
                <RotateCcw size={18} /> UNSOLD ROUND ({unsoldCount})
              </button>
            )}
          </div>

          {/* Bid History */}
          {hasPlayerOnBlock && bids.length > 0 && (
            <div className="bg-surface-card border border-border rounded-xl p-4">
              <h3 className="font-display text-lg tracking-wider mb-3">BID HISTORY</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {bids.map((bid) => {
                  const bidTeam = teams.find((t) => t.id === bid.team_id);
                  return (
                    <div key={bid.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-secondary/50">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bidTeam?.primary_color ?? "#666" }} />
                        <span className="text-sm">{bidTeam?.name ?? "Unknown"}</span>
                      </div>
                      <span className="font-mono text-gold text-sm">{formatPrice(bid.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Remaining Players Queue */}
          <RemainingPlayersPanel players={unsoldPlayers} />
        </div>

        {/* Right Sidebar — Teams */}
        <div className="w-80 shrink-0">
          <h3 className="font-display text-lg tracking-wider mb-4 flex items-center gap-2">
            <Users size={18} /> ALL TEAMS
          </h3>
          <div className="space-y-3">
            {teams.map((team) => (
              <TeamSidebarCard
                key={team.id}
                team={team}
                settings={settings}
                isHighest={team.id === auctionState?.current_highest_team_id}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamSidebarCard({
  team, settings, isHighest,
}: {
  team: Team;
  settings: import("@/types").AuctionSettings | null;
  isHighest: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [squad, setSquad] = useState<Player[]>([]);

  useEffect(() => {
    supabase
      .from("players")
      .select("*")
      .eq("sold_to", team.id)
      .then(({ data }) => {
        if (data) setSquad(data);
      });
  }, [team.id, team.budget_remaining]);

  const maxBid = settings ? calculateMaxBid(team, squad.length, settings) : team.budget_remaining;
  const isSquadFull = settings ? squad.length >= settings.max_players_per_team : false;

  return (
    <div className={clsx(
      "bg-surface-card border rounded-xl overflow-hidden transition-all",
      isHighest ? "border-gold animate-gold-glow" : "border-border",
      isSquadFull && "opacity-50"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center gap-3 text-left"
      >
        <div className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: team.primary_color }} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{team.name}</p>
          <div className="flex items-center gap-3 text-xs text-txt-secondary">
            <span className="font-mono">{formatPrice(team.budget_remaining)}</span>
            <span>{squad.length}{settings ? `/${settings.max_players_per_team}` : ""}</span>
          </div>
          <p className="text-[10px] text-txt-secondary font-mono mt-0.5">
            Max bid: {formatPrice(Math.max(0, maxBid))}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && squad.length > 0 && (
        <div className="px-3 pb-3 space-y-1 border-t border-border/50 pt-2">
          {squad.map((p) => (
            <div key={p.id} className="flex justify-between text-xs">
              <span className="text-txt-secondary truncate">{p.name}</span>
              <span className="font-mono text-gold shrink-0 ml-2">{formatPrice(p.sold_price ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemainingPlayersPanel({ players }: { players: Player[] }) {
  const [expanded, setExpanded] = useState(false);

  if (players.length === 0) return null;

  const byRole = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <List size={16} className="text-txt-secondary" />
          <h3 className="font-display text-lg tracking-wider">REMAINING PLAYERS</h3>
          <span className="ml-1 px-2.5 py-0.5 bg-gold/20 text-gold text-xs font-semibold rounded-full">
            {players.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-[10px] text-txt-secondary">
            {Object.entries(byRole).map(([role, count]) => (
              <span key={role} className="px-2 py-0.5 bg-surface-secondary rounded-full">
                {role}: {count}
              </span>
            ))}
          </div>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          <div className="max-h-64 overflow-y-auto space-y-1 pt-2">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-secondary/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-txt-secondary font-mono w-5 shrink-0">{i + 1}</span>
                  <span className="text-sm truncate">{p.name}</span>
                  <span className="text-[10px] text-txt-secondary px-1.5 py-0.5 bg-surface-secondary rounded-full shrink-0">{p.role}</span>
                </div>
                <span className="font-mono text-xs text-gold shrink-0 ml-2">{formatPrice(p.base_price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
