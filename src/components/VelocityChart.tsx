import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import type { RepResult } from '../types/training';

interface VelocityChartProps {
  reps: RepResult[];
  isCalibrated: boolean;
}

export function VelocityChart({ reps, isCalibrated }: VelocityChartProps) {
  const data = reps.map((r) => ({
    name: `Rep ${r.repNumber}`,
    mean: parseFloat(r.meanConcentricVelocity.toFixed(3)),
    peak: parseFloat(r.peakConcentricVelocity.toFixed(3)),
  }));

  const unit = isCalibrated ? 'm/s' : 'rel';
  const avgVel = data.length > 0 ? data.reduce((s, d) => s + d.mean, 0) / data.length : 0;

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} unit={` ${unit}`} width={60} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#94a3b8' }}
          />
          <ReferenceLine y={avgVel} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'avg', fill: '#f59e0b', fontSize: 11 }} />
          <Bar dataKey="mean" name={`Mean (${unit})`} fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="peak" name={`Peak (${unit})`} fill="#22d3ee" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
