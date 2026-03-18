"use client";

import { useState, useEffect, useCallback } from "react";

interface CountdownResult {
  remainingSeconds: number;
  isExpired: boolean;
  formattedTime: string;
}

export function useCountdown(timerExpiresAt: string | null | undefined): CountdownResult {
  const calcRemaining = useCallback(() => {
    if (!timerExpiresAt) return -1;
    const diff = new Date(timerExpiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
  }, [timerExpiresAt]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(calcRemaining);

  useEffect(() => {
    setRemainingSeconds(calcRemaining());

    if (!timerExpiresAt) return;

    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timerExpiresAt, calcRemaining]);

  const isExpired = timerExpiresAt !== null && timerExpiresAt !== undefined && remainingSeconds <= 0;

  const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
  const secs = Math.max(0, remainingSeconds) % 60;
  const formattedTime = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;

  return { remainingSeconds: Math.max(0, remainingSeconds), isExpired, formattedTime };
}
