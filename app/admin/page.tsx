"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/lib/useRealtime";
import { formatPrice } from "@/lib/formatPrice";
import { PLAYER_ROLES } from "@/lib/constants";
import type { Player, Team, AuctionSettings, AuctionState } from "@/types";
import {
  Plus, Pencil, Trash2, Shuffle, Upload, X, LogOut,
  Users, UserCircle, Settings, LayoutDashboard,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";

type Tab = "players" | "teams" | "settings" | "overview";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("players");
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<AuctionSettings | null>(null);
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [locked, setLocked] = useState(false);

  // Auth check
  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== "admin") {
      router.push("/");
    }
  }, [router]);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase.from("players").select("*").order("queue_order", { ascending: true, nullsFirst: false });
    if (data) setPlayers(data);
  }, []);

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase.from("teams").select("*").order("name");
    if (data) setTeams(data);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("auction_settings").select("*").eq("id", 1).single();
    if (data) setSettings(data);
  }, []);

  const fetchAuctionState = useCallback(async () => {
    const { data } = await supabase.from("auction_state").select("*").eq("id", 1).single();
    if (data) setAuctionState(data);
  }, []);

  const fetchLocked = useCallback(async () => {
    const { data } = await supabase.from("app_config").select("value").eq("key", "auction_locked").single();
    if (data) setLocked(data.value === "true");
  }, []);

  useEffect(() => {
    fetchPlayers();
    fetchTeams();
    fetchSettings();
    fetchAuctionState();
    fetchLocked();
  }, [fetchPlayers, fetchTeams, fetchSettings, fetchAuctionState, fetchLocked]);

  useRealtime("players", fetchPlayers);
  useRealtime("teams", fetchTeams);
  useRealtime("auction_settings", fetchSettings);
  useRealtime("auction_state", fetchAuctionState);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "players", label: "Players", icon: UserCircle },
    { id: "teams", label: "Teams", icon: Users },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "overview", label: "Overview", icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-screen relative z-10">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface-primary/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-3xl text-gold tracking-wider">STRIKE</h1>
            <span className="text-txt-secondary text-sm">/ ADMIN</span>
          </div>
          <button
            onClick={() => { clearSession(); router.push("/"); }}
            className="flex items-center gap-2 text-txt-secondary hover:text-txt-primary transition-colors text-sm"
          >
            <LogOut size={16} /> Exit
          </button>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                tab === t.id
                  ? "border-gold text-gold"
                  : "border-transparent text-txt-secondary hover:text-txt-primary"
              )}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === "players" && (
          <PlayersTab
            players={players}
            teams={teams}
            settings={settings}
            locked={locked}
            onRefresh={fetchPlayers}
          />
        )}
        {tab === "teams" && (
          <TeamsTab
            teams={teams}
            players={players}
            settings={settings}
            locked={locked}
            onRefresh={fetchTeams}
          />
        )}
        {tab === "settings" && (
          <SettingsTab
            settings={settings}
            auctionState={auctionState}
            locked={locked}
            teams={teams}
            onRefresh={() => { fetchSettings(); fetchAuctionState(); fetchLocked(); fetchPlayers(); fetchTeams(); }}
          />
        )}
        {tab === "overview" && (
          <OverviewTab players={players} teams={teams} auctionState={auctionState} />
        )}
      </main>
    </div>
  );
}

// ─── Players Tab ────────────────────────────────────────────────────────────
function PlayersTab({
  players, teams, settings, locked, onRefresh,
}: {
  players: Player[];
  teams: Team[];
  settings: AuctionSettings | null;
  locked: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [search, setSearch] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState("");

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const handleDelete = async (player: Player) => {
    if (player.status !== "unsold") return;
    if (!confirm(`Delete ${player.name}?`)) return;
    await supabase.from("players").delete().eq("id", player.id);
    toast.success("Player deleted");
    onRefresh();
  };

  const handleRandomize = async () => {
    const unsold = players.filter((p) => p.status === "unsold");
    if (unsold.length === 0) { toast.error("No unsold players to shuffle"); return; }

    const shuffled = [...unsold].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await supabase.from("players").update({ queue_order: i + 1 }).eq("id", shuffled[i].id);
    }
    toast.success(`Shuffled ${shuffled.length} players`);
    onRefresh();
  };

  const handleCsvImport = async () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    let imported = 0;
    for (const line of lines) {
      const [name, role, basePriceStr, country] = line.split(",").map((s) => s.trim());
      if (!name) continue;
      const validRole = PLAYER_ROLES.includes(role as typeof PLAYER_ROLES[number]) ? role : "Batsman";
      const basePrice = parseInt(basePriceStr) || settings?.default_base_price || 100000;
      await supabase.from("players").insert({
        name,
        role: validRole,
        base_price: basePrice,
        country: country || null,
      });
      imported++;
    }
    toast.success(`Imported ${imported} players`);
    setCsvText("");
    setShowCsvImport(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl tracking-wider">PLAYERS</h2>
          <span className="text-txt-secondary text-sm">({players.length})</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm text-txt-primary placeholder:text-txt-secondary/50 focus:outline-none focus:border-gold"
          />
          <button onClick={handleRandomize} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:border-gold hover:text-gold transition-colors">
            <Shuffle size={14} /> Randomize Queue
          </button>
          <button onClick={() => setShowCsvImport(!showCsvImport)} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:border-gold hover:text-gold transition-colors">
            <Upload size={14} /> CSV Import
          </button>
          {!locked && (
            <button
              onClick={() => { setEditPlayer(null); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-dim text-surface-primary rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={14} /> Add Player
            </button>
          )}
        </div>
      </div>

      {showCsvImport && (
        <div className="mb-6 p-4 bg-surface-card border border-border rounded-xl">
          <p className="text-sm text-txt-secondary mb-2">Paste CSV: Name, Role, Base Price, Country (one per line)</p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm text-txt-primary font-mono focus:outline-none focus:border-gold"
            placeholder="Virat Kohli, Batsman, 200000, India"
          />
          <div className="flex gap-3 mt-3">
            <button onClick={handleCsvImport} disabled={!csvText.trim()} className="px-4 py-2 bg-gold hover:bg-gold-dim text-surface-primary rounded-lg text-sm disabled:opacity-50">Import</button>
            <button onClick={() => setShowCsvImport(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-txt-secondary hover:text-txt-primary">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-txt-secondary text-left">
              <th className="pb-3 pr-4">#</th>
              <th className="pb-3 pr-4">Name</th>
              <th className="pb-3 pr-4">Role</th>
              <th className="pb-3 pr-4">Base Price</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Sold To</th>
              <th className="pb-3 pr-4">Sold Price</th>
              <th className="pb-3 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((player, i) => (
              <tr key={player.id} className="border-b border-border/50 hover:bg-surface-secondary/50">
                <td className="py-3 pr-4 text-txt-secondary">{player.queue_order ?? i + 1}</td>
                <td className="py-3 pr-4 font-medium">{player.name}</td>
                <td className="py-3 pr-4 text-txt-secondary">{player.role}</td>
                <td className="py-3 pr-4 font-mono text-gold">{formatPrice(player.base_price)}</td>
                <td className="py-3 pr-4"><StatusBadge status={player.status} /></td>
                <td className="py-3 pr-4 text-txt-secondary">
                  {player.sold_to ? teamMap.get(player.sold_to)?.name ?? "—" : "—"}
                </td>
                <td className="py-3 pr-4 font-mono">
                  {player.sold_price ? formatPrice(player.sold_price) : "—"}
                </td>
                <td className="py-3 pr-4">
                  {player.status === "unsold" && !locked && (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditPlayer(player); setShowForm(true); }} className="p-1.5 hover:text-gold transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(player)} className="p-1.5 hover:text-accent-red transition-colors"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Player Form Slide-in */}
      {showForm && (
        <PlayerForm
          player={editPlayer}
          defaultBasePrice={settings?.default_base_price ?? 100000}
          onClose={() => { setShowForm(false); setEditPlayer(null); }}
          onSaved={() => { setShowForm(false); setEditPlayer(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Player Form ────────────────────────────────────────────────────────────
function PlayerForm({
  player, defaultBasePrice, onClose, onSaved,
}: {
  player: Player | null;
  defaultBasePrice: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(player?.name ?? "");
  const [role, setRole] = useState(player?.role ?? "Batsman");
  const [basePrice, setBasePrice] = useState(player?.base_price ?? defaultBasePrice);
  const [photoUrl, setPhotoUrl] = useState(player?.photo_url ?? "");
  const [country, setCountry] = useState(player?.country ?? "");
  const [battingStyle, setBattingStyle] = useState(player?.batting_style ?? "");
  const [bowlingStyle, setBowlingStyle] = useState(player?.bowling_style ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      role,
      base_price: basePrice,
      photo_url: photoUrl || null,
      country: country || null,
      batting_style: battingStyle || null,
      bowling_style: bowlingStyle || null,
    };

    if (player) {
      await supabase.from("players").update(payload).eq("id", player.id);
      toast.success("Player updated");
    } else {
      await supabase.from("players").insert(payload);
      toast.success("Player added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-card border-l border-border h-full overflow-y-auto p-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-display text-2xl tracking-wider">{player ? "EDIT" : "ADD"} PLAYER</h3>
          <button onClick={onClose} className="text-txt-secondary hover:text-txt-primary"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="form-input" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as Player["role"])} className="form-input">
              {PLAYER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Base Price">
            <input type="number" value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} min={0} step={10000} className="form-input font-mono" />
          </Field>
          <Field label="Photo URL">
            <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." className="form-input" />
          </Field>
          <Field label="Country">
            <input value={country} onChange={(e) => setCountry(e.target.value)} className="form-input" />
          </Field>
          <Field label="Batting Style">
            <input value={battingStyle} onChange={(e) => setBattingStyle(e.target.value)} placeholder="Right-hand bat" className="form-input" />
          </Field>
          <Field label="Bowling Style">
            <input value={bowlingStyle} onChange={(e) => setBowlingStyle(e.target.value)} placeholder="Right-arm fast" className="form-input" />
          </Field>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full py-3 bg-gold hover:bg-gold-dim text-surface-primary font-display text-lg tracking-wider rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "SAVING..." : player ? "UPDATE PLAYER" : "ADD PLAYER"}
          </button>
        </form>
      </div>

      <style jsx>{`
        .form-input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          color: var(--text-primary);
          font-size: 0.875rem;
        }
        .form-input:focus {
          outline: none;
          border-color: var(--gold);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-txt-secondary mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── Teams Tab ──────────────────────────────────────────────────────────────
function TeamsTab({
  teams, players, settings, locked, onRefresh,
}: {
  teams: Team[];
  players: Player[];
  settings: AuctionSettings | null;
  locked: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);

  const handleDelete = async (team: Team) => {
    if (!confirm(`Delete ${team.name}?`)) return;
    await supabase.from("teams").delete().eq("id", team.id);
    toast.success("Team deleted");
    onRefresh();
  };

  const squadCounts = new Map<string, number>();
  players.forEach((p) => {
    if (p.sold_to) {
      squadCounts.set(p.sold_to, (squadCounts.get(p.sold_to) ?? 0) + 1);
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl tracking-wider">TEAMS</h2>
          <span className="text-txt-secondary text-sm">({teams.length})</span>
        </div>
        {!locked && (
          <button
            onClick={() => { setEditTeam(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-dim text-surface-primary rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Add Team
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {teams.map((team) => (
          <div key={team.id} className="flex items-center gap-4 p-4 bg-surface-card border border-border rounded-xl">
            <div className="w-3 h-12 rounded-full shrink-0" style={{ backgroundColor: team.primary_color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-medium truncate">{team.name}</h3>
                {team.captain_name && <span className="text-xs text-txt-secondary">Captain: {team.captain_name}</span>}
              </div>
              <div className="flex items-center gap-4 text-sm text-txt-secondary">
                <span className="font-mono">{formatPrice(team.budget_remaining)} / {formatPrice(team.budget)}</span>
                <span>{squadCounts.get(team.id) ?? 0} players</span>
                <span className="font-mono text-xs">Pass: {team.passcode.replace(/./g, "•")}</span>
              </div>
            </div>
            {!locked && (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditTeam(team); setShowForm(true); }} className="p-2 hover:text-gold transition-colors"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(team)} className="p-2 hover:text-accent-red transition-colors"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <TeamForm
          team={editTeam}
          defaultBudget={settings?.default_team_budget ?? 1000000}
          onClose={() => { setShowForm(false); setEditTeam(null); }}
          onSaved={() => { setShowForm(false); setEditTeam(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Team Form ──────────────────────────────────────────────────────────────
function TeamForm({
  team, defaultBudget, onClose, onSaved,
}: {
  team: Team | null;
  defaultBudget: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [color, setColor] = useState(team?.primary_color ?? "#f0b429");
  const [budget, setBudget] = useState(team?.budget ?? defaultBudget);
  const [captain, setCaptain] = useState(team?.captain_name ?? "");
  const [passcode, setPasscode] = useState(team?.passcode ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !passcode.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      primary_color: color,
      budget,
      budget_remaining: team ? team.budget_remaining + (budget - team.budget) : budget,
      captain_name: captain || null,
      passcode: passcode.trim(),
    };

    if (team) {
      await supabase.from("teams").update(payload).eq("id", team.id);
      toast.success("Team updated");
    } else {
      await supabase.from("teams").insert(payload);
      toast.success("Team added");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-surface-card border-l border-border h-full overflow-y-auto p-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-display text-2xl tracking-wider">{team ? "EDIT" : "ADD"} TEAM</h3>
          <button onClick={onClose} className="text-txt-secondary hover:text-txt-primary"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Team Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2.5 bg-surface-secondary border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Primary Color">
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
              <span className="text-sm font-mono text-txt-secondary">{color}</span>
            </div>
          </Field>
          <Field label="Budget">
            <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} min={0} step={100000} className="w-full px-3 py-2.5 bg-surface-secondary border border-border rounded-lg text-txt-primary text-sm font-mono focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Captain Name">
            <input value={captain} onChange={(e) => setCaptain(e.target.value)} className="w-full px-3 py-2.5 bg-surface-secondary border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Passcode *">
            <input value={passcode} onChange={(e) => setPasscode(e.target.value)} required className="w-full px-3 py-2.5 bg-surface-secondary border border-border rounded-lg text-txt-primary text-sm font-mono focus:outline-none focus:border-gold" />
          </Field>

          <button type="submit" disabled={saving || !name.trim() || !passcode.trim()} className="w-full py-3 bg-gold hover:bg-gold-dim text-surface-primary font-display text-lg tracking-wider rounded-lg transition-colors disabled:opacity-50">
            {saving ? "SAVING..." : team ? "UPDATE TEAM" : "ADD TEAM"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────────────
function SettingsTab({
  settings, auctionState, locked, teams, onRefresh,
}: {
  settings: AuctionSettings | null;
  auctionState: AuctionState | null;
  locked: boolean;
  teams: Team[];
  onRefresh: () => void;
}) {
  const [bidIncrement, setBidIncrement] = useState(settings?.bid_increment ?? 10000);
  const [maxPlayers, setMaxPlayers] = useState(settings?.max_players_per_team ?? 25);
  const [minPlayers, setMinPlayers] = useState(settings?.min_players_per_team ?? 15);
  const [timerEnabled, setTimerEnabled] = useState(settings?.timer_enabled ?? true);
  const [timerDuration, setTimerDuration] = useState(settings?.timer_duration_seconds ?? 30);
  const [defaultBudget, setDefaultBudget] = useState(settings?.default_team_budget ?? 1000000);
  const [defaultBase, setDefaultBase] = useState(settings?.default_base_price ?? 100000);
  const [adminPass, setAdminPass] = useState("");
  const [auctioneerPass, setAuctioneerPass] = useState("");

  useEffect(() => {
    if (settings) {
      setBidIncrement(settings.bid_increment);
      setMaxPlayers(settings.max_players_per_team);
      setMinPlayers(settings.min_players_per_team);
      setTimerEnabled(settings.timer_enabled);
      setTimerDuration(settings.timer_duration_seconds);
      setDefaultBudget(settings.default_team_budget);
      setDefaultBase(settings.default_base_price);
    }
  }, [settings]);

  const saveSettings = async () => {
    if (minPlayers > maxPlayers) {
      toast.error("Min players must be ≤ max players");
      return;
    }
    await supabase.from("auction_settings").update({
      bid_increment: bidIncrement,
      max_players_per_team: maxPlayers,
      min_players_per_team: minPlayers,
      timer_enabled: timerEnabled,
      timer_duration_seconds: timerDuration,
      default_team_budget: defaultBudget,
      default_base_price: defaultBase,
    }).eq("id", 1);
    toast.success("Settings saved");
    onRefresh();
  };

  const handleLockAndStart = async () => {
    if (!confirm("Lock the auction and go live? Teams and players can no longer be added/removed.")) return;
    await supabase.from("auction_state").update({ status: "live" }).eq("id", 1);
    await supabase.from("app_config").update({ value: "true" }).eq("key", "auction_locked");
    toast.success("Auction is LIVE!");
    onRefresh();
  };

  const handlePause = async () => {
    await supabase.from("auction_state").update({ status: "paused" }).eq("id", 1);
    toast.success("Auction paused");
    onRefresh();
  };

  const handleResume = async () => {
    await supabase.from("auction_state").update({ status: "live" }).eq("id", 1);
    toast.success("Auction resumed");
    onRefresh();
  };

  const handleReset = async () => {
    if (!confirm("This will reset the entire auction. All bids, sold players, and team budgets will be cleared. Are you sure?")) return;
    if (!confirm("This action is IRREVERSIBLE. Type of data loss. Continue?")) return;

    await supabase.from("bids").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("players").update({ status: "unsold", sold_to: null, sold_price: null }).neq("id", "00000000-0000-0000-0000-000000000000");
    for (const team of teams) {
      await supabase.from("teams").update({ budget_remaining: team.budget }).eq("id", team.id);
    }
    await supabase.from("auction_state").update({
      current_player_id: null,
      status: "setup",
      current_highest_bid: 0,
      current_highest_team_id: null,
      timer_expires_at: null,
      current_round: 1,
    }).eq("id", 1);
    await supabase.from("app_config").update({ value: "false" }).eq("key", "auction_locked");
    toast.success("Auction has been fully reset");
    onRefresh();
  };

  const updatePasscode = async (key: string, value: string) => {
    if (!value.trim()) return;
    await supabase.from("app_config").update({ value: value.trim() }).eq("key", key);
    toast.success("Passcode updated");
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Auction Parameters */}
      <section className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="font-display text-xl tracking-wider mb-6">AUCTION PARAMETERS</h3>
        <div className="grid grid-cols-2 gap-5">
          <Field label={`Bid Increment (${formatPrice(bidIncrement)})`}>
            <input type="number" value={bidIncrement} onChange={(e) => setBidIncrement(Number(e.target.value))} min={1000} step={1000} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Max Players Per Team">
            <input type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} min={1} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
          </Field>
          <Field label="Min Players Per Team (budget reservation)">
            <input type="number" value={minPlayers} onChange={(e) => setMinPlayers(Number(e.target.value))} min={0} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
          </Field>
          <Field label={`Default Team Budget (${formatPrice(defaultBudget)})`}>
            <input type="number" value={defaultBudget} onChange={(e) => setDefaultBudget(Number(e.target.value))} min={0} step={100000} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
          </Field>
          <Field label={`Default Base Price (${formatPrice(defaultBase)})`}>
            <input type="number" value={defaultBase} onChange={(e) => setDefaultBase(Number(e.target.value))} min={0} step={10000} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
          </Field>
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-txt-secondary">Timer</label>
              <button
                onClick={() => setTimerEnabled(!timerEnabled)}
                className={clsx("w-12 h-6 rounded-full transition-colors relative", timerEnabled ? "bg-gold" : "bg-border")}
              >
                <span className={clsx("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform", timerEnabled ? "left-[1.625rem]" : "left-0.5")} />
              </button>
              <span className="text-sm text-txt-secondary">{timerEnabled ? "Enabled" : "Disabled"}</span>
            </div>
            {timerEnabled && (
              <Field label="Timer Duration (seconds)">
                <input type="number" value={timerDuration} onChange={(e) => setTimerDuration(Number(e.target.value))} min={5} max={300} className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
              </Field>
            )}
          </div>
        </div>
        <button onClick={saveSettings} className="mt-6 px-6 py-2.5 bg-gold hover:bg-gold-dim text-surface-primary font-display tracking-wider rounded-lg transition-colors">
          SAVE SETTINGS
        </button>
      </section>

      {/* Passcode Management */}
      <section className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="font-display text-xl tracking-wider mb-6">PASSCODES</h3>
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Field label="Admin Passcode">
                <input value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="New passcode" className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
              </Field>
            </div>
            <button onClick={() => { updatePasscode("admin_passcode", adminPass); setAdminPass(""); }} disabled={!adminPass.trim()} className="px-4 py-2 border border-border rounded-lg text-sm hover:border-gold hover:text-gold transition-colors disabled:opacity-50">Update</button>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Field label="Auctioneer Passcode">
                <input value={auctioneerPass} onChange={(e) => setAuctioneerPass(e.target.value)} placeholder="New passcode" className="w-full px-3 py-2 bg-surface-secondary border border-border rounded-lg text-sm font-mono text-txt-primary focus:outline-none focus:border-gold" />
              </Field>
            </div>
            <button onClick={() => { updatePasscode("auctioneer_passcode", auctioneerPass); setAuctioneerPass(""); }} disabled={!auctioneerPass.trim()} className="px-4 py-2 border border-border rounded-lg text-sm hover:border-gold hover:text-gold transition-colors disabled:opacity-50">Update</button>
          </div>
        </div>
      </section>

      {/* Auction Control */}
      <section className="bg-surface-card border border-border rounded-xl p-6">
        <h3 className="font-display text-xl tracking-wider mb-6">AUCTION CONTROL</h3>
        <div className="flex flex-wrap gap-3">
          {!locked && auctionState?.status === "setup" && (
            <button onClick={handleLockAndStart} className="px-6 py-3 bg-accent-green hover:bg-accent-green/80 text-white font-display tracking-wider rounded-lg transition-colors">
              LOCK & START AUCTION
            </button>
          )}
          {auctionState?.status === "live" && (
            <button onClick={handlePause} className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-display tracking-wider rounded-lg transition-colors">
              PAUSE AUCTION
            </button>
          )}
          {auctionState?.status === "paused" && (
            <button onClick={handleResume} className="px-6 py-3 bg-accent-green hover:bg-accent-green/80 text-white font-display tracking-wider rounded-lg transition-colors">
              RESUME AUCTION
            </button>
          )}
          <button onClick={handleReset} className="px-6 py-3 bg-accent-red/20 border border-accent-red/50 text-accent-red hover:bg-accent-red/30 font-display tracking-wider rounded-lg transition-colors">
            RESET ENTIRE AUCTION
          </button>
        </div>
        <p className="text-txt-secondary text-xs mt-4">
          Current status: <span className="font-mono text-gold">{auctionState?.status ?? "loading..."}</span>
          {locked && <span className="ml-3 text-accent-red">(Locked)</span>}
        </p>
      </section>
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab({
  players, teams, auctionState,
}: {
  players: Player[];
  teams: Team[];
  auctionState: AuctionState | null;
}) {
  const sold = players.filter((p) => p.status === "sold");
  const unsold = players.filter((p) => p.status === "unsold");
  const onAuction = players.filter((p) => p.status === "on_auction");
  const highestSale = sold.length > 0 ? Math.max(...sold.map((p) => p.sold_price ?? 0)) : 0;

  const teamSquads = new Map<string, Player[]>();
  sold.forEach((p) => {
    if (p.sold_to) {
      const list = teamSquads.get(p.sold_to) ?? [];
      list.push(p);
      teamSquads.set(p.sold_to, list);
    }
  });

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Players", value: players.length, color: "text-txt-primary" },
          { label: "Sold", value: sold.length, color: "text-accent-green" },
          { label: "Unsold", value: unsold.length, color: "text-txt-secondary" },
          { label: "On Auction", value: onAuction.length, color: "text-gold" },
          { label: "Highest Sale", value: formatPrice(highestSale), color: "text-gold" },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface-card border border-border rounded-xl p-4 text-center">
            <p className="text-txt-secondary text-xs uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={clsx("font-display text-3xl", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Teams Summary */}
      <div>
        <h3 className="font-display text-xl tracking-wider mb-4">TEAMS</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => {
            const squad = teamSquads.get(team.id) ?? [];
            const spent = team.budget - team.budget_remaining;
            const pct = team.budget > 0 ? (spent / team.budget) * 100 : 0;

            return (
              <div key={team.id} className="bg-surface-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-8 rounded-full" style={{ backgroundColor: team.primary_color }} />
                  <div>
                    <h4 className="font-medium">{team.name}</h4>
                    <p className="text-xs text-txt-secondary">{squad.length} players | Spent: {formatPrice(spent)}</p>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-txt-secondary mb-1">
                    <span>{formatPrice(team.budget_remaining)} remaining</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {squad.length > 0 && (
                  <div className="space-y-1">
                    {squad.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span className="text-txt-secondary">{p.name}</span>
                        <span className="font-mono text-gold">{formatPrice(p.sold_price ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Round info */}
      {auctionState && (
        <p className="text-txt-secondary text-sm">
          Current Round: <span className="text-gold font-mono">{auctionState.current_round}</span>
          {" | "}Status: <span className="text-gold font-mono">{auctionState.status}</span>
        </p>
      )}
    </div>
  );
}
