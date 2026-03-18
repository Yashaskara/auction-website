import clsx from "clsx";

interface StatusBadgeProps {
  status: "unsold" | "on_auction" | "sold";
  size?: "sm" | "md";
}

const STATUS_CONFIG = {
  unsold: { label: "Unsold", bg: "bg-txt-secondary/20", text: "text-txt-secondary" },
  on_auction: { label: "On Auction", bg: "bg-gold/20", text: "text-gold" },
  sold: { label: "Sold", bg: "bg-accent-green/20", text: "text-accent-green" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full font-semibold",
        config.bg,
        config.text,
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
    >
      {config.label}
    </span>
  );
}
