import {
  HIGH_HEAT_VOLUME_TOKENS,
  LOW_HEAT_VOLUME_TOKENS,
  MAX_BURN_BPS,
  MIN_BURN_BPS,
  calculateSimulatedBurnBps,
  formatBpsPercent,
} from "../lib/pyrois";

interface BurnCurveChartProps {
  volumeTokens: number;
}

const MAX_CHART_VOLUME = 15_000_000;
const PLOT_LEFT = 62;
const PLOT_RIGHT = 440;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 216;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

function xForVolume(volume: number): number {
  const clamped = Math.max(0, Math.min(MAX_CHART_VOLUME, volume));
  return PLOT_LEFT + (clamped / MAX_CHART_VOLUME) * PLOT_WIDTH;
}

function yForBps(bps: number): number {
  const ratio = bps / MAX_BURN_BPS;
  return PLOT_BOTTOM - ratio * PLOT_HEIGHT;
}

export function BurnCurveChart({ volumeTokens }: BurnCurveChartProps) {
  const activeBps = calculateSimulatedBurnBps(volumeTokens);
  const clampedVol = Math.max(0, Math.min(MAX_CHART_VOLUME, volumeTokens));

  const x0 = xForVolume(0);
  const xLow = xForVolume(LOW_HEAT_VOLUME_TOKENS);
  const xHigh = xForVolume(HIGH_HEAT_VOLUME_TOKENS);
  const xMax = xForVolume(MAX_CHART_VOLUME);

  const yMin = yForBps(MIN_BURN_BPS);
  const yMid = yForBps(250);
  const yMax = yForBps(MAX_BURN_BPS);

  const markerX = xForVolume(clampedVol);
  const markerY = yForBps(activeBps);

  const polylinePoints = `${x0},${yMin} ${xLow},${yMin} ${xHigh},${yMax} ${xMax},${yMax}`;

  return (
    <svg
      className="burn-curve-chart"
      viewBox="0 0 468 256"
      role="img"
      aria-label={`Pyrois 1-hour sell burn curve. At ${(clampedVol / 1_000_000).toFixed(1)} million PYRO volume, sell burn is ${formatBpsPercent(activeBps)}.`}
    >
      <line className="curve-grid-line" x1={PLOT_LEFT} y1={yMax} x2={PLOT_RIGHT} y2={yMax} />
      <line className="curve-grid-line" x1={PLOT_LEFT} y1={yMid} x2={PLOT_RIGHT} y2={yMid} />
      <line className="curve-grid-line" x1={PLOT_LEFT} y1={yMin} x2={PLOT_RIGHT} y2={yMin} />
      <line className="curve-grid-line" x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} />

      <text className="curve-axis-label" x={PLOT_LEFT - 10} y={yMax + 4} textAnchor="end">
        5.0%
      </text>
      <text className="curve-axis-label" x={PLOT_LEFT - 10} y={yMid + 4} textAnchor="end">
        2.5%
      </text>
      <text className="curve-axis-label" x={PLOT_LEFT - 10} y={yMin + 4} textAnchor="end">
        0.5%
      </text>

      <text className="curve-axis-label" x={x0} y={PLOT_BOTTOM + 22} textAnchor="start">
        0
      </text>
      <text className="curve-axis-label" x={xLow} y={PLOT_BOTTOM + 22} textAnchor="middle">
        1M
      </text>
      <text className="curve-axis-label" x={xHigh} y={PLOT_BOTTOM + 22} textAnchor="middle">
        10M
      </text>
      <text className="curve-axis-label" x={xMax} y={PLOT_BOTTOM + 22} textAnchor="end">
        15M PYRO
      </text>

      <polyline className="curve-path-base" points={polylinePoints} />

      <line
        className="curve-guide-line"
        x1={markerX}
        y1={markerY}
        x2={markerX}
        y2={PLOT_BOTTOM}
      />
      <circle className="curve-marker-outer" cx={markerX} cy={markerY} r={7} />
      <circle className="curve-marker-inner" cx={markerX} cy={markerY} r={3} />
    </svg>
  );
}
