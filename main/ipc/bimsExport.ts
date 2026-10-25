import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { getDb } from '../database/connection';
import { getSetting } from '../database/queries/settings';
import { getCurrentSessionUser } from './auth';
import { logAudit } from '../database/queries/audit';
import { BIMS_RBI_COLUMNS } from '../utils/bimsTemplate';

// Living residents joined to their household number, for a one-way BIMS export.
function getExportRows(): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT r.*, h.household_number as household_number,
      CAST((julianday('now') - julianday(r.birth_date)) / 365.25 AS INTEGER) as age
    FROM residents r
    LEFT JOIN households h ON r.household_id = h.id
    WHERE r.status = 'living'
    ORDER BY r.last_name, r.first_name
  `).all();
}

export function registerBimsExportHandlers(): void {
  // Dry-run: report how many residents are missing BIMS-required fields.
  ipcMain.handle('bims:validate', async () => {
    const rows = getExportRows();
    const required = BIMS_RBI_COLUMNS.filter((c) => c.required);
    const issues: { name: string; missing: string[] }[] = [];
    for (const r of rows) {
      const missing = required.filter((c) => !String(c.get(r) ?? '').trim()).map((c) => c.header);
      if (missing.length) issues.push({ name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}`, missing });
    }
    return { total: rows.length, okCount: rows.length - issues.length, issues: issues.slice(0, 200) };
  });

  // Write a BIMS-ready (.xlsx) workbook of living residents mapped to RBI columns.
  ipcMain.handle('bims:export', async () => {
    try {
      const rows = getExportRows();
      const wb = new ExcelJS.Workbook();

      const ws = wb.addWorksheet('RBI', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.addRow(BIMS_RBI_COLUMNS.map((c) => c.header));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(BIMS_RBI_COLUMNS.map((c) => c.get(r)));
      ws.columns.forEach((col) => { col.width = 18; });

      const brgy = getSetting('barangay_name') || '';
      const about = wb.addWorksheet('About');
      about.getColumn(1).width = 110;
      [
        'BIMS-ready export (RBI-aligned)',
        brgy ? `Barangay: ${brgy}` : '',
        `Residents exported: ${rows.length}`,
        '',
        'This workbook contains living residents mapped to Records of Barangay Inhabitants (RBI) fields.',
        'DILG LGUSS-BIMS accepts external data only through its own prescribed Excel template — there is',
        'no public API, so this file is uploaded manually by an authorized barangay user.',
        '',
        "IMPORTANT: Before uploading, obtain your barangay's prescribed BIMS template from your DILG",
        'Information System Analyst (ISA) and align these column headers to match it exactly. The header',
        'names here are a best-guess mapping and may differ from the official template.',
      ].filter(Boolean).forEach((t) => about.addRow([t]));

      const buffer = await wb.xlsx.writeBuffer();
      const save = await dialog.showSaveDialog({
        title: 'Export BIMS-ready workbook',
        defaultPath: `BIMS_export_${(brgy || 'barangay').replace(/[^a-zA-Z0-9_]+/g, '_')}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });
      if (save.canceled || !save.filePath) return { success: false, error: 'Save cancelled' };

      fs.writeFileSync(save.filePath, Buffer.from(buffer));
      const user = getCurrentSessionUser();
      logAudit(user?.id || null, 'BIMS_EXPORT', `Exported ${rows.length} residents to BIMS template`);
      return { success: true, path: save.filePath, count: rows.length };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
