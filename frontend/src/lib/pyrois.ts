import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress,
  zeroAddress,
  type Address,
  type Chain,
} from "viem";
import { base, baseSepolia } from "viem/chains";

export const PYRO_DECIMALS = 18;
export const INITIAL_SUPPLY_TOKENS = 1_000_000_000;
export const MIN_SUPPLY_TOKENS = 100_000_000;
export const MAX_BURNABLE_TOKENS = INITIAL_SUPPLY_TOKENS - MIN_SUPPLY_TOKENS;
export const EPOCH_DURATION_SECONDS = 3_600;
export const MIN_BURN_BPS = 50;
export const MAX_BURN_BPS = 500;
export const BPS_DENOMINATOR = 10_000;
export const LOW_HEAT_VOLUME_TOKENS = 1_000_000;
export const HIGH_HEAT_VOLUME_TOKENS = 10_000_000;

export const PYROIS_ABI = [
  {
    type: "function",
    name: "getHeatState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "activeBurnBps", type: "uint256" },
      { name: "activeEpochVolume", type: "uint256" },
      { name: "secondsToCooldown", type: "uint256" },
      { name: "totalBurned", type: "uint256" },
      { name: "burnableLeft", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_SUPPLY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MIN_BURN_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_BURN_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const rawChainId = Number(import.meta.env.VITE_CHAIN_ID ?? 84532);
export const activeChain: Chain = rawChainId === base.id ? base : baseSepolia;

const rawAddress = (import.meta.env.VITE_PYROIS_ADDRESS ?? "").trim();
export const pyroisAddress: Address = isAddress(rawAddress)
  ? rawAddress
  : zeroAddress;
export const hasConfiguredContract = pyroisAddress !== zeroAddress;

const rpcOverride = (import.meta.env.VITE_RPC_URL ?? "").trim();

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(rpcOverride || undefined),
});

export const explorerBaseUrl =
  activeChain.id === base.id
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";

export const contractExplorerUrl = hasConfiguredContract
  ? `${explorerBaseUrl}/address/${pyroisAddress}`
  : explorerBaseUrl;

export const tradeUrl =
  (import.meta.env.VITE_TRADE_URL ?? "").trim() ||
  (hasConfiguredContract
    ? `https://app.uniswap.org/swap?chain=base&outputCurrency=${pyroisAddress}`
    : "https://app.uniswap.org/swap?chain=base");

export interface LiveHeatState {
  activeBurnBps: number;
  activeEpochVolume: number;
  secondsToCooldown: number;
  totalBurned: number;
  burnableLeft: number;
  owner: Address | null;
  synced: boolean;
}

export function getInitialHeatState(): LiveHeatState {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    activeBurnBps: MIN_BURN_BPS,
    activeEpochVolume: 0,
    secondsToCooldown: EPOCH_DURATION_SECONDS - (nowSec % EPOCH_DURATION_SECONDS),
    totalBurned: 0,
    burnableLeft: MAX_BURNABLE_TOKENS,
    owner: null,
    synced: false,
  };
}

export async function fetchLiveHeatState(): Promise<LiveHeatState> {
  if (!hasConfiguredContract) {
    return getInitialHeatState();
  }

  const [heatResult, ownerResult] = await Promise.all([
    publicClient.readContract({
      address: pyroisAddress,
      abi: PYROIS_ABI,
      functionName: "getHeatState",
    }),
    publicClient.readContract({
      address: pyroisAddress,
      abi: PYROIS_ABI,
      functionName: "owner",
    }),
  ]);

  const [activeBurnBps, activeEpochVolume, secondsToCooldown, totalBurned, burnableLeft] =
    heatResult;

  return {
    activeBurnBps: Number(activeBurnBps),
    activeEpochVolume: Number(formatUnits(activeEpochVolume, PYRO_DECIMALS)),
    secondsToCooldown: Number(secondsToCooldown),
    totalBurned: Number(formatUnits(totalBurned, PYRO_DECIMALS)),
    burnableLeft: Number(formatUnits(burnableLeft, PYRO_DECIMALS)),
    owner: ownerResult,
    synced: true,
  };
}

export async function fetchTokenBalance(account: Address): Promise<number | null> {
  if (!hasConfiguredContract) return null;
  const raw = await publicClient.readContract({
    address: pyroisAddress,
    abi: PYROIS_ABI,
    functionName: "balanceOf",
    args: [account],
  });
  return Number(formatUnits(raw, PYRO_DECIMALS));
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export async function connectInjectedWallet(): Promise<Address> {
  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!ethereum) {
    throw new Error("No browser wallet detected. Install Coinbase Wallet, MetaMask, or Rabby.");
  }

  const walletClient = createWalletClient({
    chain: activeChain,
    transport: custom(ethereum),
  });

  const addresses = await walletClient.requestAddresses();
  if (!addresses[0]) {
    throw new Error("Wallet connection returned no account.");
  }
  return addresses[0];
}

/**
 * Pure mirror of Pyrois.sol::_calculateBurnBps for the interactive simulator.
 */
export function calculateSimulatedBurnBps(epochVolumeTokens: number): number {
  if (epochVolumeTokens <= LOW_HEAT_VOLUME_TOKENS) {
    return MIN_BURN_BPS;
  }
  if (epochVolumeTokens >= HIGH_HEAT_VOLUME_TOKENS) {
    return MAX_BURN_BPS;
  }
  const ratio =
    (epochVolumeTokens - LOW_HEAT_VOLUME_TOKENS) /
    (HIGH_HEAT_VOLUME_TOKENS - LOW_HEAT_VOLUME_TOKENS);
  return Math.floor(MIN_BURN_BPS + (MAX_BURN_BPS - MIN_BURN_BPS) * ratio);
}

export function simulateSell(sellAmountTokens: number, priorEpochVolumeTokens: number) {
  const safeSell = Number.isFinite(sellAmountTokens) && sellAmountTokens > 0 ? sellAmountTokens : 0;
  const safePrior =
    Number.isFinite(priorEpochVolumeTokens) && priorEpochVolumeTokens > 0
      ? priorEpochVolumeTokens
      : 0;
  const effectiveVolume = safePrior + safeSell;
  const burnBps = calculateSimulatedBurnBps(effectiveVolume);
  const burned = (safeSell * burnBps) / BPS_DENOMINATOR;
  const received = Math.max(0, safeSell - burned);

  return {
    effectiveVolume,
    burnBps,
    burned,
    received,
  };
}

export function formatBpsPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatPyroAmount(amount: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function truncateAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
