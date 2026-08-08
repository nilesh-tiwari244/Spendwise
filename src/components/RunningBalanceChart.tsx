import React from 'react';

interface RunningBalanceChartProps {
  points: { date: string; balance: number }[];
}

// Matches the +/- coloring Summary already uses for category totals
// (text-rose-600 / text-emerald-600), so the chart reads the same way.
const ROSE = '#e11d48';
const EMERALD = '#059669';
const ZINC = '#18181b';

export function RunningBalanceChart({ points }: RunningBalanceChartProps) {
  if (points.length < 2) return null;

  const width = 600;
  const height = 140;
  const padL = 16, padR = 16, padT = 16, padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const balances = points.map(p => p.balance);
  const minB = Math.min(0, ...balances);
  const maxB = Math.max(0, ...balances);
  const range = maxB - minB || 1;

  const xFor = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (b: number) => padT + innerH - ((b - minB) / range) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.balance).toFixed(1)}`)
    .join(' ');
  const zeroY = yFor(0);

  const lastBalance = points[points.length - 1].balance;
  const lineColor = lastBalance > 0 ? EMERALD : lastBalance < 0 ? ROSE : ZINC;

  const firstDate = new Date(points[0].date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const lastDate = new Date(points[points.length - 1].date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  return (
    <div className="brutal-card bg-white p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
        role="img"
        aria-label="Running balance over time"
      >
        <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="#d4d4d8" strokeWidth="1" strokeDasharray="4 3" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xFor(points.length - 1)} cy={yFor(lastBalance)} r="4" fill={lineColor} stroke="white" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between text-[9px] font-black uppercase text-zinc-400 mt-1 px-1">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}
