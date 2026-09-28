// Two ways to run the interview without a confirmed private bond.
// 1. Development bypass: local only, refused when NODE_ENV=production.
// 2. Sepolia testnet mode: allowed on a deployed site, but only while the
//    configured chain is Sepolia, and always labelled on screen. Mainnet never.
export function testnetNoBondActive() {
  return (
    process.env.SEPOLIA_TESTNET_NO_BOND === "true" &&
    (process.env.NEXT_PUBLIC_STARKNET_CHAIN_ID || "SN_SEPOLIA") === "SN_SEPOLIA" &&
    (process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia") === "sepolia"
  );
}

export function devBypassActive() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND === "true";
}

export function bondBypassActive() {
  return devBypassActive() || testnetNoBondActive();
}

export function bondBypassReason() {
  if (devBypassActive()) {
    return "Development bypass is active. No bond is collected and no anonymity is claimed. This mode is refused in production.";
  }
  return "Sepolia testnet mode: no bond is collected on this test deployment, so the spam control is off and no anonymity is claimed for payments. This mode only works while the chain is Sepolia.";
}
