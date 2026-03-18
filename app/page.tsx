"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Gavel, Users, Eye } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { setSession } from "@/lib/session";
import PasscodeGate from "@/components/PasscodeGate";
import type { Team } from "@/types";

type GateMode = null | "admin" | "auctioneer" | "team_step1" | "team_step2";

const MODE_CARDS = [
  {
    id: "admin" as const,
    label: "ADMIN",
    description: "Manage players, teams & auction settings",
    icon: Shield,
    color: "from-gold/20 to-gold/5",
  },
  {
    id: "auctioneer" as const,
    label: "AUCTIONEER",
    description: "Control the auction flow & sell players",
    icon: Gavel,
    color: "from-accent-blue/20 to-accent-blue/5",
  },
  {
    id: "team" as const,
    label: "TEAM",
    description: "Place bids & build your squad",
    icon: Users,
    color: "from-accent-green/20 to-accent-green/5",
  },
  {
    id: "spectator" as const,
    label: "SPECTATOR",
    description: "Watch the auction live",
    icon: Eye,
    color: "from-purple-500/20 to-purple-500/5",
  },
];

export default function Home() {
  const router = useRouter();
  const [gateMode, setGateMode] = useState<GateMode>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const handleModeClick = async (mode: string) => {
    if (mode === "spectator") {
      setSession({ role: "spectator" });
      router.push("/spectator");
      return;
    }
    if (mode === "team") {
      setGateMode("team_step1");
      return;
    }
    setGateMode(mode as GateMode);
  };

  const validateAdminPasscode = async (passcode: string) => {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "admin_passcode")
      .single();
    return data?.value === passcode;
  };

  const validateAuctioneerPasscode = async (passcode: string) => {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "auctioneer_passcode")
      .single();
    return data?.value === passcode;
  };

  const validateTeamPasscode = async (passcode: string) => {
    if (!selectedTeam) return false;
    return selectedTeam.passcode === passcode;
  };

  const handleAdminSuccess = () => {
    setSession({ role: "admin" });
    router.push("/admin");
  };

  const handleAuctioneerSuccess = () => {
    setSession({ role: "auctioneer" });
    router.push("/auctioneer");
  };

  const handleTeamStep1Success = async () => {
    const { data } = await supabase.from("teams").select("*").order("name");
    if (data) setTeams(data);
    setGateMode("team_step2");
  };

  const handleTeamSelect = () => {
    const team = teams.find((t) => t.id === selectedTeamId);
    if (team) {
      setSelectedTeam(team);
    }
  };

  const handleTeamPasscodeSuccess = () => {
    if (!selectedTeam) return;
    setSession({
      role: "team",
      teamId: selectedTeam.id,
      teamName: selectedTeam.name,
    });
    router.push("/team");
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 z-10">
      {/* Title */}
      <div className="text-center mb-16">
        <h1 className="font-display text-8xl md:text-9xl tracking-wider text-gold leading-none">
          NO RUN
        </h1>
        <p className="text-txt-secondary text-lg mt-2 tracking-widest uppercase font-body">
          Cricket Auction Platform
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full">
        {MODE_CARDS.map((card) => (
          <button
            key={card.id}
            onClick={() => handleModeClick(card.id)}
            className={clsx(
              "group relative flex flex-col items-center gap-4 p-8 rounded-2xl border border-border bg-surface-card",
              "hover:border-gold/50 hover:scale-[1.02] transition-all duration-300",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            )}
          >
            <div
              className={clsx(
                "absolute inset-0 rounded-2xl bg-gradient-to-b opacity-0 group-hover:opacity-100 transition-opacity",
                card.color
              )}
            />
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center group-hover:bg-gold/10 transition-colors">
              <card.icon
                size={32}
                className="text-txt-secondary group-hover:text-gold transition-colors"
              />
            </div>
            <div className="relative z-10 text-center">
              <h2 className="font-display text-3xl tracking-wider mb-1">{card.label}</h2>
              <p className="text-txt-secondary text-sm">{card.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Passcode Gates */}
      {gateMode === "admin" && (
        <PasscodeGate
          title="ADMIN ACCESS"
          onSuccess={handleAdminSuccess}
          onCancel={() => setGateMode(null)}
          validatePasscode={validateAdminPasscode}
        />
      )}

      {gateMode === "auctioneer" && (
        <PasscodeGate
          title="AUCTIONEER ACCESS"
          onSuccess={handleAuctioneerSuccess}
          onCancel={() => setGateMode(null)}
          validatePasscode={validateAuctioneerPasscode}
        />
      )}

      {gateMode === "team_step1" && (
        <PasscodeGate
          title="TEAM ACCESS"
          onSuccess={handleTeamStep1Success}
          onCancel={() => setGateMode(null)}
          validatePasscode={validateAuctioneerPasscode}
        />
      )}

      {gateMode === "team_step2" && !selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm mx-4 bg-surface-card border border-border rounded-2xl p-8 animate-slide-up">
            <h2 className="font-display text-2xl tracking-wide text-center mb-6">
              SELECT YOUR TEAM
            </h2>

            <div className="space-y-3 max-h-64 overflow-y-auto mb-6">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all",
                    selectedTeamId === team.id
                      ? "border-gold bg-gold/10"
                      : "border-border bg-surface-secondary hover:border-txt-secondary"
                  )}
                >
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: team.primary_color }}
                  />
                  <span className="font-body">{team.name}</span>
                </button>
              ))}
              {teams.length === 0 && (
                <p className="text-txt-secondary text-center py-4">No teams available</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGateMode(null);
                  setSelectedTeamId("");
                }}
                className="flex-1 py-3 border border-border rounded-lg text-txt-secondary hover:text-txt-primary transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleTeamSelect}
                disabled={!selectedTeamId}
                className="flex-1 py-3 bg-gold hover:bg-gold-dim text-surface-primary font-display text-lg tracking-wider rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                NEXT
              </button>
            </div>
          </div>
        </div>
      )}

      {gateMode === "team_step2" && selectedTeam && (
        <PasscodeGate
          title={`${selectedTeam.name.toUpperCase()} PASSCODE`}
          onSuccess={handleTeamPasscodeSuccess}
          onCancel={() => {
            setSelectedTeam(null);
            setSelectedTeamId("");
          }}
          validatePasscode={validateTeamPasscode}
        />
      )}
    </div>
  );
}
