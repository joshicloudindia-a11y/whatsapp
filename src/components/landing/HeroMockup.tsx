import Image from "next/image";
import { Icon } from "@/components/ui/icon";

type Msg =
  | { kind: "in" | "out"; text: string; time: string }
  | { kind: "buttons"; options: string[] };

const CHAT: Msg[] = [
  { kind: "in", text: "Namaste! Blue kurta M size mein available hai?", time: "10:42" },
  { kind: "out", text: "Haan ji! Blue kurta (M) stock mein hai. ₹799 · Free delivery in Jaipur.", time: "10:42" },
  { kind: "buttons", options: ["Buy now", "Aur colours dikhao"] },
  { kind: "in", text: "Buy now", time: "10:43" },
  { kind: "out", text: "Order #CF1042 ready. ₹799 · UPI payment link bhej diya.", time: "10:43" },
];

/** Animated phone + photo composition used in the hero. Pure CSS animation (respects reduced motion). */
export function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[540px] pt-10 sm:pt-0 lg:max-w-none">
      {/* Glow */}
      <div aria-hidden className="absolute -inset-10 rounded-full bg-[#25D366]/20 blur-3xl" />

      {/* Photo card behind the phone (tablet and up) */}
      <div className="hidden sm:block absolute left-0 top-12 bottom-12 w-[56%] overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
        <Image
          src="/images/auth/login.jpg"
          alt="Indian woman in a kurta smiling while replying to customers on her phone"
          fill
          fetchPriority="high"
          loading="eager"
          sizes="(min-width: 1024px) 300px, 56vw"
          className="object-cover"
          style={{ objectPosition: "center 65%" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-3">
          <p className="text-[11px] text-slate-200">Today on WhatsApp</p>
          <p className="text-lg font-bold text-white">₹48,200 <span className="text-xs font-semibold text-[#25D366]">in UPI orders</span></p>
        </div>
      </div>

      {/* Phone */}
      <div className="relative mx-auto sm:mr-0 w-[min(300px,100%)] rounded-[2.6rem] border border-white/15 bg-slate-900 p-2.5 shadow-2xl shadow-black/50">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#efeae2]">
          {/* Chat header */}
          <div className="flex items-center gap-2.5 bg-[#075E54] px-3.5 pt-5 pb-3 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">SK</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-sm font-semibold leading-5">
                <span className="truncate">Sharma Kurtis</span>
                <Icon name="verified" filled className="w-4 h-4 shrink-0 text-[#25D366]" title="Verified business" />
              </p>
              <p className="text-[11px] text-white/75">Business account · online</p>
            </div>
            <Icon name="videocam" className="w-4 h-4 text-white/85" />
            <Icon name="call" className="w-4 h-4 text-white/85" />
          </div>

          {/* Messages */}
          <div className="flex min-h-[360px] flex-col gap-2 px-3 py-4" aria-label="Example WhatsApp conversation" role="img">
            <p className="mx-auto rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-600">TODAY</p>
            {CHAT.map((m, i) => {
              const delay = { animationDelay: `${0.3 + i * 0.7}s` };
              if (m.kind === "buttons") {
                return (
                  <div key={i} className="landing-msg ml-auto flex w-[82%] flex-col gap-1" style={delay}>
                    {m.options.map((o) => (
                      <span key={o} className="flex items-center justify-center gap-1 rounded-lg bg-white py-1.5 text-[12px] font-semibold text-sky-700 shadow-sm">
                        <Icon name="reply" className="w-3.5 h-3.5" /> {o}
                      </span>
                    ))}
                  </div>
                );
              }
              const out = m.kind === "out";
              return (
                <div
                  key={i}
                  style={delay}
                  className={`landing-msg max-w-[82%] rounded-xl px-3 py-2 shadow-sm ${
                    out ? "ml-auto rounded-tr-sm bg-[#d9fdd3]" : "mr-auto rounded-tl-sm bg-white"
                  }`}
                >
                  <p className="text-[12.5px] leading-snug text-slate-800">{m.text}</p>
                  <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${out ? "text-green-800/70" : "text-slate-500"}`}>
                    {out && <span>ChatFlow bot ·</span>}
                    {m.time}
                    {out && <Icon name="done_all" className="w-3.5 h-3.5 text-sky-500" />}
                  </p>
                </div>
              );
            })}
            <div className="landing-msg mr-auto flex items-center gap-1 rounded-xl rounded-tl-sm bg-white px-3 py-2.5 shadow-sm" style={{ animationDelay: "4s" }}>
              {[0, 1, 2].map((d) => (
                <span key={d} className="landing-dot h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
            <span className="flex-1 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-500">Message</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-white">
              <Icon name="mic" className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Floating stat cards */}
      <div className="auth-float absolute left-0 top-0 sm:-left-4 sm:top-2 rounded-2xl border border-white/15 bg-slate-900/80 backdrop-blur-md px-3.5 py-2.5 shadow-xl">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <Icon name="campaign" className="w-3.5 h-3.5 text-[#25D366]" /> Diwali sale broadcast
        </p>
        <p className="mt-0.5 text-sm font-bold text-white">2,431 delivered · <span className="text-[#25D366]">71% read</span></p>
      </div>
      <div
        className="auth-float absolute -right-1 bottom-[4.25rem] sm:right-auto sm:-left-4 sm:bottom-auto sm:top-[42%] rounded-2xl border border-white/15 bg-white/95 px-3.5 py-2.5 shadow-xl"
        style={{ animationDelay: "1.5s" }}
      >
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <Icon name="smart_toy" className="w-3.5 h-3.5 text-violet-600" /> Bot reply time
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-sm font-bold text-slate-900">
          2 sec <Icon name="trending_up" className="w-4 h-4 text-green-600" />
        </p>
      </div>
    </div>
  );
}
