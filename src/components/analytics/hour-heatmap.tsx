import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/** 7×24 grid of inbound message counts (rows Mon..Sun, local hours). */
export function HourHeatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="min-w-[560px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))" }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-[9px] text-slate-400 text-center tabular-nums">{h % 3 === 0 ? hourLabel(h) : ""}</span>
          ))}
          {data.map((row, d) => (
            <div key={DAYS[d]} className="contents">
              <span className="text-[10px] font-medium text-slate-500 flex items-center">{DAYS[d]}</span>
              {row.map((v, h) => {
                const intensity = v / max;
                return (
                  <div key={h}
                    title={`${DAYS[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${v.toLocaleString("en-IN")} inbound`}
                    className={cn("aspect-square rounded-[4px] min-h-[14px]", v === 0 && "bg-slate-50")}
                    style={v > 0 ? { background: `rgba(37, 211, 102, ${0.12 + intensity * 0.88})` } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
          Less
          {[0, 0.25, 0.5, 0.75, 1].map((i) => (
            <span key={i} className="w-3 h-3 rounded-[3px]" style={{ background: i === 0 ? "#f8fafc" : `rgba(37, 211, 102, ${0.12 + i * 0.88})` }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
