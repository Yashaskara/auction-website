"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useAuctionState } from "@/lib/useAuctionState";
import { useCountdown } from "@/lib/useCountdown";
import { useRealtime } from "@/lib/useRealtime";
import { formatPrice } from "@/lib/formatPrice";
import { calculateMaxBid, getRemainingMandatorySlots } from "@/lib/budgetCalc";
import CountdownTimer from "@/components/CountdownTimer";
import type { Player, Team, SessionData } from "@/types";
import Image from "next/image";
import { LogOut, Plus, Minus, ChevronDown, ChevronUp, Trophy, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export default function TeamPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<SessionData | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [mySquad, setMySquad] = useState<Player[]>([]);
  const { auctionState, settings, currentPlayer, teams, isLoading } = useAuctionState();
  const { isExpired } = useCountdown(auctionState?.timer_expires_at);

  const [bidAmount, setBidAmount] = useState(0);
  const [bidding, setBidding] = useState(false);
  const [wasHighest, setWasHighest] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== "team" || !s.teamId) {
      router.push("/");
      return;
    }
    setSessionState(s);
  }, [router]);

  const fetchMyTeam = useCallback(async () => {
    if (!session?.teamId) return;
    const { data } = await supabase.from("teams").select("*").eq("id", session.teamId).single();
    if (data) setMyTeam(data);
  }, [session?.teamId]);

  const fetchMySquad = useCallback(async () => {
    if (!session?.teamId) return;
    const { data } = await supabase.from("players").select("*").eq("sold_to", session.teamId).order("sold_price", { ascending: false });
    if (data) setMySquad(data);
  }, [session?.teamId]);

  useEffect(() => {
    fetchMyTeam();
    fetchMySquad();
  }, [fetchMyTeam, fetchMySquad]);

  useRealtime("teams", fetchMyTeam);
  useRealtime("players", fetchMySquad);

  // Calculate max bid
  const maxBid = useMemo(() => {
    if (!myTeam || !settings) return 0;
    return calculateMaxBid(myTeam, mySquad.length, settings);
  }, [myTeam, mySquad.length, settings]);

  const remainingMandatorySlots = useMemo(() => {
    if (!settings) return 0;
    return getRemainingMandatorySlots(mySquad.length, settings);
  }, [mySquad.length, settings]);

  // Min next bid
  const minNextBid = useMemo(() => {
    if (!auctionState || !settings) return 0;
    return auctionState.current_highest_bid + settings.bid_increment;
  }, [auctionState, settings]);

  // Set default bid amount when player/bid changes
  useEffect(() => {
    if (minNextBid > 0) {
      setBidAmount(minNextBid);
    }
  }, [minNextBid]);

  // Track if we were outbid
  useEffect(() => {
    if (session?.teamId && auctionState?.current_highest_team_id) {
      if (auctionState.current_highest_team_id === session.teamId) {
        setWasHighest(true);
      } else if (wasHighest) {
        toast.error("You've been outbid!", { duration: 3000 });
      }
    }
  }, [auctionState?.current_highest_team_id, session?.teamId, wasHighest]);

  // Reset wasHighest on new player
  useEffect(() => {
    setWasHighest(false);
  }, [currentPlayer?.id]);

  const isMyBidHighest = auctionState?.current_highest_team_id === session?.teamId;
  const isLive = auctionState?.status === "live";
  const hasPlayerOnBlock = !!auctionState?.current_player_id;
  const squadFull = settings ? mySquad.length >= settings.max_players_per_team : false;
  const cantAfford = maxBid < minNextBid;

  const getBidDisabledReason = (): string | null => {
    if (!isLive) return "Auction is not live";
    if (!hasPlayerOnBlock) return "No player on the block";
    if (isExpired) return "Timer has expired";
    if (isMyBidHighest) return "You're already the highest bidder";
    if (squadFull) return `Squad full (${mySquad.length}/${settings?.max_players_per_team})`;
    if (cantAfford) return `Cannot afford — need to reserve ${formatPrice(remainingMandatorySlots * (settings?.default_base_price ?? 0))} for ${remainingMandatorySlots} slots`;
    if (bidAmount > maxBid) return `Exceeds max bid of ${formatPrice(maxBid)}`;
    if (bidAmount < minNextBid) return `Minimum bid is ${formatPrice(minNextBid)}`;
    return null;
  };

  const disabledReason = getBidDisabledReason();

  const handlePlaceBid = async () => {
    if (!auctionState?.current_player_id || !session?.teamId || disabledReason) return;
    setBidding(true);

    const { data, error } = await supabase.rpc("place_bid", {
      p_player_id: auctionState.current_player_id,
      p_team_id: session.teamId,
      p_amount: bidAmount,
    });

    if (error) {
      toast.error(error.message);
    } else if (data?.error) {
      toast.error(data.error);
    } else {
      toast.success(`Bid of ${formatPrice(bidAmount)} placed!`);
    }

    setBidding(false);
  };

  const adjustBid = (direction: 1 | -1) => {
    const increment = settings?.bid_increment ?? 10000;
    const newAmount = bidAmount + direction * increment;
    if (newAmount >= minNextBid && newAmount <= maxBid) {
      setBidAmount(newAmount);
    }
  };

  const highestTeam = teams.find((t) => t.id === auctionState?.current_highest_team_id);
  const totalSpent = myTeam ? myTeam.budget - myTeam.budget_remaining : 0;
  const budgetPct = myTeam ? (totalSpent / myTeam.budget) * 100 : 0;

  if (isLoading || !session) {
    return <div className="min-h-screen flex items-center justify-center"><div className="skeleton w-96 h-64 rounded-2xl" /></div>;
  }

  return (
    <div className="min-h-screen relative z-10">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-primary/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-3xl text-gold tracking-wider">STRIKE</h1>
            <div className="flex items-center gap-2">
              {myTeam && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myTeam.primary_color }} />}
              <span className="text-sm">{session.teamName}</span>
            </div>
          </div>
          <button onClick={() => { clearSession(); router.push("/"); }} className="flex items-center gap-2 text-txt-secondary hover:text-txt-primary transition-colors text-sm">
            <LogOut size={16} /> Exit
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Auction Hero */}
        {currentPlayer ? (
          <div className="bg-surface-card border border-border rounded-2xl p-6 animate-slide-up">
            {/* Bid Status Banner */}
            {isMyBidHighest ? (
              <div className="mb-4 px-4 py-3 rounded-xl bg-accent-green/10 border border-accent-green/30 text-accent-green flex items-center gap-2">
                <Trophy size={18} />
                <span className="font-display tracking-wider text-lg">YOU&apos;RE THE HIGHEST BIDDER</span>
              </div>
            ) : wasHighest && auctionState?.current_highest_team_id ? (
              <div className="mb-4 px-4 py-3 rounded-xl bg-accent-red/10 border border-accent-red/30 text-accent-red flex items-center gap-2 animate-timer-pulse">
                <AlertTriangle size={18} />
                <span className="font-display tracking-wider text-lg">YOU&apos;VE BEEN OUTBID</span>
              </div>
            ) : null}

            {/* Player Info */}
            <div className="flex items-start gap-4 mb-6">
              {currentPlayer.photo_url && (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border shrink-0">
                  <Image src={currentPlayer.photo_url} alt={currentPlayer.name} fill className="object-cover" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="font-display text-4xl tracking-wider">{currentPlayer.name}</h2>
                <div className="flex items-center gap-3 text-txt-secondary text-sm mt-1">
                  <span className="px-2 py-0.5 bg-surface-secondary rounded-full">{currentPlayer.role}</span>
                  {currentPlayer.country && <span>{currentPlayer.country}</span>}
                  <span className="font-mono">Base: {formatPrice(currentPlayer.base_price)}</span>
                </div>
              </div>
              {settings?.timer_enabled && (
                <CountdownTimer timerExpiresAt={auctionState?.timer_expires_at} size="sm" />
              )}
            </div>

            {/* Current Bid */}
            <div className="flex items-center justify-between mb-6 px-4 py-3 bg-surface-secondary rounded-xl">
              <div>
                <p className="text-xs text-txt-secondary uppercase tracking-wider">Highest Bid</p>
                <p className="font-mono text-3xl text-gold" key={auctionState?.current_highest_bid}>
                  {formatPrice(auctionState?.current_highest_bid ?? 0)}
                </p>
                {highestTeam && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: highestTeam.primary_color }} />
                    <span className="text-sm text-txt-secondary">{highestTeam.name}</span>
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-txt-secondary">
                <p>Max bid: <span className="font-mono text-gold">{formatPrice(Math.max(0, maxBid))}</span></p>
                {remainingMandatorySlots > 0 && (
                  <p className="mt-1">Reserving for {remainingMandatorySlots} mandatory slot{remainingMandatorySlots > 1 ? "s" : ""}</p>
                )}
              </div>
            </div>

            {/* Bid Input */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjustBid(-1)}
                disabled={bidAmount <= minNextBid}
                className="p-3 bg-surface-secondary border border-border rounded-xl hover:border-txt-secondary transition-colors disabled:opacity-30"
              >
                <Minus size={20} />
              </button>

              <div className="flex-1 relative">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(Number(e.target.value))}
                  min={minNextBid}
                  max={maxBid}
                  step={settings?.bid_increment ?? 10000}
                  className="w-full px-4 py-4 bg-surface-secondary border border-border rounded-xl text-center font-mono text-2xl text-gold focus:outline-none focus:border-gold"
                />
                <p className="text-center text-xs text-txt-secondary mt-1">
                  {formatPrice(bidAmount)}
                </p>
              </div>

              <button
                onClick={() => adjustBid(1)}
                disabled={bidAmount + (settings?.bid_increment ?? 10000) > maxBid}
                className="p-3 bg-surface-secondary border border-border rounded-xl hover:border-txt-secondary transition-colors disabled:opacity-30"
              >
                <Plus size={20} />
              </button>
            </div>

            <button
              onClick={handlePlaceBid}
              disabled={!!disabledReason || bidding}
              className={clsx(
                "w-full mt-4 py-4 font-display text-2xl tracking-wider rounded-xl transition-all",
                disabledReason
                  ? "bg-surface-secondary text-txt-secondary border border-border cursor-not-allowed"
                  : "bg-gold hover:bg-gold-dim text-surface-primary"
              )}
            >
              {bidding ? "PLACING BID..." : disabledReason ?? "PLACE BID"}
            </button>

            {isExpired && (
              <p className="text-center text-accent-red text-sm mt-2 font-display tracking-wider">
                TIME&apos;S UP — WAITING FOR AUCTIONEER
              </p>
            )}
          </div>
        ) : (
          <div className="bg-surface-card border border-border rounded-2xl p-12 text-center">
            <p className="text-txt-secondary font-display text-2xl tracking-wider">
              {auctionState?.status === "setup"
                ? "WAITING FOR AUCTION TO START"
                : auctionState?.status === "paused"
                  ? "AUCTION PAUSED"
                  : auctionState?.status === "completed"
                    ? "AUCTION COMPLETE"
                    : "WAITING FOR NEXT PLAYER"}
            </p>
            {auctionState?.current_round && auctionState.current_round > 1 && (
              <p className="text-gold text-sm mt-2">Round {auctionState.current_round}</p>
            )}
          </div>
        )}

        {/* My Squad */}
        {myTeam && (
          <div className="bg-surface-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl tracking-wider">YOUR SQUAD</h3>
              <span className="text-sm text-txt-secondary">
                {mySquad.length}{settings ? `/${settings.max_players_per_team}` : ""} players
              </span>
            </div>

            {/* Budget Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-mono text-2xl text-gold">{formatPrice(myTeam.budget_remaining)}</span>
                <span className="text-txt-secondary self-end">of {formatPrice(myTeam.budget)}</span>
              </div>
              <div className="h-3 bg-surface-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${100 - budgetPct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-txt-secondary mt-1">
                <span>Spent: {formatPrice(totalSpent)}</span>
                <span>{Math.round(100 - budgetPct)}% remaining</span>
              </div>
            </div>

            {/* Squad table */}
            {mySquad.length > 0 ? (
              <div className="space-y-2">
                {mySquad.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-surface-secondary/50 rounded-lg">
                    <div>
                      <span className="font-medium text-sm">{p.name}</span>
                      <span className="text-xs text-txt-secondary ml-2">{p.role}</span>
                    </div>
                    <span className="font-mono text-gold text-sm">{formatPrice(p.sold_price ?? 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-txt-secondary text-sm text-center py-4">No players yet</p>
            )}
          </div>
        )}

        {/* All Teams Overview */}
        <div className="bg-surface-card border border-border rounded-2xl p-6">
          <h3 className="font-display text-xl tracking-wider mb-4">ALL TEAMS</h3>
          <div className="space-y-2">
            {teams.map((team) => (
              <TeamAccordion key={team.id} team={team} isMyTeam={team.id === session?.teamId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamAccordion({ team, isMyTeam }: { team: Team; isMyTeam: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [squad, setSquad] = useState<Player[]>([]);

  useEffect(() => {
    if (expanded) {
      supabase.from("players").select("*").eq("sold_to", team.id).then(({ data }) => {
        if (data) setSquad(data);
      });
    }
  }, [expanded, team.id]);

  return (
    <div className={clsx("border rounded-xl overflow-hidden", isMyTeam ? "border-gold/50" : "border-border/50")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.primary_color }} />
        <span className="text-sm font-medium flex-1 text-left">{team.name}</span>
        <span className="text-xs text-txt-secondary font-mono">{formatPrice(team.budget_remaining)}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1 border-t border-border/30">
          {squad.length > 0 ? squad.map((p) => (
            <div key={p.id} className="flex justify-between text-xs py-1">
              <span className="text-txt-secondary">{p.name}</span>
              <span className="font-mono text-gold">{formatPrice(p.sold_price ?? 0)}</span>
            </div>
          )) : (
            <p className="text-xs text-txt-secondary py-2">No players yet</p>
          )}
        </div>
      )}
    </div>
  );
}
