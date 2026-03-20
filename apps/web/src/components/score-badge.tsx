"use client";

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color =
    score >= 0.8
      ? "bg-success-100 text-success-700"
      : score >= 0.5
        ? "bg-warning-100 text-warning-700"
        : "bg-error-100 text-error-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${color}`}
    >
      {label ? `${label}: ` : ""}
      {score.toFixed(2)}
    </span>
  );
}
