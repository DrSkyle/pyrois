import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateSimulatedBurnBps,
  formatBpsPercent,
  formatPyroAmount,
} from "../lib/pyrois";

interface BurnCurveChartProps {
  volumeTokens: number;
}

interface CurvePoint {
  volumeM: number;
  burnPct: number;
}

const CURVE_DATA: CurvePoint[] = Array.from({ length: 31 }, (_, index) => {
  const volumeM = index * 0.5;
  const bps = calculateSimulatedBurnBps(volumeM * 1_000_000);
  return {
    volumeM,
    burnPct: Number((bps / 100).toFixed(2)),
  };
});

export function BurnCurveChart({ volumeTokens }: BurnCurveChartProps) {
  const clampedTokens = Math.max(0, Math.min(15_000_000, volumeTokens));
  const activeVolumeM = clampedTokens / 1_000_000;
  const activeBps = calculateSimulatedBurnBps(clampedTokens);
  const activeBurnPct = Number((activeBps / 100).toFixed(2));

  return (
    <div
      className="burn-curve-shell"
      role="img"
      aria-label={`Pyrois 1-hour sell burn curve. At ${activeVolumeM.toFixed(1)} million PYRO volume, sell burn is ${formatBpsPercent(activeBps)}.`}
    >
      <ResponsiveContainer width="100%" height={248}>
        <AreaChart
          data={CURVE_DATA}
          margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-rule)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="volumeM"
            type="number"
            domain={[0, 15]}
            ticks={[0, 1, 5, 10, 15]}
            tickFormatter={(value: number) => (value === 0 ? "0" : `${value}M`)}
            stroke="var(--color-rule)"
            tick={{
              fill: "var(--color-muted)",
              fontSize: 12,
              fontFamily: "var(--font-outlier)",
            }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 5.5]}
            ticks={[0.5, 2.5, 5]}
            tickFormatter={(value: number) => `${value.toFixed(1)}%`}
            stroke="var(--color-rule)"
            tick={{
              fill: "var(--color-muted)",
              fontSize: 12,
              fontFamily: "var(--font-outlier)",
            }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{
              stroke: "var(--color-muted)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
            contentStyle={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-rule)",
              borderRadius: "var(--radius-card)",
              fontFamily: "var(--font-outlier)",
              fontSize: "var(--text-xs)",
              color: "var(--color-ink)",
            }}
            labelFormatter={(value) =>
              `${formatPyroAmount(Number(value) * 1_000_000)} PYRO 1h volume`
            }
            formatter={(value) => [`${Number(value).toFixed(2)}%`, "Sell burn"]}
          />
          <ReferenceLine
            x={1}
            stroke="var(--color-rule)"
            strokeDasharray="2 4"
          />
          <ReferenceLine
            x={10}
            stroke="var(--color-rule)"
            strokeDasharray="2 4"
          />
          <Area
            type="linear"
            dataKey="burnPct"
            stroke="var(--color-ink)"
            strokeWidth={2}
            fill="var(--color-paper-3)"
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={activeVolumeM}
            stroke="var(--color-accent)"
            strokeDasharray="4 4"
          />
          <ReferenceDot
            x={activeVolumeM}
            y={activeBurnPct}
            r={6}
            fill="var(--color-accent)"
            stroke="var(--color-paper)"
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
