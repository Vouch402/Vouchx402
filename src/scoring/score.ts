import { isAddress } from "viem";
import { publicClientFor } from "../lib/chain";
import { blockscoutApiBaseFor, type NetworkName } from "../lib/env";
import flaggedList from "./flagged-addresses.json";
import tokenizedEquities from "./tokenized-equities.json";

export interface RiskSignals {
  walletAgeDays: number;
  txCount: number;
  uniqueContractInteractions: number;
  flagged: boolean;
  /**
   * Tickers (e.g. "NVDAc") among Coinbase's Base-mainnet tokenized-equity
   * B20 tokens (see tokenized-equities.json) this address currently holds
   * a nonzero balance of, or has ever sent/received a transaction with —
   * whichever is true, no distinction kept between the two once matched.
   * Empty array if neither, always [] on Base Sepolia (these tokens only
   * exist on mainnet).
   *
   * Deliberately excluded from `scoreFromSignals()` below: this is a
   * named fact, not a risk input. Folding it into the score either
   * direction would turn "holds real-world-asset exposure" into an
   * implicit verdict ("this address is more/less trustworthy"), which is
   * exactly what the Buró de Crédito rule (DECISION_LOG.md, 2026-08-16)
   * exists to prevent. No balance/amount is ever included, only the
   * ticker and the bare fact of exposure — same reasoning as why the
   * rest of this API never carries a transaction amount.
   */
  tokenizedEquityExposure: string[];
}

export interface RiskResult {
  score: number;
  signals: RiskSignals;
}

interface ExplorerTx {
  timeStamp: string;
  to: string;
  from: string;
  input: string;
}

/**
 * Pulls the address's transaction history via Base's public Blockscout
 * instance (see DECISION_LOG.md), using its Etherscan-compatible
 * `account txlist` shape (sorted ascending, so `[0]` is the earliest
 * tx). Plain JSON-RPC has no "first tx" query, which is why an explorer
 * API is needed for that specific signal. No API key required. Returns
 * [] if every retry still fails, rate-limits, or the address genuinely
 * has no history (fresh wallet): a degraded signal, never a hard error —
 * that design choice is deliberate and unchanged.
 *
 * The retries are new (2026-09-09): confirmed live that Blockscout's
 * `txlist` endpoint is transiently flaky on this exact call, not just
 * theoretically — a real request against the team's own dev wallet
 * (37 real transactions, 27 days old) came back `{"message":"Something
 * went wrong.","status":"0"}` on one attempt and succeeded normally on
 * the next two, seconds apart. Before this fix, that single blip silently
 * produced `walletAgeDays: 0, uniqueContractInteractions: 0` — a wallet
 * with real history reading as brand-new — with nothing to distinguish
 * it from a genuinely fresh address. See DECISION_LOG.md.
 */
async function fetchTxHistory(network: NetworkName, address: string, max = 200): Promise<ExplorerTx[]> {
  const url = new URL(blockscoutApiBaseFor(network));
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "99999999");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(max));
  url.searchParams.set("sort", "asc");

  const retries = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url.toString());
      if (res.ok) {
        const body = (await res.json()) as { status: string; result: ExplorerTx[] | string };
        if (body.status === "1" && Array.isArray(body.result)) return body.result;
      }
    } catch {
      // network-level failure (fetch itself threw): fall through to retry.
    }
    if (attempt >= retries) return [];
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

function isFlagged(address: string): boolean {
  const lower = address.toLowerCase();
  return (flaggedList.addresses as string[]).some((a) => a.toLowerCase() === lower);
}

const balanceOfAbi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Tickers this address currently holds a nonzero balance of, among
 * Coinbase's Base-mainnet tokenized-equity tokens. Read-only `balanceOf`
 * multicall (Base's `multicall3` is wired into viem's chain config, so
 * this is one RPC round-trip for all 13 tokens, not 13). `base-sepolia`
 * always returns [] immediately: these tokens don't exist there, and
 * calling into addresses with no code on testnet would just waste a
 * round-trip for a result we already know.
 */
async function tokenizedEquityHoldingsFor(
  network: NetworkName,
  address: string
): Promise<string[]> {
  if (network !== "base") return [];

  const client = publicClientFor(network);
  const results = await client.multicall({
    contracts: tokenizedEquities.tokens.map((t) => ({
      address: t.address as `0x${string}`,
      abi: balanceOfAbi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })),
    allowFailure: true,
  });

  const held: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "success" && (r.result as bigint) > 0n) {
      held.push(tokenizedEquities.tokens[i].ticker);
    }
  });
  return held;
}

/**
 * Tickers this address has ever sent or received a transaction with,
 * derived from the same tx history already fetched for `txCount`/
 * `walletAgeDays` — no extra network call. `base-sepolia` always returns
 * [] (see `tokenizedEquityHoldingsFor` above; same reasoning).
 */
function tokenizedEquityInteractionsFrom(network: NetworkName, history: ExplorerTx[]): string[] {
  if (network !== "base") return [];

  const byAddress = new Map(tokenizedEquities.tokens.map((t) => [t.address.toLowerCase(), t.ticker]));
  const matched = new Set<string>();
  for (const tx of history) {
    const toTicker = tx.to && byAddress.get(tx.to.toLowerCase());
    if (toTicker) matched.add(toTicker);
    const fromTicker = tx.from && byAddress.get(tx.from.toLowerCase());
    if (fromTicker) matched.add(fromTicker);
  }
  return [...matched];
}

/**
 * Pure scoring formula, deliberately separated from the network-fetching
 * logic below so it's unit-testable without an RPC/BaseScan dependency;
 * everything else in this codebase that touches the network inherits the
 * public Base Sepolia RPC's observed flakiness (see DECISION_LOG.md); this
 * function can't, by construction.
 *
 * `score` is 0-100 risk (higher = riskier). Age/activity/diversity reduce
 * risk (an established, active, diverse wallet looks less like a fresh
 * throwaway/sybil address); flagged membership forces risk to the top of
 * the range regardless of the other signals.
 */
export function scoreFromSignals(signals: RiskSignals): number {
  // Trust sub-score (0-100), each signal capped so no single one dominates.
  const ageTrust = Math.min(40, signals.walletAgeDays / 3); // ~120+ days -> full 40
  const activityTrust = Math.min(30, signals.txCount);
  const diversityTrust = Math.min(30, signals.uniqueContractInteractions * 3);
  const trust = Math.min(100, ageTrust + activityTrust + diversityTrust);

  let score = Math.round(100 - trust);
  if (signals.flagged) score = Math.max(score, 95);
  return Math.max(0, Math.min(100, score));
}

/**
 * v0 risk heuristic. NOT a complete risk model: see docs/TECHNICAL_SPEC.md
 * "Known v0 limitation" framing for the scoring signals themselves (the
 * flag list is bundled separately and versioned; see flagged-addresses.json).
 */
export async function computeRiskScore(network: NetworkName, address: string): Promise<RiskResult> {
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }

  const client = publicClientFor(network);

  const [txCount, history, tokenizedEquityHoldings] = await Promise.all([
    client.getTransactionCount({ address: address as `0x${string}` }),
    fetchTxHistory(network, address),
    tokenizedEquityHoldingsFor(network, address),
  ]);

  let walletAgeDays = 0;
  if (history.length > 0) {
    const firstTs = Number(history[0].timeStamp) * 1000;
    walletAgeDays = Math.max(0, Math.floor((Date.now() - firstTs) / 86_400_000));
  }

  const uniqueTo = new Set<string>();
  for (const tx of history) {
    if (tx.to && tx.input && tx.input !== "0x") {
      uniqueTo.add(tx.to.toLowerCase());
    }
  }
  const uniqueContractInteractions = uniqueTo.size;

  const flagged = isFlagged(address);

  const tokenizedEquityInteractions = tokenizedEquityInteractionsFrom(network, history);
  const tokenizedEquityExposure = [...new Set([...tokenizedEquityHoldings, ...tokenizedEquityInteractions])].sort();

  const signals: RiskSignals = {
    walletAgeDays,
    txCount,
    uniqueContractInteractions,
    flagged,
    tokenizedEquityExposure,
  };

  return { score: scoreFromSignals(signals), signals };
}
