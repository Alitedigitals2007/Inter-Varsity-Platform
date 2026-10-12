"use client";

// Per-role onboarding guide (spec §2 roles + §3 interfaces).
// Shown on each role's landing/dashboard so a first-time user knows:
//   • what their role is responsible for,
//   • what their screen shows,
//   • what to do first.
//
// Usage: <RoleGuide role="ADMIN" />

import { useState } from "react";

export type RoleKey = "ADMIN" | "GAME_MASTER" | "SCHOOL" | "PUBLIC";

type Step = { title: string; body: string };

type RoleDoc = {
  label: string;
  tagline: string;
  responsibilities: string[];
  viewShows: string[];
  firstSteps: Step[];
};

const GUIDES: Record<RoleKey, RoleDoc> = {
  ADMIN: {
    label: "Administrator",
    tagline: "You set up and oversee the whole competition.",
    responsibilities: [
      "Create competitions, rounds, and matches.",
      "Register schools and generate their access codes.",
      "Add questions to the question bank and review them.",
      "Create Game Master accounts and reset anyone's password.",
      "Configure scoring rules and override scores when needed.",
      "Review the audit trail of who changed what.",
    ],
    viewShows: [
      "Overview dashboard of competitions, schools, and live matches.",
      "Schools, competitions, and rounds management.",
      "Question bank by category and round.",
      "Access codes: generate, regenerate, revoke, expire.",
      "Users: create Admin / Game Master accounts and reset passwords.",
      "Audit log of all sensitive actions.",
    ],
    firstSteps: [
      { title: "Create a competition", body: "Go to Competitions → New competition, then add rounds and matches." },
      { title: "Register schools", body: "Go to Schools → add each participating university." },
      { title: "Add questions", body: "Go to Questions → create categories and paste in the question set." },
      { title: "Issue access codes", body: "Go to Access Codes → pick a school and competition, then share the code with that school's device." },
      { title: "Hand off to the Game Master", body: "The Game Master runs the live match from the /gm dashboard." },
    ],
  },
  GAME_MASTER: {
    label: "Game Master",
    tagline: "You run the live match, turn by turn.",
    responsibilities: [
      "Start, pause, and resume matches.",
      "Control the timer for each turn.",
      "Reveal questions and accept answers.",
      "Judge answers correct/incorrect and award bonuses.",
      "Advance rounds and finish the match.",
      "View the live leaderboard and standings.",
    ],
    viewShows: [
      "The live match console with the current phase and timer.",
      "Turn order and which school is on the clock.",
      "The active question, reveal controls, and the answer key.",
      "Judge controls: correct / incorrect / bonus.",
      "Live scoreboard and leaderboard.",
    ],
    firstSteps: [
      { title: "Open your match", body: "Pick a READY or LIVE match from your dashboard." },
      { title: "Start the match", body: "Press Start — the timer and turn order begin." },
      { title: "Run each turn", body: "Reveal the question, run the timer, then judge the answer." },
      { title: "Finish and advance", body: "Close the match to advance the round and update the leaderboard." },
    ],
  },
  SCHOOL: {
    label: "School / Contestant",
    tagline: "You answer on behalf of your university.",
    responsibilities: [
      "Join the match with the access code from the organisers.",
      "Read the question when it is revealed.",
      "Submit your answer within the timer.",
      "See your team's score and standing.",
    ],
    viewShows: [
      "The current question for your turn (only when it's your turn).",
      "The countdown timer for your answer.",
      "Your school's score and the live leaderboard.",
      "Whether your last answer was accepted, pending, or rejected.",
    ],
    firstSteps: [
      { title: "Join with your code", body: "On /join, enter the access code the organisers gave your school." },
      { title: "Wait for your turn", body: "Your question appears only when it is your school's turn." },
      { title: "Answer before the buzzer", body: "Type your answer and submit before the timer hits zero." },
    ],
  },
  PUBLIC: {
    label: "Audience / Public Screen",
    tagline: "You display the live event for everyone at the venue.",
    responsibilities: [
      "Open the big screen view on the venue display.",
      "Follow the live match, scores, and leaderboard.",
    ],
    viewShows: [
      "The current question and timer, mirrored from the match.",
      "The live scoreboard for all schools.",
      "The leaderboard and round progress.",
      "No answer keys or controls — audience view is read-only.",
    ],
    firstSteps: [
      { title: "Open the screen", body: "Go to /screen (or /screen/[matchId]) on the venue display." },
      { title: "Keep it open", body: "The screen updates live — no refresh needed." },
    ],
  },
};

export default function RoleGuide({
  role,
  defaultOpen = false,
  title,
}: {
  role: RoleKey;
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const doc = GUIDES[role];

  return (
    <section className="panel mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="text-xs font-bold tracking-widest text-accent uppercase">
            {title ?? `${doc.label} guide`}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{doc.tagline}</span>
        </span>
        <span className="chip chip-draft shrink-0">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="grid gap-6 border-t border-line px-4 py-4 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
              Your responsibilities
            </h3>
            <ul className="space-y-1.5 text-sm">
              {doc.responsibilities.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
              What your view shows
            </h3>
            <ul className="space-y-1.5 text-sm">
              {doc.viewShows.map((v) => (
                <li key={v} className="flex gap-2">
                  <span className="text-accent-2">•</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">
              Getting started
            </h3>
            <ol className="space-y-2 text-sm">
              {doc.firstSteps.map((s, i) => (
                <li key={s.title} className="flex gap-2">
                  <span className="font-bold text-accent">{i + 1}.</span>
                  <span>
                    <span className="font-semibold">{s.title}</span>
                    <span className="text-muted"> — {s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
