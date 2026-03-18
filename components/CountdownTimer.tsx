"use client";

import clsx from "clsx";
import { useCountdown } from "@/lib/useCountdown";
import { Timer } from "lucide-react";

interface CountdownTimerProps {
  timerExpiresAt: string | null | undefined;
  size?: "sm" | "lg";
}

export default function CountdownTimer({ timerExpiresAt, size = "lg" }: CountdownTimerProps) {
  const { remainingSeconds, isExpired, formattedTime } = useCountdown(timerExpiresAt);

  if (!timerExpiresAt) return null;

  const isWarning = remainingSeconds <= 15 && remainingSeconds > 5;
  const isCritical = remainingSeconds <= 5;

  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-xl font-mono tabular-nums",
        size === "lg" ? "px-6 py-4 text-4xl" : "px-3 py-2 text-lg",
        isExpired
          ? "bg-accent-red/20 text-accent-red"
          : isCritical
            ? "bg-accent-red/20 text-accent-red animate-timer-pulse"
            : isWarning
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-accent-green/20 text-accent-green"
      )}
    >
      <Timer size={size === "lg" ? 28 : 18} />
      {isExpired ? (
        <span className="font-display tracking-wider">TIME&apos;S UP</span>
      ) : (
        <span>{formattedTime}</span>
      )}
    </div>
  );
}
