"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuctionState } from "@/lib/useAuctionState";
import { useRealtime } from "@/lib/useRealtime";
import { formatPrice } from "@/lib/formatPrice";
import CountdownTimer from "@/components/CountdownTimer";
import StatusBadge from "@/components/StatusBadge";
import type { Player, Team } from "@/types";
import Image from "next/image";
import { Gavel, Search, ArrowUpDown } from "lucide-react";
import clsx from "clsx";

export default function SpectatorPage() {
  const { auctionState, settings, currentPlayer, bids, teams, isLoading } = useAuctionState();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [teamSquads, setTeamSquads] = useState<Map<string, Player[]>>(new Map());

  const fetchAllPlayers = useCallback(async () => {
    const { data } = await supabase.from("players").select("*").order("name");
    if (data) setAllPlayers(data);
  }, []);

  useEffect(() => {
    fetchAllPlayers();
  }, [fetchAllPlayers]);

  useRealtime("players", fetchAllPlayers);

  // Build team squad map
  useEffect(() => {
    const map = new Map<string, Player[]>();
    allPlayers.forEach((p) => {
      if (p.sold_to && p.status === "sold") {
        const list = map.get(p.sold_to) ?? [];
        list.push(p);
        map.set(p.sold_to, list);
      }
    });
    setTeamSquads(map);
  }, [allPlayers]);

  const highestTeam = teams.find((t) => t.id === auctionState?.current_highest_team_id);
  const [lastSoldVisible, setLastSoldVisible] = useState(false);
  const [lastSoldId, setLastSoldId] = useState<string | null>(null);

  // Detect sold event
  useEffect(() => {
    if (!auctionState?.current_player_id && currentPlayer === null && lastSoldId !== auctionState?.last_updated) {
      setLastSoldVisible(true);
      setLastSoldId(auctionState?.last_updated ?? null);
      const t = setTimeout(() => setLastSoldVisible(false), 3000);
      return () => clearTimeout(t);
    }
  }, [auctionState?.current_player_id, currentPlayer, auctionState?.last_updated, lastSoldId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton w-96 h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-primary/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-4xl text-gold tracking-wider">STRIKE</h1>
            <span className={clsx(
              "px-3 py-1 rounded-full text-xs font-semibold",
              auctionState?.status === "live" ? "bg-accent-green/20 text-accent-green" :
              auctionState?.status === "paused" ? "bg-yellow-500/20 text-yellow-400" :
              auctionState?.status === "completed" ? "bg-accent-blue/20 text-accent-blue" :
              "bg-txt-secondary/20 text-txt-secondary"
            )}>
              {auctionState?.status === "live" ? "LIVE" : auctionState?.status?.toUpperCase()}
            </span>
            {auctionState && auctionState.current_round > 1 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gold/20 text-gold">
                Round {auctionState.current_round}
              </span>
            )}
          </div>
          <a href="/" className="text-txt-secondary hover:text-txt-primary text-sm transition-colors">Home</a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {/* Section 1: Auction Hero */}
        <section>
          {currentPlayer ? (
            <div className="bg-surface-card border border-border rounded-2xl p-8 animate-slide-up">
              <div className="flex items-start gap-6 mb-8">
                {currentPlayer.photo_url && (
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border shrink-0">
                    <Image src={currentPlayer.photo_url} alt={currentPlayer.name} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="font-display text-6xl tracking-wider">{currentPlayer.name}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-txt-secondary">
                    <span className="px-3 py-1 bg-surface-secondary rounded-full text-sm">{currentPlayer.role}</span>
                    {currentPlayer.country && <span>{currentPlayer.country}</span>}
                    <span className="font-mono">Base: {formatPrice(currentPlayer.base_price)}</span>
                  </div>
                </div>
                {settings?.timer_enabled && (
                  <CountdownTimer timerExpiresAt={auctionState?.timer_expires_at} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Current Bid */}
                <div className="bg-surface-secondary rounded-xl p-6">
                  <p className="text-sm text-txt-secondary uppercase tracking-wider mb-2">Highest Bid</p>
                  <p className="font-mono text-5xl text-gold animate-bid-pulse" key={auctionState?.current_highest_bid}>
                    {formatPrice(auctionState?.current_highest_bid ?? 0)}
                  </p>
                  {highestTeam ? (
                    <div className="flex items-center gap-2 mt-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: highestTeam.primary_color }} />
                      <span className="font-medium text-lg">{highestTeam.name}</span>
                    </div>
                  ) : (
                    <p className="text-txt-secondary text-sm mt-3">Starting bid — no team yet</p>
                  )}
                </div>

                {/* Bid History */}
                <div className="bg-surface-secondary rounded-xl p-6">
                  <p className="text-sm text-txt-secondary uppercase tracking-wider mb-3">Bid History</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {bids.length > 0 ? bids.map((bid) => {
                      const bidTeam = teams.find((t) => t.id === bid.team_id);
                      return (
                        <div key={bid.id} className="flex items-center justify-between text-sm animate-fade-in">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bidTeam?.primary_color ?? "#666" }} />
                            <span>{bidTeam?.name ?? "Unknown"}</span>
                          </div>
                          <span className="font-mono text-gold">{formatPrice(bid.amount)}</span>
                        </div>
                      );
                    }) : (
                      <p className="text-txt-secondary text-xs">No bids yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-surface-card border border-border rounded-2xl p-16 text-center">
              {lastSoldVisible ? (
                <div className="animate-stamp font-display text-7xl text-accent-green border-4 border-accent-green inline-block px-8 py-2 rotate-[-15deg]">
                  SOLD
                </div>
              ) : (
                <>
                  <Gavel size={64} className="mx-auto mb-4 text-txt-secondary opacity-20" />
                  <p className="font-display text-3xl tracking-wider text-txt-secondary">
                    {auctionState?.status === "setup"
                      ? "AUCTION HASN'T STARTED"
                      : auctionState?.status === "paused"
                        ? "AUCTION PAUSED"
                        : auctionState?.status === "completed"
                          ? "AUCTION COMPLETE"
                          : "WAITING FOR NEXT PLAYER"}
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Teams Grid */}
        <section>
          <h3 className="font-display text-2xl tracking-wider mb-4">TEAMS</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teams.map((team) => {
              const squad = teamSquads.get(team.id) ?? [];
              const spent = team.budget - team.budget_remaining;
              const pct = team.budget > 0 ? (spent / team.budget) * 100 : 0;
              const isWinner = team.id === auctionState?.current_highest_team_id;

              return (
                <div
                  key={team.id}
                  className={clsx(
                    "bg-surface-card border rounded-xl p-4 transition-all",
                    isWinner ? "border-gold animate-gold-glow" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: team.primary_color }} />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{team.name}</h4>
                      <p className="text-xs text-txt-secondary">{squad.length} players</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-txt-secondary mb-1">
                      <span className="font-mono">{formatPrice(team.budget_remaining)}</span>
                      <span>{Math.round(pct)}% used</span>
                    </div>
                    <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: team.primary_color }} />
                    </div>
                  </div>

                  {squad.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
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
            })}
          </div>
        </section>

        {/* Section 3: Player Registry */}
        <section>
          <PlayerRegistry players={allPlayers} teams={teams} />
        </section>
      </div>
    </div>
  );
}

type SortField = "name" | "base_price" | "sold_price";
type SortDir = "asc" | "desc";

function PlayerRegistry({ players, teams }: { players: Player[]; teams: Team[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const filtered = useMemo(() => {
    let result = [...players];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (roleFilter) result = result.filter((p) => p.role === roleFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (teamFilter) result = result.filter((p) => p.sold_to === teamFilter);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "base_price") cmp = a.base_price - b.base_price;
      else if (sortField === "sold_price") cmp = (a.sold_price ?? 0) - (b.sold_price ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [players, search, roleFilter, statusFilter, teamFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h3 className="font-display text-2xl tracking-wider">PLAYER REGISTRY</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-secondary" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-surface-secondary border border-border rounded-lg text-xs text-txt-primary placeholder:text-txt-secondary/50 focus:outline-none focus:border-gold w-40"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 bg-surface-secondary border border-border rounded-lg text-xs text-txt-primary focus:outline-none focus:border-gold">
            <option value="">All Roles</option>
            <option value="Batsman">Batsman</option>
            <option value="Bowler">Bowler</option>
            <option value="All-rounder">All-rounder</option>
            <option value="Wicket-keeper">Wicket-keeper</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-surface-secondary border border-border rounded-lg text-xs text-txt-primary focus:outline-none focus:border-gold">
            <option value="">All Statuses</option>
            <option value="unsold">Unsold</option>
            <option value="on_auction">On Auction</option>
            <option value="sold">Sold</option>
          </select>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-3 py-2 bg-surface-secondary border border-border rounded-lg text-xs text-txt-primary focus:outline-none focus:border-gold">
            <option value="">All Teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto bg-surface-card border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-txt-secondary text-left">
              <th className="p-3">#</th>
              <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="flex items-center gap-1">Name <ArrowUpDown size={12} /></span>
              </th>
              <th className="p-3">Role</th>
              <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort("base_price")}>
                <span className="flex items-center gap-1">Base Price <ArrowUpDown size={12} /></span>
              </th>
              <th className="p-3">Status</th>
              <th className="p-3">Sold To</th>
              <th className="p-3 cursor-pointer select-none" onClick={() => toggleSort("sold_price")}>
                <span className="flex items-center gap-1">Sold Price <ArrowUpDown size={12} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player, i) => {
              const soldTeam = player.sold_to ? teamMap.get(player.sold_to) : null;
              return (
                <tr key={player.id} className="border-b border-border/30 hover:bg-surface-secondary/30">
                  <td className="p-3 text-txt-secondary">{i + 1}</td>
                  <td className="p-3 font-medium">{player.name}</td>
                  <td className="p-3 text-txt-secondary">{player.role}</td>
                  <td className="p-3 font-mono text-sm">{formatPrice(player.base_price)}</td>
                  <td className="p-3"><StatusBadge status={player.status} /></td>
                  <td className="p-3">
                    {soldTeam ? (
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: soldTeam.primary_color }} />
                        <span className="text-sm">{soldTeam.name}</span>
                      </div>
                    ) : (
                      <span className="text-txt-secondary">—</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-gold">{player.sold_price ? formatPrice(player.sold_price) : "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-txt-secondary">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
