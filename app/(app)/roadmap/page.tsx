"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { apiUrl } from "@/lib/utils";

const PHASE_COLORS: Record<string, string> = {
  design: "#94a3b8",
  execution: "#1B6CA8",
  evaluation: "#f59e0b",
  closed: "#22c55e",
};

const PHASE_VARIANTS: Record<string, "slate" | "blue" | "amber" | "green"> = {
  design: "slate",
  execution: "blue",
  evaluation: "amber",
  closed: "green",
};

const MILESTONE_COLORS: Record<string, string> = {
  done: "#22c55e",
  missed: "#ef4444",
  pending: "#94a3b8",
};

const LABEL_W = 280;

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  );
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function dateToPct(date: Date, ganttStart: Date, totalMonths: number): number {
  const months = monthsBetween(ganttStart, startOfMonth(date));
  const dayFraction = (date.getDate() - 1) / 30;
  return Math.max(
    0,
    Math.min(100, ((months + dayFraction) / totalMonths) * 100),
  );
}

interface Milestone {
  id: string;
  name: string;
  dueDate: string;
  status: "pending" | "done" | "missed";
}

interface EnrichedPOC {
  _id: string;
  pocId: string;
  name?: string;
  auditId: string;
  phase: "design" | "execution" | "evaluation" | "closed";
  design?: {
    startDate?: string;
    deadlineDate?: string;
    measurableObjective?: string;
  };
  execution?: { milestones: Milestone[] };
  decision?: { decision?: string };
  audit?: { _id: string; name: string; client?: string } | null;
  useCase?: { _id: string; cuId: string; description?: string } | null;
  processId?: { procId?: string; name?: string } | null;
}

export default function GlobalRoadmapPage() {
  const [pocs, setPocs] = useState<EnrichedPOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<
    "all" | "design" | "execution" | "evaluation" | "closed"
  >("all");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const router = useRouter();

  useEffect(() => {
    fetch(apiUrl("/api/pocs"), { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setPocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );

  const datedPocs = pocs.filter(
    (p) => p.design?.startDate && p.design?.deadlineDate,
  );
  const phaseFiltered =
    phaseFilter === "all"
      ? datedPocs
      : datedPocs.filter((p) => p.phase === phaseFilter);

  let ganttStart: Date;
  let ganttEnd: Date;
  if (datedPocs.length > 0) {
    const allDates: Date[] = [];
    for (const p of datedPocs) {
      allDates.push(
        new Date(p.design!.startDate!),
        new Date(p.design!.deadlineDate!),
      );
      for (const ms of p.execution?.milestones ?? []) {
        if (ms.dueDate) allDates.push(new Date(ms.dueDate));
      }
    }
    ganttStart = startOfMonth(
      new Date(Math.min(...allDates.map((d) => d.getTime()))),
    );
    ganttEnd = startOfMonth(
      addMonths(new Date(Math.max(...allDates.map((d) => d.getTime()))), 1),
    );
  } else {
    ganttStart = startOfMonth(new Date());
    ganttEnd = startOfMonth(addMonths(new Date(), 3));
  }

  const totalMonths = Math.max(monthsBetween(ganttStart, ganttEnd), 1);
  const months: Date[] = Array.from({ length: totalMonths }, (_, i) =>
    addMonths(ganttStart, i),
  );

  const monthWidth = Math.floor(Math.max(containerWidth - LABEL_W, 0) / 3);
  const ganttW = monthWidth * totalMonths;

  const todayPct = dateToPct(new Date(), ganttStart, totalMonths);
  const showToday = todayPct >= 0 && todayPct <= 100;

  const auditGroups = new Map<
    string,
    { name: string; client?: string; pocs: EnrichedPOC[] }
  >();
  for (const poc of phaseFiltered) {
    const aid = poc.audit?._id ?? poc.auditId ?? "unknown";
    if (!auditGroups.has(aid)) {
      auditGroups.set(aid, {
        name: poc.audit?.name ?? "Unknown Audit",
        client: poc.audit?.client,
        pocs: [],
      });
    }
    auditGroups.get(aid)!.pocs.push(poc);
  }

  const phaseCounts = {
    all: datedPocs.length,
    design: datedPocs.filter((p) => p.phase === "design").length,
    execution: datedPocs.filter((p) => p.phase === "execution").length,
    evaluation: datedPocs.filter((p) => p.phase === "evaluation").length,
    closed: datedPocs.filter((p) => p.phase === "closed").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">
          Global Roadmap
        </h1>
        <p className="text-sm text-muted mt-0.5">
          POC timeline across all audits — {pocs.length} POCs
        </p>
      </div>

      {/* Phase filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          {(
            ["all", "design", "execution", "evaluation", "closed"] as const
          ).map((f) => (
            <button
              key={f}
              onClick={() => setPhaseFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${phaseFilter === f ? "bg-blue-aria text-white" : "text-muted hover:text-text"}`}
            >
              {f} ({phaseCounts[f]})
            </button>
          ))}
        </div>
      </div>

      {phaseFiltered.length === 0 ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No POCs with scheduled dates found.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="bg-white border border-border rounded-sm overflow-x-auto"
        >
          {/* Legend */}
          <div className="flex items-center gap-5 px-4 pt-3 pb-2 border-b border-border text-xs text-muted flex-wrap">
            <span className="font-medium text-text">Phases:</span>
            {Object.entries(PHASE_VARIANTS).map(([phase]) => (
              <div key={phase} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: PHASE_COLORS[phase] }}
                />
                <span className="capitalize">{phase}</span>
              </div>
            ))}
            <span className="ml-4 font-medium text-text">Milestones:</span>
            {[
              ["done", "#22c55e", "✓ Done"],
              ["pending", "#94a3b8", "◆ Pending"],
              ["missed", "#ef4444", "◆ Missed"],
            ].map(([k, c, l]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 inline-block rotate-45"
                  style={{ backgroundColor: c as string }}
                />
                <span>{l}</span>
              </div>
            ))}
          </div>

          <div style={{ width: LABEL_W + ganttW }}>
            {/* Month header */}
            <div className="flex border-b border-border sticky top-0 z-10 bg-white">
              <div
                className="flex-shrink-0 px-4 py-2 text-xs font-medium text-muted bg-slate-50 border-r border-border"
                style={{ width: LABEL_W }}
              >
                POC
              </div>
              <div className="flex" style={{ width: ganttW }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    style={{ width: monthWidth, flexShrink: 0 }}
                    className="py-2 px-1 text-center text-[10px] text-muted border-r border-border/40 bg-slate-50"
                  >
                    {formatMonth(m)}
                  </div>
                ))}
              </div>
            </div>

            {/* Audit groups */}
            {Array.from(auditGroups.entries()).map(([auditId, group]) => (
              <div key={auditId}>
                {/* Audit header row */}
                <div className="flex bg-slate-50/80 border-b border-border/40">
                  <div
                    className="flex-shrink-0 px-4 py-1.5 border-r border-border"
                    style={{ width: LABEL_W }}
                  >
                    <span className="text-[11px] font-bold text-text">
                      {group.name}
                    </span>
                    {group.client && (
                      <span className="text-[10px] text-muted ml-1.5">
                        · {group.client}
                      </span>
                    )}
                  </div>
                  <div className="flex" style={{ width: ganttW }}>
                    {months.map((_, i) => (
                      <div
                        key={i}
                        style={{ width: monthWidth, flexShrink: 0 }}
                        className="border-r border-border/10"
                      />
                    ))}
                  </div>
                </div>

                {/* POC rows */}
                {group.pocs.map((poc) => {
                  const start = new Date(poc.design!.startDate!);
                  const end = new Date(poc.design!.deadlineDate!);
                  const leftPct = dateToPct(start, ganttStart, totalMonths);
                  const rightPct = dateToPct(end, ganttStart, totalMonths);
                  const widthPct = Math.max(rightPct - leftPct, 0.5);

                  const milestones = (poc.execution?.milestones ?? []).filter(
                    (ms) => ms.dueDate,
                  );
                  const pd = poc.processId;
                  const procLabel = pd?.procId
                    ? `${pd.procId}${pd.name ? " · " + pd.name : ""}`
                    : "";
                  const objective = poc.design?.measurableObjective ?? "";

                  return (
                    <div
                      key={poc._id}
                      className="flex border-b border-border/50 hover:bg-slate-50/50 cursor-pointer group transition-colors"
                      style={{ minHeight: milestones.length > 0 ? 72 : 52 }}
                      onClick={() =>
                        poc.audit &&
                        router.push(`/audits/${poc.audit._id}/pocs/${poc._id}`)
                      }
                    >
                      {/* Label */}
                      <div
                        className="flex-shrink-0 px-4 py-3 border-r border-border flex flex-col justify-center gap-0.5"
                        style={{ width: LABEL_W }}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="font-mono text-xs font-bold"
                            style={{ color: "#0d7a6c" }}
                          >
                            {poc.pocId}
                          </span>
                          <Badge variant={PHASE_VARIANTS[poc.phase]}>
                            {poc.phase}
                          </Badge>
                        </div>
                        {(poc.name || objective) && (
                          <p
                            className="text-xs text-text font-semibold truncate"
                            title={poc.name || objective}
                          >
                            {poc.name || objective}
                          </p>
                        )}
                        {poc.name && objective && poc.name !== objective && (
                          <p
                            className="text-[10px] text-muted truncate"
                            title={objective}
                          >
                            {objective}
                          </p>
                        )}
                        <div className="text-[10px] text-muted truncate">
                          {poc.useCase?.cuId && (
                            <span className="font-mono">
                              {poc.useCase.cuId}
                            </span>
                          )}
                          {procLabel && (
                            <span className="ml-1">· {procLabel}</span>
                          )}
                        </div>
                      </div>

                      {/* Gantt area */}
                      <div className="relative py-3" style={{ width: ganttW }}>
                        {/* Month grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {months.map((_, i) => (
                            <div
                              key={i}
                              style={{ width: monthWidth, flexShrink: 0 }}
                              className="border-r border-border/20 h-full"
                            />
                          ))}
                        </div>

                        {/* Today line */}
                        {showToday && (
                          <div
                            className="absolute top-0 bottom-0 pointer-events-none z-10"
                            style={{
                              left: `${todayPct}%`,
                              width: 1,
                              backgroundColor: "#ef4444",
                              opacity: 0.5,
                            }}
                          />
                        )}

                        {/* POC bar */}
                        <div
                          className="absolute rounded-sm flex items-center px-2 overflow-hidden group-hover:opacity-90 transition-opacity"
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            minWidth: 6,
                            height: 20,
                            top:
                              milestones.length > 0
                                ? "calc(50% - 22px)"
                                : "calc(50% - 10px)",
                            backgroundColor: PHASE_COLORS[poc.phase],
                          }}
                          title={`${poc.pocId} · ${start.toLocaleDateString("en-GB")} → ${end.toLocaleDateString("en-GB")}`}
                        >
                          <span className="text-white text-[10px] font-medium truncate">
                            {poc.pocId}
                          </span>
                        </div>

                        {/* Milestone markers */}
                        {milestones.map((ms) => {
                          const msPct = dateToPct(
                            new Date(ms.dueDate),
                            ganttStart,
                            totalMonths,
                          );
                          const color =
                            MILESTONE_COLORS[ms.status] ??
                            MILESTONE_COLORS.pending;
                          const msDate = new Date(
                            ms.dueDate,
                          ).toLocaleDateString("en-GB");
                          return (
                            <div
                              key={ms.id}
                              className="absolute flex flex-col items-center"
                              style={{
                                left: `calc(${msPct}% - 5px)`,
                                top: "calc(50%)",
                              }}
                              title={`${ms.name}\n${msDate} · ${ms.status}`}
                            >
                              <div
                                className="w-2.5 h-2.5 rotate-45 flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span
                                className="text-[9px] font-medium whitespace-nowrap mt-0.5 leading-none"
                                style={{
                                  color,
                                  maxWidth: 60,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "block",
                                }}
                                title={ms.name}
                              >
                                {ms.name.length > 10
                                  ? ms.name.slice(0, 9) + "…"
                                  : ms.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Today label */}
            {showToday && (
              <div className="relative h-4 border-t border-border/30">
                <div
                  className="absolute -translate-x-1/2 text-[9px] text-red-500 font-medium whitespace-nowrap"
                  style={{ left: `calc(${todayPct}% + ${LABEL_W}px)` }}
                >
                  Today
                </div>
              </div>
            )}

            {/* POCs without dates */}
            {pocs.filter((p) => !p.design?.startDate || !p.design?.deadlineDate)
              .length > 0 && (
              <div className="px-4 py-3 text-xs text-muted border-t border-border bg-slate-50">
                {
                  pocs.filter(
                    (p) => !p.design?.startDate || !p.design?.deadlineDate,
                  ).length
                }{" "}
                POC(s) not shown — no start/deadline dates set.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
