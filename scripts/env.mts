// Shared helpers for the Sepolia scripts. Run with:
//   node --experimental-strip-types --env-file-if-exists=.env.local scripts/<name>.mts
import { RpcProvider, Account, constants } from "starknet";

export const STRK_SEPOLIA = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
// zan.top answers every RPC 0.8+ method through starknet.js 10.4. drpc.org answered
// curl but returned -32601 for starknet_getClassHashAt through starknet.js on 2026-09-28.
export const PUBLIC_RPCS = ["https://api.zan.top/public/starknet-sepolia", "https://starknet-sepolia.drpc.org"];

export function env(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local or the environment.`);
    process.exit(2);
  }
  return value;
}

export function rpcUrl() {
  return process.env.STARKNET_SEPOLIA_RPC_URL || PUBLIC_RPCS[0];
}

export function rpc() {
  return new RpcProvider({ nodeUrl: rpcUrl() });
}

export async function assertSepolia(provider: RpcProvider) {
  const chainId = await provider.getChainId();
  if (chainId !== constants.StarknetChainId.SN_SEPOLIA) {
    console.error(`RPC chain id is ${chainId}, expected SN_SEPOLIA. Refusing to continue.`);
    process.exit(3);
  }
  return chainId;
}

export function publisher(provider: RpcProvider) {
  return new Account({
    provider,
    address: env("STARKNET_PUBLISHER_ADDRESS"),
    signer: env("STARKNET_PUBLISHER_PRIVATE_KEY"),
  });
}

export function short(hex: string) {
  return hex.length > 18 ? `${hex.slice(0, 10)}...${hex.slice(-6)}` : hex;
}
