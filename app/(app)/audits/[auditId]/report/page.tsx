"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/Spinner";
import { apiUrl } from "@/lib/utils";
import { Bot, RefreshCw, FileText, AlertTriangle } from "lucide-react";

interface ReportMeta {
  generatedAt: string;
  model: string;
}

// ─── Simple Markdown → HTML converter ────────────────────────────────────────

function mdToHtml(md: string): string {
  const inline = (text: string) =>
    text
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHasHead = false;

  const closeList = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
      tableHasHead = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    // Detect table row (lenient: only require starting |)
    const isTableRow = t.startsWith("|") && t.length > 1;
    const isTableSep = /^\|[\s|:-]+\|?$/.test(t);

    // Close open structures when context changes
    if (!isTableRow && !isTableSep) closeTable();
    if (!t.startsWith("- ") && !t.startsWith("* ")) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
    }
    if (!/^\d+\.\s/.test(t)) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
    }

    if (t.startsWith("#### ")) {
      out.push(`<h4>${inline(t.slice(5))}</h4>`);
    } else if (t.startsWith("### ")) {
      out.push(`<h3>${inline(t.slice(4))}</h3>`);
    } else if (t.startsWith("## ")) {
      out.push(`<h2>${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith("# ")) {
      out.push(`<h1>${inline(t.slice(2))}</h1>`);
    } else if (t === "---" || t === "***" || t === "___") {
      out.push("<hr>");
    } else if (t.startsWith("> ")) {
      out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(t.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(t)) {
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(t.replace(/^\d+\.\s/, ""))}</li>`);
    } else if (isTableSep) {
      // skip separator line (already handled header)
    } else if (isTableRow) {
      const rowContent = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
      const cells = rowContent
        .split("|")
        .map((c) => c.trim())
        .filter((c, idx, arr) => !(idx === arr.length - 1 && c === ""));
      const nextLine = lines[i + 1]?.trim() ?? "";
      const nextIsSep = /^\|[\s|:-]+\|?$/.test(nextLine);

      if (nextIsSep && !inTable) {
        // header row
        out.push("<table>");
        out.push(
          "<thead><tr>" +
            cells.map((c) => `<th>${inline(c)}</th>`).join("") +
            "</tr></thead>",
        );
        out.push("<tbody>");
        inTable = true;
        tableHasHead = true;
        i++; // skip sep line
      } else {
        if (!inTable) {
          out.push("<table><tbody>");
          inTable = true;
        }
        out.push(
          "<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>",
        );
      }
    } else if (t === "") {
      out.push("");
    } else {
      out.push(`<p>${inline(t)}</p>`);
    }
  }

  closeList();
  closeTable();

  return out.join("\n");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditReportPage() {
  const params = useParams();
  const auditId = params?.auditId as string;

  const [markdown, setMarkdown] = useState("");
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const html = useMemo(() => (markdown ? mdToHtml(markdown) : ""), [markdown]);

  useEffect(() => {
    fetch(apiUrl(`/api/audits/${auditId}/report`), { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.exists && data.report?.markdown) {
          setMarkdown(data.report.markdown);
          setMeta({
            generatedAt: data.report.generatedAt,
            model: data.report.model,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auditId]);

  async function generate() {
    setError("");
    setMarkdown("");
    setMeta(null);
    setGenerating(true);

    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/report`), {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

      setMarkdown(data.markdown);
      setMeta({
        generatedAt: new Date().toISOString(),
        model: data.model || "mistral-medium-latest",
      });
      toast.success("Informe generado correctamente");
    } catch (e: any) {
      const msg = e.message || "Error generando el informe";
      setError(msg);
      toast.error("Error al generar el informe", { description: msg });
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );
  }

  const formattedDate = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <>
      <style>{`
        .rpt h1{font-family:'Syne',system-ui,sans-serif;font-size:1.5rem;font-weight:700;color:#0F172A;border-bottom:2px solid #CBD5E1;padding-bottom:.75rem;margin:0 0 1.5rem}
        .rpt h2{font-family:'Syne',system-ui,sans-serif;font-size:1.05rem;font-weight:700;color:#1B6CA8;border-bottom:1px solid #e2e8f0;padding-bottom:.2rem;margin:2rem 0 .75rem}
        .rpt h3{font-size:.95rem;font-weight:600;color:#0F172A;margin:1.25rem 0 .4rem}
        .rpt h4{font-size:.75rem;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin:1rem 0 .3rem}
        .rpt p{font-size:.875rem;line-height:1.75;color:#0F172A;margin:.5rem 0}
        .rpt ul,.rpt ol{padding-left:1.5rem;margin:.5rem 0}
        .rpt li{font-size:.875rem;line-height:1.7;color:#0F172A;margin:.2rem 0}
        .rpt strong{font-weight:600;color:#0F172A}
        .rpt em{color:#475569;font-style:italic}
        .rpt hr{border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0}
        .rpt blockquote{border-left:3px solid #1B6CA8;padding:.5rem 1rem;color:#475569;font-style:italic;margin:1rem 0;background:#f8fafc;border-radius:0 4px 4px 0}
        .rpt code{background:#f1f5f9;padding:.1rem .35rem;border-radius:4px;font-family:'DM Mono',monospace;font-size:.78rem;color:#1B6CA8}
        .rpt table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.8rem}
        .rpt th{background:#1B6CA8;color:#fff;text-align:left;padding:.5rem .75rem;font-weight:600;font-size:.75rem;border:1px solid #1B6CA8}
        .rpt td{padding:.45rem .75rem;border:1px solid #e2e8f0;vertical-align:top;color:#0F172A}
        .rpt tr:nth-child(even) td{background:#f8fafc}
        .rpt tr:hover td{background:#f1f5f9}
      `}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text flex items-center gap-2">
              <Bot size={22} className="text-blue-aria" />
              Informe IA
            </h1>
            <p className="text-sm text-muted mt-0.5">
              Informe ejecutivo generado automáticamente a partir de los datos
              de la auditoría
            </p>
          </div>
          {markdown && !generating && (
            <button
              onClick={generate}
              className="flex items-center gap-2 px-4 py-2 rounded-sm border border-border text-sm text-muted hover:text-text hover:border-blue-aria transition-colors"
            >
              <RefreshCw size={14} />
              Regenerar
            </button>
          )}
        </div>

        {/* Meta bar */}
        {meta && !generating && (
          <div className="flex items-center gap-3 text-xs text-muted bg-slate-50 border border-border rounded-sm px-4 py-2">
            <span>
              Generado el <strong className="text-text">{formattedDate}</strong>
            </span>
            <span className="text-border">·</span>
            <span>
              Modelo: <strong className="text-text">{meta.model}</strong>
            </span>
          </div>
        )}

        {/* Generating indicator */}
        {generating && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-sm px-4 py-3 text-sm text-blue-700">
            <Spinner size="sm" className="text-blue-aria" />
            <span>Analizando datos de la auditoría y generando informe…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-sm px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Report */}
        {html ? (
          <div className="bg-white border border-border rounded-sm p-10">
            <div className="rpt" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : !generating && !error ? (
          <div className="bg-white border border-border rounded-sm p-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <FileText size={32} className="text-blue-aria" />
              </div>
            </div>
            <h2 className="font-display text-lg font-semibold text-text mb-2">
              Sin informe generado
            </h2>
            <p className="text-sm text-muted max-w-md mx-auto mb-8">
              Genera un informe ejecutivo completo analizando todos los
              procesos, casos de uso, evaluaciones de soberanía y POCs
              registrados en esta auditoría.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-8 text-left">
              {[
                "Resumen ejecutivo",
                "Evaluación de soberanía",
                "Ranking de casos de uso",
                "Análisis de ROI",
                "Riesgos y restricciones",
                "Recomendaciones",
              ].map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 text-xs text-muted"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-aria flex-shrink-0" />
                  {s}
                </div>
              ))}
            </div>
            <button
              onClick={generate}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-700 transition-colors"
            >
              <Bot size={16} />
              Generar Informe IA
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
