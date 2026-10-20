"use client";

import { useState, useEffect } from "react";

export type SchoolSlide = {
  schoolId: string;
  name: string;
  abbreviation?: string | null;
  logoUrl?: string | null;
  score: number;
  quizScore?: number;
  turnScore?: number;
  isPlaying: boolean;
  qualification?: string;
};

export type SchoolSliderProps = {
  schools: SchoolSlide[];
  currentSchoolId?: string | null;
  showQuizScore?: boolean;
  showTurnScore?: boolean;
  className?: string;
};

export default function SchoolSlider({
  schools,
  currentSchoolId,
  showQuizScore = false,
  showTurnScore = false,
  className = "",
}: SchoolSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceTimeout, setAutoAdvanceTimeout] = useState<NodeJS.Timeout | null>(null);

  const activeIndex = currentSchoolId
    ? schools.findIndex((s) => s.schoolId === currentSchoolId)
    : currentIndex;

  const activeSchool = schools[activeIndex];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === schools.length - 1;

  useEffect(() => {
    if (autoAdvance && !isLast) {
      const timer = setTimeout(() => {
        setCurrentIndex((prev) => Math.min(prev + 1, schools.length - 1));
      }, 3000);
      setAutoAdvanceTimeout(timer);
      return () => clearTimeout(timer);
    }
    setAutoAdvance(false);
  }, [activeIndex, autoAdvance, isLast, schools.length]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeout) clearTimeout(autoAdvanceTimeout);
    };
  }, [autoAdvanceTimeout]);

  const prev = () => {
    if (!isFirst) setCurrentIndex((prev) => prev - 1);
  };

  const next = () => {
    if (!isLast) setCurrentIndex((prev) => prev + 1);
  };

  if (!activeSchool ||schools.length === 0) {
    return (
      <div className={`school-slider w-full max-w-md mx-auto ${className}`}>
        <div className="rounded-xl border border-line bg-panel-2 p-6 text-center text-muted">
          Loading schools...
        </div>
      </div>
    );
  }

  return (
    <div className={`school-slider w-full max-w-md mx-auto ${className}`}>
      <div className="relative rounded-2xl border-2 border-accent/30 bg-gradient-to-b from-panel to-panel-2 p-6 shadow-2xl">
        <div className="absolute -top-2 right-3">
          <span className="chip chip-ready text-xs">
            Turn {activeIndex + 1} of {schools.length}
          </span>
        </div>

        {activeSchool.logoUrl ? (
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-panel-2 mx-auto">
            <img
              src={activeSchool.logoUrl}
              alt={activeSchool.name}
              className="h-16 w-16 rounded-full object-contain"
            />
          </div>
        ) : (
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-accent/20 mx-auto text-2xl font-black text-accent">
            {(activeSchool.abbreviation ?? activeSchool.name).slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="mb-3 text-center">
          <div className="text-sm font-bold tracking-widest text-muted uppercase">
            {activeSchool.abbreviation ?? activeSchool.name}
          </div>
          <h3 className="text-xl font-black">{activeSchool.name}</h3>
        </div>

        <div className="flex items-center justify-center gap-6">
          {showTurnScore && (
            <div className="text-center">
              <div className="text-xs text-muted mb-1">Turn</div>
              <div className="text-2xl font-black text-accent">
                {activeSchool.turnScore ?? 0}
              </div>
            </div>
          )}
          {showQuizScore && (
            <div className="text-center">
              <div className="text-xs text-muted mb-1">Quiz</div>
              <div className="text-2xl font-bold">
                {activeSchool.quizScore ?? 0}
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-xs text-muted mb-1">Total</div>
            <div className="text-2xl font-mono font-black">
              {activeSchool.score}
            </div>
          </div>
        </div>

        {activeSchool.qualification && (
          <div className="mt-3 text-center">
            <span className={`chip ${qualificationChip(activeSchool.qualification)}`}>
              {activeSchool.qualification}
            </span>
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={prev}
            disabled={isFirst}
            className={`btn btn-ghost !px-3 !py-1.5 !text-xs ${isFirst ? "opacity-40" : ""}`}
          >
            ← Prev
          </button>
          <div className="flex gap-2">
            {schools.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-2 w-2 rounded-full transition-all ${
                  i === activeIndex
                    ? "w-6 bg-accent"
                    : "bg-line hover:bg-accent/50"
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            disabled={isLast}
            className={`btn btn-ghost !px-3 !py-1.5 !text-xs ${isLast ? "opacity-40" : ""}`}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function qualificationChip(status: string): string {
  switch (status) {
    case "QUALIFIED":
      return "rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-black text-good uppercase";
    case "ELIMINATED":
      return "rounded-full bg-bad/20 px-2 py-0.5 text-[10px] font-black text-bad uppercase";
    case "PENDING":
      return "rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-black text-warn uppercase";
    default:
      return "rounded-full bg-line px-2 py-0.5 text-[10px] font-black text-muted uppercase";
  }
}