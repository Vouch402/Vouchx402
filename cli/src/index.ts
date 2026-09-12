#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { isAddress, type Address } from "viem";
import { getRiskScore, easExplorerUrl } from "vouch402-sdk";
import { loadKeystoreAccount } from "./keystore.js";

function printHelp(): void {
  console.log(`vouch402: evaluate an address's Vouch402 risk score

Usage:
  vouch402 score <address> --attest-jurisdiction [--base-url <url>] [--public]

Pays for and fetches a live risk score for a Base address, then
independently verifies the resulting attestation on EAS.

  --attest-jurisdiction   Required. Certifies that you are not located
             in, and are not paying on behalf of anyone in, Cuba, Iran,
             North Korea, Syria, the Russian-occupied regions of
             Ukraine, or mainland China. The API rejects the request
             outright without this: see the "Restricted Jurisdictions"
             section at https://www.vouch402.xyz/legal for the legal
             basis. This is the CLI's equivalent of the checkbox on the
             website's own "Try It" demo; there is no interactive
             prompt here on purpose, since this command is also run
             non-interactively/by scripts.

  --public   Make this result visible on Vouch402's public activity
             feed (address, score, and signals). Off by default:
             the result stays attestation-only, same as before this
             flag existed.

Requires a funded wallet, loaded from a Foundry keystore (never a raw
private key):
  VOUCH402_KEYSTORE_ACCOUNT    keystore name under ~/.foundry/keystores
  VOUCH402_KEYSTORE_PASSWORD   keystore password
  VOUCH402_KEYSTORE_JSON       (alternative) keystore file contents, inline
`);
}

function parseArgs(argv: string[]): {
  address?: string;
  baseUrl?: string;
  makePublic: boolean;
  jurisdictionAttestation: boolean;
} {
  const [, address] = argv;
  let baseUrl: string | undefined;
  const flagIndex = argv.indexOf("--base-url");
  if (flagIndex !== -1) baseUrl = argv[flagIndex + 1];
  const makePublic = argv.includes("--public");
  const jurisdictionAttestation = argv.includes("--attest-jurisdiction");
  return { address, baseUrl, makePublic, jurisdictionAttestation };
}

/**
 * Everything `main()` needs to decide, with zero side effects — no
 * `process.exit`, no console output, no keystore/network access. Kept
 * separate so it's directly unit-testable (see `test/cli.test.ts`),
 * unlike `main()` itself which reads `process.argv` and terminates the
 * process.
 */
export type ParsedCommand =
  | { kind: "help"; exitCode: 0 | 1 }
  | { kind: "error"; message: string; showHelp?: boolean }
  | {
      kind: "score";
      address: Address;
      baseUrl?: string;
      makePublic: boolean;
      jurisdictionAttestation: boolean;
    };

export function resolveCommand(argv: string[]): ParsedCommand {
  // Checked first, against the *entire* arg list, not just the command
  // position -- `vouch402 score --help` used to have `--help` consumed
  // as the <address> positional instead of printing help.
  if (argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help", exitCode: 0 };
  }

  const [command, ...rest] = argv;
  if (!command) {
    return { kind: "help", exitCode: 1 };
  }

  if (command !== "score") {
    return { kind: "error", message: `Unknown command: ${command}`, showHelp: true };
  }

  const { address, baseUrl, makePublic, jurisdictionAttestation } = parseArgs(["score", ...rest]);
  if (!address) {
    return { kind: "error", message: "Usage: vouch402 score <address> --attest-jurisdiction" };
  }
  // Checked before anything that costs money: a typo'd address should
  // fail instantly here, not after paying for a real x402 request.
  if (!isAddress(address)) {
    return { kind: "error", message: `Invalid address: ${address}` };
  }
  if (!jurisdictionAttestation) {
    return {
      kind: "error",
      message:
        "Missing required --attest-jurisdiction flag. Run with --help for what it certifies and why it's required; the API rejects the request outright without it.",
    };
  }

  return { kind: "score", address, baseUrl, makePublic, jurisdictionAttestation };
}

async function main(): Promise<void> {
  const parsed = resolveCommand(process.argv.slice(2));

  if (parsed.kind === "help") {
    printHelp();
    process.exit(parsed.exitCode);
  }
  if (parsed.kind === "error") {
    console.error(`${parsed.message}\n`);
    if (parsed.showHelp) printHelp();
    process.exit(1);
  }

  const account = loadKeystoreAccount();
  console.log(`Paying from ${account.address}...`);

  const result = await getRiskScore(parsed.address, account, {
    baseUrl: parsed.baseUrl,
    makePublic: parsed.makePublic,
    jurisdictionAttestation: parsed.jurisdictionAttestation,
  });

  console.log("");
  console.log(`Address:         ${result.address}`);
  console.log(`Score:           ${result.score}`);
  console.log(`Signals:         ${JSON.stringify(result.signals)}`);
  console.log(`Payment tx:      ${result.txHash}`);
  console.log(`Attestation UID: ${result.attestationUid}`);
  console.log(`Verified:        ${result.attestation ? "yes (resolved independently via EAS)" : "no"}`);
  console.log(`Explorer:        ${easExplorerUrl(result.network, result.attestationUid)}`);
}

// Only run when this file is the actual entry point (real `vouch402`
// CLI invocation), not when it's imported for its testable exports
// (`resolveCommand`) -- otherwise importing this module at all runs
// `main()` against whatever `process.argv` happens to be (e.g. a test
// runner's own args), which is exactly the kind of side effect
// `resolveCommand` was split out to avoid.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
