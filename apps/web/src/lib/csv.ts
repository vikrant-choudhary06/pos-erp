/** Download rows as a CSV that opens cleanly in Excel. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    // stop Excel treating "=..." as a formula
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const text = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  // BOM so Excel reads ₹ and Hindi names correctly
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
