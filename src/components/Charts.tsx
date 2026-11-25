import { useState } from 'react';
import { motion } from 'motion/react';

interface ClassBarDatum {
  label: string;
  value: number;
  sublabel?: string;
}

export function ClassBarChart({
  data,
  unit = '%',
  emptyText = 'Ma’lumotlar hali mavjud emas',
}: {
  data: ClassBarDatum[];
  unit?: string;
  emptyText?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(100, ...data.map((d) => d.value));

  return (
    <div className="w-full">
      <div className="h-56 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-slate-200">
        {data.map((item, idx) => {
          const heightPct = Math.max(4, Math.min(100, (item.value / maxVal) * 100));
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center justify-end h-full relative group"
            >
              {isHovered && (
                <div className="absolute -top-2 z-10 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none tabular-nums">
                  {item.label}: {item.value}
                  {unit}
                  {item.sublabel ? ` (${item.sublabel})` : ''}
                </div>
              )}
              <div className="w-full max-w-[44px] h-full flex items-end justify-center">
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.45, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: `${heightPct}%`, transformOrigin: 'bottom' }}
                  className={`w-full rounded-t-lg transition-colors duration-150 ${
                    isHovered
                      ? 'bg-indigo-600'
                      : 'bg-gradient-to-t from-slate-900 via-slate-800 to-sky-600'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 px-2 pt-2.5">
        {data.map((item) => (
          <div key={item.label} className="flex-1 text-center truncate">
            <span className="text-xs font-medium text-slate-600 tabular-nums">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GradeSegment {
  grade: string;
  label: string;
  count: number;
  color: string;
}

export function GradeDistributionChart({
  grades,
}: {
  grades: { '5': number; '4': number; '3': number; '2': number };
}) {
  const total = grades['5'] + grades['4'] + grades['3'] + grades['2'];
  const segments: GradeSegment[] = [
    { grade: '5', label: 'A’lo (5)', count: grades['5'], color: '#0284C7' },
    { grade: '4', label: 'Yaxshi (4)', count: grades['4'], color: '#4F46E5' },
    { grade: '3', label: 'Qoniqarli (3)', count: grades['3'], color: '#64748B' },
    { grade: '2', label: 'Qoniqarsiz (2)', count: grades['2'], color: '#E11D48' },
  ];

  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
        Baholar statistikasi uchun natijalar kutilmoqda
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      <div className="relative w-40 h-40 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="16" />
          {segments.map((seg) => {
            if (seg.count === 0) return null;
            const dash = (seg.count / total) * circumference;
            const offset = cumulativeOffset;
            cumulativeOffset += dash;
            return (
              <motion.circle
                key={seg.grade}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900 tabular-nums font-display">{total}</span>
          <span className="text-xs text-slate-500">natija</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {segments.map((seg) => {
          const pct = Math.round((seg.count / total) * 100);
          return (
            <div key={seg.grade} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{seg.label}</span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {seg.count} ta ({pct}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
