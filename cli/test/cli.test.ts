import { describe, expect, it } from "vitest";
import { resolveCommand } from "../src/index.js";

// A real, correctly-checksummed Base address (this project's own real
// dev/test wallet, already public elsewhere in this repo) -- used only
// as "a valid address", never anything that actually pays.
const VALID_ADDRESS = "0x53a79B109fa77c05B043e73A284a22b57c6263b0";

describe("resolveCommand", () => {
  it("shows help, exit 1, when called with no arguments at all", () => {
    expect(resolveCommand([])).toEqual({ kind: "help", exitCode: 1 });
  });

  it("shows help, exit 0, for --help as the first argument", () => {
    expect(resolveCommand(["--help"])).toEqual({ kind: "help", exitCode: 0 });
  });

  it("shows help, exit 0, for -h as the first argument", () => {
    expect(resolveCommand(["-h"])).toEqual({ kind: "help", exitCode: 0 });
  });

  it("shows help, exit 0, for --help placed AFTER the subcommand (the actual bug)", () => {
    // This is the exact repro from the issue: `vouch402 score --help`
    // used to have `--help` consumed as the <address> positional
    // instead of printing help.
    expect(resolveCommand(["score", "--help"])).toEqual({ kind: "help", exitCode: 0 });
  });

  it("shows help, exit 0, for --help mixed in with other real-looking flags", () => {
    expect(resolveCommand(["score", VALID_ADDRESS, "--attest-jurisdiction", "--help"])).toEqual({
      kind: "help",
      exitCode: 0,
    });
  });

  it("rejects an unknown command, with help shown", () => {
    const result = resolveCommand(["not-a-real-command"]);
    expect(result).toEqual({
      kind: "error",
      message: "Unknown command: not-a-real-command",
      showHelp: true,
    });
  });

  it("rejects `score` with no address at all", () => {
    const result = resolveCommand(["score"]);
    expect(result).toEqual({
      kind: "error",
      message: "Usage: vouch402 score <address> --attest-jurisdiction",
    });
  });

  it("rejects a malformed address BEFORE checking --attest-jurisdiction", () => {
    // Deliberately omits --attest-jurisdiction too, to prove the address
    // check fires first -- the real bug this issue is about is that a
    // bad address used to sail past every check all the way to a real,
    // paid request. The address error must win regardless of what else
    // is missing.
    const result = resolveCommand(["score", "0xnotarealaddress"]);
    expect(result).toEqual({
      kind: "error",
      message: "Invalid address: 0xnotarealaddress",
    });
  });

  it("rejects a well-formed-length but invalid-checksum address", () => {
    // Same length and hex charset as VALID_ADDRESS, wrong case in the
    // checksum -- a real typo class a plain regex wouldn't catch.
    const badChecksum = "0x53A79b109fa77c05b043e73a284a22b57c6263b0";
    const result = resolveCommand(["score", badChecksum]);
    expect(result).toEqual({ kind: "error", message: `Invalid address: ${badChecksum}` });
  });

  it("accepts a valid lowercase (unchecksummed) address", () => {
    const result = resolveCommand(["score", VALID_ADDRESS.toLowerCase(), "--attest-jurisdiction"]);
    expect(result.kind).toBe("score");
  });

  it("rejects a valid address missing --attest-jurisdiction", () => {
    const result = resolveCommand(["score", VALID_ADDRESS]);
    expect(result).toEqual({
      kind: "error",
      message:
        "Missing required --attest-jurisdiction flag. Run with --help for what it certifies and why it's required; the API rejects the request outright without it.",
    });
  });

  it("resolves a fully valid score command with all fields", () => {
    const result = resolveCommand([
      "score",
      VALID_ADDRESS,
      "--attest-jurisdiction",
      "--base-url",
      "http://localhost:3402",
      "--public",
    ]);
    expect(result).toEqual({
      kind: "score",
      address: VALID_ADDRESS,
      baseUrl: "http://localhost:3402",
      makePublic: true,
      jurisdictionAttestation: true,
    });
  });
});
