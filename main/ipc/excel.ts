import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { getDb } from '../database/connection';
import { getSetting } from '../database/queries/settings';
import { getCurrentSessionUser } from './auth';
import {
  EXCEL_COLUMNS, runExcelImport, createImportBatch,
} from '../database/queries/import';

// Light blue header, frozen first row, sensible widths, dropdowns on the
// option columns. Opens cleanly in both Microsoft Excel and Google Sheets.
function buildResidentsSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('Residents', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = EXCEL_COLUMNS.map(c => ({
    header: c.header + (c.required ? ' *' : ''),
    key: c.key,
    width: Math.min(34, Math.max(14, c.header.length + 4)),
  }));

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } } };
  });

  // Dropdowns + helper note per column, applied to a generous row range
  EXCEL_COLUMNS.forEach((c, idx) => {
    const colLetter = ws.getColumn(idx + 1).letter;
    if (c.options && c.options.length) {
      for (let r = 2; r <= 2000; r++) {
        ws.getCell(`${colLetter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${c.options.join(',')}"`],
        };
      }
    }
    if (c.help) {
      ws.getCell(`${colLetter}1`).note = c.help;
    }
  });

  return;
}

function buildInstructionsSheet(wb: ExcelJS.Workbook, barangay: string): void {
  const ws = wb.addWorksheet('Instructions');
  ws.getColumn(1).width = 110;
  const lines: { text: string; bold?: boolean; size?: number; color?: string }[] = [
    { text: `${barangay || 'Barangay'} — Resident Data Entry Sheet`, bold: true, size: 16 },
    { text: '' },
    { text: 'How to use this file', bold: true, size: 13 },
    { text: '1. Go to the "Residents" sheet and fill in one row per person. Columns marked with * are required.' },
    { text: '2. Birth Date must be in YYYY-MM-DD format (example: 1990-01-31).' },
    { text: '3. For Gender, Civil Status, Indigent, 4Ps, PWD, Voter and Status — pick from the dropdown in each cell.' },
    { text: '4. Save the file, send it back to the barangay office, and the admin imports it into the system.' },
    { text: '' },
    { text: 'Connecting family members (spouse, mother, father)', bold: true, size: 13 },
    { text: 'You can link people together right in this sheet using the "Ref Code" column and the relationship columns.' },
    { text: '' },
    { text: 'Way 1 — people who are BOTH in this sheet:', bold: true },
    { text: '   • Give each person a short Ref Code (any label you like: A1, DAD, etc.).' },
    { text: '   • In another person’s Spouse/Mother/Father column, type that Ref Code.' },
    { text: '   Example:' },
    { text: '      Ref Code = DAD   →   Juan Dela Cruz' },
    { text: '      Ref Code = MOM   →   Maria Dela Cruz   (Spouse column = DAD)' },
    { text: '      Pedro Dela Cruz   (Mother column = MOM, Father column = DAD)' },
    { text: '' },
    { text: 'Way 2 — connecting to someone ALREADY in the system:', bold: true },
    { text: '   • Open the "Existing Residents" sheet, find the person, and copy their Resident ID number.' },
    { text: '   • Paste that Resident ID into the Spouse/Mother/Father column.' },
    { text: '' },
    { text: 'Way 3 — by full name (least reliable):', bold: true },
    { text: '   • You can also just type a person’s full name. It only links if exactly one resident has that name;' },
    { text: '     otherwise the office will see a note and can link it by hand. Ref Code or Resident ID is safer.' },
    { text: '' },
    { text: 'Notes', bold: true, size: 13 },
    { text: '• You do not have to fill the relationship columns — leave them blank if unknown.' },
    { text: '• Do not rename or reorder the columns on the Residents sheet.' },
    { text: '• Duplicates (same name + birth date already in the system) are flagged during import.' },
  ];
  lines.forEach((l, i) => {
    const cell = ws.getCell(`A${i + 1}`);
    cell.value = l.text;
    cell.font = { bold: l.bold, size: l.size || 11, color: l.color ? { argb: l.color } : undefined };
    cell.alignment = { wrapText: true };
  });
}

function buildExistingResidentsSheet(wb: ExcelJS.Workbook): void {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, first_name, middle_name, last_name, suffix, birth_date, purok
    FROM residents WHERE status != 'deceased'
    ORDER BY last_name ASC, first_name ASC
  `).all() as any[];

  const ws = wb.addWorksheet('Existing Residents', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Resident ID', key: 'id', width: 14 },
    { header: 'Full Name', key: 'name', width: 36 },
    { header: 'Birth Date', key: 'birth_date', width: 16 },
    { header: 'Purok', key: 'purok', width: 12 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FF1E3A5F' } };
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  });
  for (const r of rows) {
    ws.addRow({
      id: r.id,
      name: [r.first_name, r.middle_name, r.last_name, r.suffix].filter(Boolean).join(' '),
      birth_date: r.birth_date,
      purok: r.purok || '',
    });
  }
  // Reference only — make it obvious it isn't an entry sheet
  ws.getCell('F1').value = 'Reference only — copy a Resident ID into the Residents sheet to link family members.';
  ws.getCell('F1').font = { italic: true, color: { argb: 'FF888888' } };
}

// Read a cell to a trimmed string; dates → YYYY-MM-DD
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as any;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    if ('text' in v && v.text != null) return String(v.text).trim();       // rich text / hyperlink
    if ('result' in v && v.result != null) return String(v.result).trim(); // formula result
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

export function registerExcelHandlers(): void {
  // ── Download the fillable template ──
  ipcMain.handle('excel:downloadTemplate', async (_event, includeExisting = true) => {
    try {
      const barangay = getSetting('barangay_name') || 'Barangay';
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Barangay Management System';
      wb.created = new Date();
      buildInstructionsSheet(wb, barangay);
      buildResidentsSheet(wb);
      if (includeExisting) buildExistingResidentsSheet(wb);

      const safeName = barangay.replace(/[^a-zA-Z0-9]/g, '_');
      const save = await dialog.showSaveDialog({
        title: 'Save Resident Data Template',
        defaultPath: `${safeName}_Resident_Template.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });
      if (save.canceled || !save.filePath) return { success: false, error: 'Save cancelled' };

      const buffer = await wb.xlsx.writeBuffer();
      fs.writeFileSync(save.filePath, Buffer.from(buffer));
      return { success: true, path: save.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to build template' };
    }
  });

  // ── Read an uploaded .xlsx → rows keyed by our column keys ──
  ipcMain.handle('excel:readFile', async (_event, filePath: string) => {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const ws = wb.getWorksheet('Residents') || wb.worksheets.find(w => w.name !== 'Instructions' && w.name !== 'Existing Residents') || wb.worksheets[0];
      if (!ws) return { success: false, error: 'No data sheet found in the workbook.' };

      // Map header text → our column key (strip trailing * and whitespace)
      const headerToKey = new Map<string, string>();
      for (const c of EXCEL_COLUMNS) headerToKey.set(c.header.toLowerCase(), c.key);
      const colKeyByIndex: Record<number, string> = {};
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const text = cellText(cell).replace(/\s*\*\s*$/, '').toLowerCase();
        const key = headerToKey.get(text);
        if (key) colKeyByIndex[colNumber] = key;
      });

      if (Object.keys(colKeyByIndex).length === 0) {
        return { success: false, error: 'This file does not match the barangay template. Use the downloaded template, or use CSV import for other files.' };
      }

      const rows: Record<string, string>[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj: Record<string, string> = {};
        let hasValue = false;
        for (const [idxStr, key] of Object.entries(colKeyByIndex)) {
          const val = cellText(row.getCell(Number(idxStr)));
          obj[key] = val;
          if (val) hasValue = true;
        }
        if (hasValue) rows.push(obj);
      });

      return { success: true, rows, count: rows.length };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not read the Excel file.' };
    }
  });

  // ── Run the relationship-aware import ──
  ipcMain.handle('excel:import', async (_event, rows: Record<string, string>[], skipDuplicates: boolean) => {
    try {
      const user = getCurrentSessionUser();
      const batchId = createImportBatch('Excel template import', user?.id ?? null);
      const result = runExcelImport(rows, batchId, skipDuplicates);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Import failed' };
    }
  });
}
