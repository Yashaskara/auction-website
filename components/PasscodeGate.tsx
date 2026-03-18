"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";
import clsx from "clsx";

interface PasscodeGateProps {
  title: string;
  onSuccess: () => void;
  onCancel: () => void;
  validatePasscode: (passcode: string) => Promise<boolean>;
}

export default function PasscodeGate({
  title,
  onSuccess,
  onCancel,
  validatePasscode,
}: PasscodeGateProps) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const valid = await validatePasscode(passcode);
      if (valid) {
        onSuccess();
      } else {
        setError("Invalid passcode");
        setPasscode("");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm mx-4 bg-surface-card border border-border rounded-2xl p-8 animate-slide-up">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center">
            <Lock size={24} className="text-gold" />
          </div>
          <h2 className="font-display text-2xl tracking-wide">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            autoFocus
            className={clsx(
              "w-full px-4 py-3 bg-surface-secondary border rounded-lg text-txt-primary placeholder:text-txt-secondary/50 focus:outline-none focus:border-gold transition-colors font-mono tracking-widest text-center text-lg",
              error ? "border-accent-red" : "border-border"
            )}
          />

          {error && (
            <p className="text-accent-red text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!passcode || loading}
            className="w-full py-3 bg-gold hover:bg-gold-dim text-surface-primary font-display text-xl tracking-wider rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "VERIFYING..." : "ENTER"}
          </button>
        </form>
      </div>
    </div>
  );
}
