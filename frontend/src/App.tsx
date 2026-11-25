import { useEffect, useState } from "react";
import { zeroAddress, type Address, type Hash } from "viem";
import { BurnCurveChart } from "./components/BurnCurveChart";
import {
  EPOCH_DURATION_SECONDS,
  MAX_BURNABLE_TOKENS,
  MIN_SUPPLY_TOKENS,
  activeChain,
  connectInjectedWallet,
  contractExplorerUrl,
  executePyroSellForEth,
  explorerBaseUrl,
  fetchLiveHeatState,
  fetchTokenBalance,
  formatBpsPercent,
  formatCountdown,
  formatPyroAmount,
  getInitialHeatState,
  hasConfiguredContract,
  pyroisAddress,
  simulateSell,
  tradeUrl,
  truncateAddress,
  type LiveHeatState,
} from "./lib/pyrois";

export function App() {
  const [heat, setHeat] = useState<LiveHeatState>(() => getInitialHeatState());
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletError, setWalletError] = useState<string>("");
  const [connecting, setConnecting] = useState<boolean>(false);

  const [sellInput, setSellInput] = useState<string>("100000");
  const [marketVolume, setMarketVolume] = useState<number>(2_500_000);
  const [selling, setSelling] = useState<boolean>(false);
  const [sellStage, setSellStage] = useState<string>("");
  const [sellError, setSellError] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchLiveHeatState();
        if (active) setHeat(next);
      } catch {
        // Keep last valid readout on transient RPC errors
      }
    };

    void load();
    const pollId = window.setInterval(() => {
      void load();
    }, 15_000);

    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setHeat((prev) => {
        if (prev.secondsToCooldown > 1) {
          return { ...prev, secondsToCooldown: prev.secondsToCooldown - 1 };
        }
        return {
          ...prev,
          secondsToCooldown: EPOCH_DURATION_SECONDS,
          activeEpochVolume: 0,
          activeBurnBps: prev.burnableLeft > 0 ? 50 : 0,
        };
      });
    }, 1_000);

    return () => window.clearInterval(tickId);
  }, []);

  const handleConnectWallet = async (): Promise<Address | null> => {
    setWalletError("");
    setConnecting(true);
    try {
      const account = await connectInjectedWallet();
      setWalletAddress(account);
      const balance = await fetchTokenBalance(account);
      setWalletBalance(balance);
      return account;
    } catch (err) {
      setWalletError(
        err instanceof Error ? err.message : "Unable to connect wallet."
      );
      return null;
    } finally {
      setConnecting(false);
    }
  };

  const handleSellOnChain = async () => {
    setSellError("");
    setSellStage("");
    setLastTxHash(null);

    const account = walletAddress ?? (await handleConnectWallet());
    if (!account) return;

    setSelling(true);
    try {
      const hash = await executePyroSellForEth(
        account,
        sellInput.replace(/,/g, "").trim(),
        (stage) => setSellStage(stage)
      );
      setLastTxHash(hash);
      setSellStage("");
      const [nextHeat, nextBal] = await Promise.all([
        fetchLiveHeatState(),
        fetchTokenBalance(account),
      ]);
      setHeat(nextHeat);
      setWalletBalance(nextBal);
    } catch (err) {
      setSellError(
        err instanceof Error ? err.message : "Sell transaction did not complete."
      );
      setSellStage("");
    } finally {
      setSelling(false);
    }
  };

  const parsedSellAmount = Number(sellInput.replace(/,/g, ""));
  const simulation = simulateSell(parsedSellAmount, marketVolume);
  const chartVolume = heat.synced ? heat.activeEpochVolume : simulation.effectiveVolume;
  const chartBurnBps = heat.synced ? heat.activeBurnBps : simulation.burnBps;

  const burnProgressRatio = Math.min(
    1,
    Math.max(0, heat.totalBurned / MAX_BURNABLE_TOKENS)
  );

  const ownershipDisplay = (() => {
    if (!hasConfiguredContract) {
      return "Not configured";
    }
    if (heat.owner === null) {
      return "Reading contract";
    }
    if (heat.owner === zeroAddress) {
      return "Renounced";
    }
    return truncateAddress(heat.owner);
  })();

  return (
    <>
      <header className="site-header">
        <div className="container nav-inner">
          <a href="#top" className="wordmark" aria-label="Pyrois home">
            Pyrois
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#heat" className="nav-link">
              Current heat
            </a>
            <a href="#curve" className="nav-link">
              The curve
            </a>
            <a href="#proof" className="nav-link">
              On-chain proof
            </a>
          </nav>
          <span className="nav-network">{activeChain.name}</span>
        </div>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="container hero-grid">
            <div className="hero-copy">
              <h1 id="hero-heading" className="hero-title">
                Pyrois.
              </h1>
              <p className="hero-subline">
                Calm markets burn softly. Panic dumps feed the fire.
              </p>

              <div className="hero-metric">
                <div className="hero-metric-row">
                  <span className="hero-metric-value">
                    {formatPyroAmount(heat.totalBurned)}&nbsp;PYRO burned
                  </span>
                  <span className="hero-metric-caption">
                    Toward {formatPyroAmount(MIN_SUPPLY_TOKENS)}&nbsp;PYRO floor
                  </span>
                </div>
                <div
                  className="burn-track"
                  role="progressbar"
                  aria-label="Permanent supply burned toward 100 million PYRO floor"
                  aria-valuenow={Math.round(burnProgressRatio * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="burn-fill"
                    style={{ transform: `scaleX(${Math.max(burnProgressRatio, 0.008)})` }}
                  />
                </div>
              </div>

              <div className="hero-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleConnectWallet()}
                  disabled={connecting}
                >
                  {walletAddress
                    ? truncateAddress(walletAddress)
                    : connecting
                      ? "Connecting…"
                      : "Connect Wallet"}
                </button>
                <a
                  href={tradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  Trade
                </a>
                <a
                  href={contractExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  BaseScan
                </a>
              </div>

              <p
                className={
                  walletError
                    ? "wallet-feedback wallet-feedback--error"
                    : "wallet-feedback"
                }
                role="status"
              >
                {walletError
                  ? walletError
                  : walletAddress && walletBalance !== null
                    ? `Wallet balance: ${formatPyroAmount(walletBalance, 2)} PYRO`
                    : !hasConfiguredContract
                      ? "Set VITE_PYROIS_ADDRESS to stream live contract telemetry."
                      : ""}
              </p>
            </div>

            <figure className="hero-figure">
              <BurnCurveChart volumeTokens={chartVolume} />
              <figcaption className="hero-figure-caption">
                <span>{heat.synced ? "Live 1-hour burn curve" : "1-hour burn curve"}</span>
                <span className="hero-figure-readout">
                  {formatBpsPercent(chartBurnBps)} sell burn
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="heat" className="heat-section" aria-labelledby="heat-heading">
          <div className="container">
            <div className="section-rule">
              <div className="section-header">
                <h2 id="heat-heading" className="section-heading">
                  Current heat
                </h2>
                <p className="section-note">
                  Each 1-hour epoch tracks AMM sell volume on-chain and cools back to 0.50% when the window rolls over.
                </p>
              </div>

              <div className="heat-grid">
                <div className="heat-cell">
                  <span className="heat-label">Sell burn rate</span>
                  <span className="heat-value heat-value--accent">
                    {formatBpsPercent(heat.activeBurnBps)}
                  </span>
                  <span className="heat-sub">0.50% calm to 5.00% peak</span>
                </div>

                <div className="heat-cell">
                  <span className="heat-label">1-hour sell volume</span>
                  <span className="heat-value">
                    {formatPyroAmount(heat.activeEpochVolume)}
                  </span>
                  <span className="heat-sub">PYRO sold in current epoch</span>
                </div>

                <div className="heat-cell">
                  <span className="heat-label">Window reset</span>
                  <span className="heat-value">
                    {formatCountdown(heat.secondsToCooldown)}
                  </span>
                  <span className="heat-sub">Until automatic reset to 0.50%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="curve" className="curve-section" aria-labelledby="curve-heading">
          <div className="container">
            <div className="section-header">
              <h2 id="curve-heading" className="section-heading">
                The curve
              </h2>
              <p className="section-note">
                Preview your exact burn across 1-hour market volume, or execute a fee-on-transfer sell directly on Base.
              </p>
            </div>

            <div className="simulator-layout">
              <div className="simulator-controls">
                <div className="field-group">
                  <div className="field-header">
                    <label htmlFor="sell-amount-input" className="field-label">
                      Sell amount (PYRO)
                    </label>
                    <span className="field-readout">
                      {formatPyroAmount(
                        Number.isFinite(parsedSellAmount) && parsedSellAmount > 0
                          ? parsedSellAmount
                          : 0
                      )}
                      &nbsp;PYRO
                    </span>
                  </div>
                  <input
                    id="sell-amount-input"
                    name="sellAmount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1000"
                    className="amount-input"
                    value={sellInput}
                    onChange={(event) => setSellInput(event.target.value)}
                  />
                  <span className="field-hint">
                    Buys and wallet transfers always incur 0% burn.
                  </span>
                </div>

                <div className="field-group">
                  <div className="field-header">
                    <label htmlFor="market-volume-slider" className="field-label">
                      1-hour market sell volume
                    </label>
                    <span className="field-readout">
                      {formatPyroAmount(marketVolume)}&nbsp;PYRO
                    </span>
                  </div>
                  <input
                    id="market-volume-slider"
                    name="marketVolume"
                    type="range"
                    min={0}
                    max={15_000_000}
                    step={100_000}
                    className="heat-slider"
                    value={marketVolume}
                    onChange={(event) => setMarketVolume(Number(event.target.value))}
                  />
                  <div className="slider-scale" aria-hidden="true">
                    <span>0</span>
                    <span>1M</span>
                    <span>10M</span>
                    <span>15M PYRO</span>
                  </div>
                </div>
              </div>

              <div className="simulator-output" aria-live="polite">
                <div className="sim-row">
                  <span className="sim-row-label">Effective burn rate</span>
                  <span className="sim-row-value sim-row-value--accent">
                    {formatBpsPercent(simulation.burnBps)}
                  </span>
                </div>
                <div className="sim-row">
                  <span className="sim-row-label">PYRO burned</span>
                  <span className="sim-row-value">
                    {formatPyroAmount(simulation.burned, 2)}&nbsp;PYRO
                  </span>
                </div>
                <div className="sim-row">
                  <span className="sim-row-label">PYRO received by pool</span>
                  <span className="sim-row-value">
                    {formatPyroAmount(simulation.received, 2)}&nbsp;PYRO
                  </span>
                </div>

                <div className="sim-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleSellOnChain()}
                    disabled={selling || !Number.isFinite(parsedSellAmount) || parsedSellAmount <= 0}
                  >
                    {selling ? "Submitting…" : "Sell PYRO for ETH"}
                  </button>
                  <p
                    className={
                      sellError
                        ? "wallet-feedback wallet-feedback--error"
                        : "wallet-feedback"
                    }
                    role="status"
                  >
                    {sellError ? (
                      sellError
                    ) : sellStage ? (
                      sellStage
                    ) : lastTxHash ? (
                      <a
                        href={`${explorerBaseUrl}/tx/${lastTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="proof-link"
                      >
                        Confirmed on BaseScan
                      </a>
                    ) : (
                      "Routes through Uniswap V2 Router02 on Base."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="proof" className="proof-section" aria-labelledby="proof-heading">
          <div className="container">
            <div className="section-header">
              <h2 id="proof-heading" className="section-heading">
                On-chain proof
              </h2>
              <p className="section-note">
                Immutable rules enforced directly inside Pyrois.sol with no fee wallet or pause switch.
              </p>
            </div>

            <table className="proof-table">
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col">Value</th>
                  <th scope="col">Verification</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Buy tax</th>
                  <td>0%</td>
                  <td className="proof-source">Immutable in _update</td>
                </tr>
                <tr>
                  <th scope="row">Sell burn range</th>
                  <td>0.50% to 5.00% (1h rolling)</td>
                  <td className="proof-source">MIN_BURN_BPS / MAX_BURN_BPS</td>
                </tr>
                <tr>
                  <th scope="row">Supply floor</th>
                  <td>100,000,000&nbsp;PYRO</td>
                  <td className="proof-source">MIN_SUPPLY constant</td>
                </tr>
                <tr>
                  <th scope="row">Minting</th>
                  <td>Disabled</td>
                  <td className="proof-source">Single genesis mint</td>
                </tr>
                <tr>
                  <th scope="row">Ownership</th>
                  <td>
                    {heat.owner && heat.owner !== zeroAddress ? (
                      <a
                        href={`${explorerBaseUrl}/address/${heat.owner}`}
                        target="_blank"
                        rel="noreferrer"
                        className="proof-link"
                      >
                        {ownershipDisplay}
                      </a>
                    ) : (
                      ownershipDisplay
                    )}
                  </td>
                  <td className="proof-source">Live owner() read</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span className="wordmark">Pyrois</span>
          <div className="footer-meta">
            <span>{activeChain.name}</span>
            <a
              href={contractExplorerUrl}
              target="_blank"
              rel="noreferrer"
              className="footer-address"
            >
              {hasConfiguredContract ? truncateAddress(pyroisAddress) : "BaseScan"}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;
