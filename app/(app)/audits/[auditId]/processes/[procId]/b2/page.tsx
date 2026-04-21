"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Info,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { SaveIndicator } from "@/components/ui/SaveIndicator";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { calculateSovereigntyIndex } from "@/lib/calculations";
import { apiUrl } from "@/lib/utils";
import type {
  B2_Sovereignty,
  SovereigntyAxis,
  SovereigntyStatus,
  SovereigntyLevel,
  InfraMode,
} from "@/lib/types";

const AXIS_LABELS = [
  {
    key: "axis1_InfoClassification",
    label: "Axis 1 — Information Classification",
    description:
      "What is the classification level of the data involved in this process?",
    colors: {
      green: "Unclassified or public data — no restrictions on AI processing.",
      amber:
        "Internal or confidential — AI usable with controlled access and audit trail.",
      red: "Secret, ITAR/EAR, or NATO-classified — AI deployment requires explicit security clearance and will need to work within client-defined conditions.",
    },
  },
  {
    key: "axis2_ProcessSovereignty",
    label: "Axis 2 — Process Sovereignty",
    description:
      "Who owns and controls the execution and outcomes of this process?",
    colors: {
      green:
        "Atexis fully controls process execution — AI can be deployed freely.",
      amber:
        "Process is shared or partially outsourced — AI requires contractual alignment.",
      red: "Client or third party owns/controls the process — AI deployment will need to operate under conditions defined by the client.",
    },
  },
  {
    key: "axis3_ToolSovereignty",
    label: "Axis 3 — Tool Sovereignty",
    description: "Do we control the tools used and their licensing terms?",
    colors: {
      green:
        "Tools and licenses are under Atexis control — AI add-ons can be deployed freely.",
      amber:
        "Commercial tools with limited licensing — AI add-ons need vendor or client approval.",
      red: "Proprietary or client-controlled tools — AI integration will require working within the conditions the client allows.",
    },
  },
  {
    key: "axis4_DataSovereignty",
    label: "Axis 4 — Data Sovereignty",
    description: "Who owns the data used for training or operation of AI?",
    colors: {
      green:
        "Atexis controls all data and can use it for AI training and inference.",
      amber:
        "Shared data ownership — AI usage rights must be clarified contractually.",
      red: "Client or third party owns key data — AI training or inference must be done within legally agreed conditions.",
    },
  },
  {
    key: "axis5_Infrastructure",
    label: "Axis 5 — Infrastructure",
    description:
      "Where does the processing take place, and under whose control?",
    colors: {
      green: "Atexis on-premise or Atexis cloud — full processing control.",
      amber:
        "Hybrid or client-managed cloud — data residency must be contractually guaranteed.",
      red: "Client on-premise/on-site or uncontrolled cloud — all AI steps will need to be executed under conditions specified by the client.",
    },
  },
] as const;

const NORMATIVE_PRESETS = [
  "ISO 27001",
  "ENS",
  "NIST SP 800",
  "ITAR/EAR",
  "NATO STANAG",
  "GDPR",
  "NIS2",
];
const INFRA_OPTIONS: { value: InfraMode; label: string }[] = [
  { value: "client_onpremise", label: "Client on-premise / on-site" },
  { value: "client_cloud", label: "Client cloud" },
  { value: "atexis_onpremise", label: "Atexis on-premise" },
  { value: "atexis_cloud", label: "Atexis cloud" },
  { value: "hybrid", label: "Hybrid" },
];

const LEVEL_CONFIG: Record<
  SovereigntyLevel,
  { label: string; range: string; bg: string; text: string; bgLight: string }
> = {
  full_autonomy: {
    label: "Full Autonomy",
    range: "≥ 4.5",
    bg: "bg-emerald-700",
    text: "text-emerald-700",
    bgLight: "bg-emerald-50",
  },
  managed: {
    label: "Managed",
    range: "3.5 – 4.4",
    bg: "bg-green-600",
    text: "text-green-700",
    bgLight: "bg-green-50",
  },
  conditioned: {
    label: "Conditioned",
    range: "2.5 – 3.4",
    bg: "bg-amber-500",
    text: "text-amber-700",
    bgLight: "bg-amber-50",
  },
  restricted: {
    label: "Restricted",
    range: "1.5 – 2.4",
    bg: "bg-orange-500",
    text: "text-orange-700",
    bgLight: "bg-orange-50",
  },
  critical: {
    label: "Critical",
    range: "< 1.5",
    bg: "bg-red-600",
    text: "text-red-700",
    bgLight: "bg-red-50",
  },
};

function emptyAxis(): SovereigntyAxis {
  return {
    status: "amber" as SovereigntyStatus,
    findings: "",
    implications: "",
    normativeFrameworks: [],
  };
}

function emptyAxes(): B2_Sovereignty["axes"] {
  return {
    axis1_InfoClassification: emptyAxis(),
    axis2_ProcessSovereignty: emptyAxis(),
    axis3_ToolSovereignty: emptyAxis(),
    axis4_DataSovereignty: emptyAxis(),
    axis5_Infrastructure: emptyAxis(),
  };
}

function SovereigntyPanel({
  axes,
  className,
}: {
  axes: B2_Sovereignty["axes"];
  className?: string;
}) {
  const result = calculateSovereigntyIndex(axes);
  const cfg = LEVEL_CONFIG[result.level];
  const axisKeys = Object.keys(axes) as (keyof typeof axes)[];

  return (
    <div className={`card p-4 space-y-3 ${className}`}>
      <h3 className="text-xs font-medium text-muted uppercase tracking-wide">
        Sovereignty Index
      </h3>
      <div className={`rounded-md p-4 text-center ${cfg.bg} text-white`}>
        <div className="text-4xl font-display font-bold">
          {result.index > 0 ? result.index.toFixed(1) : "—"}
        </div>
        <div className="text-xs mt-1 opacity-80">out of 5.0</div>
        <div className="text-sm font-semibold mt-1">{cfg.label}</div>
      </div>
      <div className="text-xs text-muted text-center">
        Green=5 · Amber=3 · Red=1 · Average
      </div>

      {/* 5-level interpretation */}
      <div className="space-y-1 text-xs">
        {(Object.keys(LEVEL_CONFIG) as SovereigntyLevel[]).map((lvl) => {
          const c = LEVEL_CONFIG[lvl];
          const active = result.level === lvl;
          return (
            <div
              key={lvl}
              className={`flex items-center justify-between px-2 py-1 rounded ${active ? c.bgLight : ""}`}
            >
              <span className="font-mono text-[10px] text-muted">
                {c.range}
              </span>
              <span
                className={`font-semibold ${active ? c.text : "text-muted"}`}
              >
                {c.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mini axis indicators */}
      <div className="space-y-1">
        {axisKeys.map((k, i) => {
          const axis = axes[k];
          const dot =
            axis.status === "green"
              ? "bg-green-sov"
              : axis.status === "red"
                ? "bg-red-sov"
                : "bg-amber-sov";
          return (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-muted">Axis {i + 1}</span>
              <span className="capitalize text-text">{axis.status}</span>
            </div>
          );
        })}
      </div>

      {result.hasCritical && (
        <div className="flex items-start gap-2 p-2 bg-red-50 rounded text-xs text-red-700">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            One or more axes are critical. AI implementation will need to follow
            conditions defined by the client on each restricted axis.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Custom framework input ──────────────────────────────────────────────────────
function FrameworkSelector({
  axisKey,
  selected,
  onChange,
}: {
  axisKey: string;
  selected: string[];
  onChange: (frameworks: string[]) => void;
}) {
  const [customInput, setCustomInput] = useState("");

  const toggle = (norm: string) => {
    const next = selected.includes(norm)
      ? selected.filter((n) => n !== norm)
      : [...selected, norm];
    onChange(next);
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setCustomInput("");
  };

  const remove = (norm: string) => onChange(selected.filter((n) => n !== norm));

  return (
    <div className="space-y-2">
      <label className="form-label">Normative Frameworks</label>
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {NORMATIVE_PRESETS.map((norm) => {
          const active = selected.includes(norm);
          return (
            <button
              key={norm}
              type="button"
              onClick={() => toggle(norm)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                active
                  ? "bg-blue-aria text-white border-blue-aria"
                  : "border-border text-muted hover:border-blue-aria"
              }`}
            >
              {norm}
            </button>
          );
        })}
      </div>
      {/* Custom input */}
      <div className="flex gap-2">
        <input
          className="form-input flex-1 text-xs"
          placeholder="Add custom framework…"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-3 py-1.5 bg-blue-aria text-white text-xs rounded hover:bg-blue-aria/90 flex items-center gap-1"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {/* All selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((norm) => (
            <span
              key={norm}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs text-text"
            >
              {norm}
              <button
                type="button"
                onClick={() => remove(norm)}
                className="text-muted hover:text-red-500"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function B2Page() {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved",
  );
  const [processName, setProcessName] = useState("");
  const [axes, setAxes] = useState<B2_Sovereignty["axes"]>(emptyAxes());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    axis1_InfoClassification: true,
  });
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    axisKey: string;
    newStatus: SovereigntyStatus;
  }>({ open: false, axisKey: "", newStatus: "red" });
  const saveRef = useRef(axes);

  useEffect(() => {
    fetch(apiUrl(`/api/audits/${auditId}/processes/${procId}`), {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setProcessName(data.name || "");
        if (data.b2?.axes) {
          // Migrate legacy normativeFramework string to normativeFrameworks array
          const migratedAxes: B2_Sovereignty["axes"] =
            {} as B2_Sovereignty["axes"];
          for (const [k, axis] of Object.entries(data.b2.axes)) {
            const a = axis as any;
            let frameworks: string[] = a.normativeFrameworks || [];
            if (!frameworks.length && a.normativeFramework) {
              frameworks = a.normativeFramework.split(", ").filter(Boolean);
            }
            (migratedAxes as any)[k] = {
              ...a,
              normativeFrameworks: frameworks,
            };
          }
          setAxes(migratedAxes);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, procId]);

  const saveAxes = useCallback(
    async (updatedAxes: B2_Sovereignty["axes"]) => {
      setSaveStatus("saving");
      try {
        await fetch(apiUrl(`/api/audits/${auditId}/processes/${procId}/b2`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ axes: updatedAxes }),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    },
    [auditId, procId],
  );

  const updateAxis = (
    axisKey: string,
    field: string,
    value: string | string[],
  ) => {
    const next = {
      ...axes,
      [axisKey]: { ...axes[axisKey as keyof typeof axes], [field]: value },
    };
    setAxes(next);
    saveRef.current = next;
    setSaveStatus("unsaved");

    if (field === "status" && value === "red") {
      setConfirmModal({ open: true, axisKey, newStatus: "red" });
    } else {
      saveAxes(next);
    }
  };

  const handleConfirmRed = async () => {
    await saveAxes(saveRef.current);
    setConfirmModal({ open: false, axisKey: "", newStatus: "red" });
  };

  const handleCancelRed = () => {
    const reverted = {
      ...axes,
      [confirmModal.axisKey]: {
        ...axes[confirmModal.axisKey as keyof typeof axes],
        status: "amber" as SovereigntyStatus,
      },
    };
    setAxes(reverted);
    setConfirmModal({ open: false, axisKey: "", newStatus: "red" });
  };

  const isComplete = AXIS_LABELS.every(({ key }) => {
    const axis = axes[key];
    return axis.status && axis.findings.trim();
  });

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <Badge variant="red">B2</Badge>
          <h1 className="text-xl font-display font-bold text-text">
            Sovereignty Matrix
          </h1>
          <span className="text-muted text-sm">— {processName}</span>
          {isComplete && (
            <Badge variant="green">
              <CheckCircle2 size={12} className="mr-1" />
              Complete
            </Badge>
          )}
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-3">
          {AXIS_LABELS.map(({ key, label, description, colors }) => {
            const axis = axes[key];
            const isOpen = expanded[key];
            const statusColor =
              axis.status === "green"
                ? "border-green-sov bg-green-sov-light"
                : axis.status === "red"
                  ? "border-red-sov bg-red-sov-light"
                  : "border-amber-sov bg-amber-sov-light";

            return (
              <div key={key} className={`card border-l-4 ${statusColor}`}>
                {/* Accordion header */}
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !isOpen }))}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${axis.status === "green" ? "bg-green-sov" : axis.status === "red" ? "bg-red-sov" : "bg-amber-sov"}`}
                    />
                    <span className="font-semibold text-sm">{label}</span>
                    {axis.findings && (
                      <CheckCircle2 size={14} className="text-green-sov" />
                    )}
                  </div>
                  {isOpen ? (
                    <ChevronUp size={16} className="text-muted" />
                  ) : (
                    <ChevronDown size={16} className="text-muted" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border/30 pt-4">
                    <p className="text-xs text-muted flex items-center gap-1">
                      <Info size={12} />
                      {description}
                    </p>

                    {/* Traffic light */}
                    <div>
                      <label className="form-label">Status</label>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        {(["green", "amber", "red"] as SovereigntyStatus[]).map(
                          (s) => {
                            const active = axis.status === s;
                            const colours: Record<string, string> = {
                              green: active
                                ? "bg-green-sov text-white border-green-sov"
                                : "border-green-sov text-green-sov hover:bg-green-sov-light",
                              amber: active
                                ? "bg-amber-sov text-white border-amber-sov"
                                : "border-amber-sov text-amber-sov hover:bg-amber-sov-light",
                              red: active
                                ? "bg-red-sov text-white border-red-sov"
                                : "border-red-sov text-red-sov hover:bg-red-sov-light",
                            };
                            return (
                              <button
                                key={s}
                                onClick={() => updateAxis(key, "status", s)}
                                className={`px-5 py-2 rounded border-2 font-semibold text-sm transition-colors capitalize ${colours[s]}`}
                              >
                                {s === "green"
                                  ? "● Green"
                                  : s === "amber"
                                    ? "● Amber"
                                    : "● Red"}
                              </button>
                            );
                          },
                        )}
                      </div>
                      {/* Contextual tooltip */}
                      <div
                        className={`mt-2 p-2 rounded text-xs flex items-start gap-1.5 ${
                          axis.status === "green"
                            ? "bg-green-sov-light text-green-700"
                            : axis.status === "red"
                              ? "bg-red-sov-light text-red-700"
                              : "bg-amber-sov-light text-amber-700"
                        }`}
                      >
                        <Info size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{colors[axis.status]}</span>
                      </div>
                    </div>

                    {/* Normative frameworks — only applicable to Info Classification axis */}
                    {key === "axis1_InfoClassification" && (
                      <FrameworkSelector
                        axisKey={key}
                        selected={axis.normativeFrameworks ?? []}
                        onChange={(v) =>
                          updateAxis(key, "normativeFrameworks", v)
                        }
                      />
                    )}

                    {/* Axis 5 extra: infra mode */}
                    {key === "axis5_Infrastructure" && (
                      <div>
                        <label className="form-label">
                          Infrastructure Mode
                        </label>
                        <select
                          className="form-input"
                          value={axis.infrastructureMode || ""}
                          onChange={(e) =>
                            updateAxis(
                              key,
                              "infrastructureMode",
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Select mode…</option>
                          {INFRA_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Findings</label>
                        <textarea
                          rows={3}
                          className="form-textarea"
                          placeholder="What was found in this audit for this axis…"
                          value={axis.findings}
                          onChange={(e) =>
                            updateAxis(key, "findings", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="form-label">AI Implications</label>
                        <textarea
                          rows={3}
                          className="form-textarea"
                          placeholder="What does this mean for AI deployment…"
                          value={axis.implications}
                          onChange={(e) =>
                            updateAxis(key, "implications", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky sovereignty panel */}
        <div className="w-72 flex-shrink-0">
          <div className="sticky top-4">
            <SovereigntyPanel axes={axes} />
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={handleCancelRed}
        title="Set axis to Red?"
        message={`Marking this axis as Red indicates a highly constrained sovereignty condition. AI implementation on this axis will need to follow conditions defined by the client. Do you want to continue?`}
        confirmLabel="Yes, mark as Red"
        onConfirm={handleConfirmRed}
      />
    </div>
  );
}
