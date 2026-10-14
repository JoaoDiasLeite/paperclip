import type { BudgetMetric } from "@paperclipai/shared";
import { formatCents } from "./utils";

/** Token metrics are counted in tokens; every other budget metric is in cents. */
export function isTokenBudgetMetric(metric: BudgetMetric | string | null | undefined) {
  return metric === "total_tokens" || metric === "weighted_tokens";
}

const tokenFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatBudgetAmount(metric: BudgetMetric | string | null | undefined, value: number) {
  return isTokenBudgetMetric(metric) ? `${tokenFormatter.format(value)} tokens` : formatCents(value);
}

export function budgetAmountInputValue(metric: BudgetMetric | string | null | undefined, value: number) {
  return isTokenBudgetMetric(metric) ? String(value) : (value / 100).toFixed(2);
}

/** Parses a typed budget into the metric's unit (tokens or cents); null when invalid. */
export function parseBudgetAmountInput(metric: BudgetMetric | string | null | undefined, value: string) {
  const normalized = value.trim().replace(/[_,\s]/g, "");
  if (normalized.length === 0) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return isTokenBudgetMetric(metric) ? Math.round(parsed) : Math.round(parsed * 100);
}

export function budgetAmountLabel(metric: BudgetMetric | string | null | undefined) {
  return isTokenBudgetMetric(metric) ? "tokens" : "USD";
}
