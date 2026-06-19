/** Escape HTML special characters safely */
export function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format number as EUR with de-DE locale */
export function formatEur(n: number): string {
  return `€${Math.round(n).toLocaleString('de-DE')}`;
}

/** Create URL-safe slug from text */
export function slugify(text: string): string {
  return (text || 'report')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Shared CSS for both multi-POC and individual POC reports */
export const REPORT_STYLES = `
    :root {
      --paper: #f8f9fb;
      --surface: #ffffff;
      --surface-2: #edf1f7;
      --ink: #0f1e33;
      --ink-soft: #1e3251;
      --muted: #4a6480;
      --faint: #8aa0b8;
      --line: #b8ccdf;
      --line-soft: #e8eef5;
      --accent: #1e3251;
      --accent-2: #b5842a;
      --good: #2e7050;
      --bad: #8f3030;
      --neutral: #2e5080;
      --serif: Georgia, 'Times New Roman', serif;
      --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: ui-monospace, 'SF Mono', Consolas, monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--paper);
      font-family: var(--sans);
      font-size: 0.92rem;
      color: var(--ink-soft);
      line-height: 1.6;
    }
    .report-container {
      max-width: 980px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    .report-header {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 3px solid;
      border-image: linear-gradient(to right, var(--accent), var(--accent-2), transparent) 1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .report-header h1 {
      font-family: var(--serif);
      font-size: 2.2rem;
      font-weight: 400;
      font-style: italic;
      color: var(--ink);
      margin: 0;
    }
    .audit-meta {
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--faint);
      text-align: right;
      line-height: 1.5;
    }
    details {
      margin: 0;
      padding: 0;
      border: none;
      background: none;
    }
    summary {
      cursor: pointer;
      user-select: none;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary h2 {
      margin: 32px 0 20px 0;
      display: inline;
    }
    .poc-block {
      page-break-after: always;
      margin-bottom: 48px;
      padding-bottom: 32px;
    }
    details:not(:last-child) {
      border-bottom: 1px solid var(--line);
    }
    h2 {
      font-family: var(--serif);
      font-size: 1.85rem;
      font-weight: 400;
      margin: 32px 0 20px 0;
      color: var(--ink);
      border-top: 1px solid var(--line);
      padding-top: 16px;
    }
    h2.section-title {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }
    h3 {
      font-family: var(--serif);
      font-size: 1.12rem;
      font-weight: 600;
      margin: 20px 0 12px 0;
      color: var(--ink-soft);
    }
    .uc-roi-block {
      margin: 16px 0;
      padding: 12px;
      background: var(--surface-2);
      border: 1px solid var(--line);
    }
    .uc-roi-block--ref {
      border-left: 4px solid var(--accent);
    }
    .uc-roi-block--inst {
      border-left: 2px solid var(--accent-2);
    }
    .uc-roi-title {
      font-family: var(--serif);
      font-size: 1rem;
      font-weight: 500;
      margin: 0 0 12px 0;
      color: var(--ink-soft);
    }
    .uc-type-ref {
      font-weight: 700;
      color: var(--accent);
    }
    .uc-type-inst {
      font-weight: 700;
      color: var(--accent-2);
    }
    .exec-summary-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.82rem;
    }
    .exec-summary-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .exec-summary-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .exec-summary-table tr.total-row {
      font-weight: bold;
      background: var(--surface-2);
    }
    .roi-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.82rem;
    }
    .roi-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .roi-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .badge {
      display: inline-block;
      font-family: var(--mono);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      padding: 4px 8px;
      border-radius: 0;
      background: var(--surface-2);
      color: var(--ink-soft);
    }
    .badge-ref {
      color: var(--accent);
      background: transparent;
    }
    .badge-inst {
      color: var(--muted);
      background: transparent;
    }
    .b2-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 12px 0;
      border-bottom: 1px solid var(--line-soft);
      align-items: start;
    }
    .b2-axis {
      font-family: var(--serif);
      font-weight: 500;
      color: var(--ink);
    }
    .b2-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      font-size: 0.85rem;
      font-weight: 400;
      background: none;
      border-left: 3px solid transparent;
      padding-left: 8px;
    }
    .b2-status::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .b2-status.green {
      color: var(--good);
      border-left-color: var(--good);
      background: none;
    }
    .b2-status.green::before { background: var(--good); }
    .b2-status.amber {
      color: var(--accent-2);
      border-left-color: var(--accent-2);
      background: none;
    }
    .b2-status.amber::before { background: var(--accent-2); }
    .b2-status.red {
      color: var(--bad);
      border-left-color: var(--bad);
      background: none;
    }
    .b2-status.red::before { background: var(--bad); }
    .mockups-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .mockups-table th {
      font-family: var(--sans);
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 400;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 1px solid var(--line-soft);
      background: none;
    }
    .mockups-table td {
      font-family: var(--mono);
      padding: 10px 8px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line-soft);
    }
    .mockups-table button {
      transition: background 0.2s;
    }
    .mockups-table button:hover {
      background: var(--accent-2) !important;
    }
    p { margin: 12px 0; color: var(--ink-soft); }
    code { background: none; color: var(--accent); font-family: var(--mono); font-size: 0.85rem; padding: 0; }
    .fact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1px;
      background: var(--line-soft);
      border: 1px solid var(--line-soft);
      margin: 16px 0;
    }
    .fact-card {
      background: var(--surface);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .fact-label {
      font-family: var(--sans);
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--faint);
      font-weight: 600;
    }
    .fact-value {
      font-family: var(--mono);
      font-size: 0.95rem;
      color: var(--ink);
      font-weight: 500;
    }
    .fact-note {
      font-size: 0.72rem;
      color: var(--muted);
      font-style: italic;
      margin: 4px 0 0 0;
      line-height: 1.5;
    }
    @media print {
      body { background: white; }
      .report-container { padding: 20px; }
      .poc-block { page-break-after: always; }
      h2 { page-break-before: avoid; }
      .fact-card { break-inside: avoid; }
      .mockups-table button { display: none; }
      .mockups-table tbody tr td:last-child { display: none; }
      .mockups-table thead tr th:last-child { display: none; }
    }
`;
