import Link from "next/link";

const CARDS = [
  {
    href: "/admin",
    title: "Admin",
    desc: "Competitions, schools, access codes, question bank, rules, audit logs.",
    tint: "from-[#f2c14e]/20 to-transparent",
  },
  {
    href: "/gm",
    title: "Game Master",
    desc: "Run the live match: turns, timers, reveals, judging, overrides.",
    tint: "from-[#4f7cff]/20 to-transparent",
  },
  {
    href: "/screen",
    title: "Main Screen",
    desc: "Projector view for the venue: now playing, question, timer, leaderboard.",
    tint: "from-[#34d399]/20 to-transparent",
  },
  {
    href: "/join",
    title: "School Access",
    desc: "Contestants join with their school access code and play their turn.",
    tint: "from-[#fbbf24]/20 to-transparent",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="w-full max-w-5xl">
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-muted uppercase">
            <span className="live-dot" /> Live event control
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fassa.png"
              alt="FAASSA crest"
              className="qcard-in h-20 w-20 rounded-full border-2 border-line object-contain shadow-xl sm:h-24 sm:w-24"
            />
            <div className="min-w-0">
              <div className="mb-1 text-xs font-bold tracking-[0.2em] text-accent uppercase">
                Faculty of Science · University of Ibadan
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Inter-Varsity Competition Platform
              </h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-muted">
            Live inter-varsity quiz &amp; competition control for the Faculty of
            Science. Turn-by-turn, server-authoritative scoring, timers, and
            leaderboards — every screen in sync.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`panel group bg-gradient-to-br ${card.tint} p-6 transition-transform hover:-translate-y-0.5`}
            >
              <div className="text-lg font-bold">{card.title}</div>
              <div className="mt-1 text-sm text-muted">{card.desc}</div>
              <div className="mt-4 text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Open →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
