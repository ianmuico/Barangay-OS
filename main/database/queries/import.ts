import { getDb } from '../connection';
import * as residents from './residents';

export interface ImportBatch {
  id: number;
  filename: string | null;
  total_imported: number;
  total_skipped: number;
  total_errors: number;
  imported_by: number | null;
  status: string;
  created_at: string;
}

export interface DuplicateMatch {
  type: 'exact' | 'fuzzy';
  existingResident: { id: number; first_name: string; last_name: string; birth_date: string; purok: string | null };
  newRow: Record<string, string>;
  rowIndex: number;
}

export interface ImportResult {
  batchId: number;
  totalImported: number;
  totalSkipped: number;
  totalErrors: number;
  errors: { row: number; field: string; message: string }[];
  duplicates: DuplicateMatch[];
}

// Create a new import batch record
export function createImportBatch(filename: string, importedBy: number | null): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO import_batches (filename, imported_by) VALUES (?, ?)'
  ).run(filename, importedBy);
  return result.lastInsertRowid as number;
}

// Update batch totals
export function updateImportBatch(id: number, totals: { total_imported: number; total_skipped: number; total_errors: number }): void {
  const db = getDb();
  db.prepare(
    'UPDATE import_batches SET total_imported = ?, total_skipped = ?, total_errors = ? WHERE id = ?'
  ).run(totals.total_imported, totals.total_skipped, totals.total_errors, id);
}

// Rollback an import batch — delete all residents with that batch ID
export function rollbackImportBatch(batchId: number): { deletedCount: number } {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as count FROM residents WHERE import_batch_id = ?').get(batchId) as { count: number }).count;
  db.prepare('DELETE FROM residents WHERE import_batch_id = ?').run(batchId);
  db.prepare("UPDATE import_batches SET status = 'rolled_back' WHERE id = ?").run(batchId);
  return { deletedCount: count };
}

// List import batches
export function listImportBatches(): ImportBatch[] {
  const db = getDb();
  return db.prepare('SELECT * FROM import_batches ORDER BY created_at DESC').all() as ImportBatch[];
}

// Get the latest completed batch
export function getLatestBatch(): ImportBatch | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM import_batches WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1").get() as ImportBatch | undefined;
}

// Check for exact duplicate: same first_name + last_name + birth_date
export function findExactDuplicate(firstName: string, lastName: string, birthDate: string): { id: number; first_name: string; last_name: string; birth_date: string; purok: string | null } | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT id, first_name, last_name, birth_date, purok FROM residents WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) AND birth_date = ?'
  ).get(firstName, lastName, birthDate) as any;
}

// Check for fuzzy duplicate: same last_name + same purok + birth_date within 365 days
export function findFuzzyDuplicates(lastName: string, purok: string | null, birthDate: string): { id: number; first_name: string; last_name: string; birth_date: string; purok: string | null }[] {
  const db = getDb();
  if (!purok) return [];
  return db.prepare(`
    SELECT id, first_name, last_name, birth_date, purok FROM residents
    WHERE LOWER(last_name) = LOWER(?)
    AND purok = ?
    AND ABS(julianday(birth_date) - julianday(?)) <= 365
  `).all(lastName, purok, birthDate) as any[];
}

// Parse date string into YYYY-MM-DD format
export function parseDate(dateStr: string, format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  try {
    if (format === 'YYYY-MM-DD') {
      // Validate YYYY-MM-DD
      const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;
      const [, y, m, d] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    if (format === 'MM/DD/YYYY') {
      const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (!match) return null;
      const [, m, d, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    if (format === 'DD/MM/YYYY') {
      const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (!match) return null;
      const [, d, m, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  } catch {
    return null;
  }

  return null;
}

// Validate a single row of import data
export function validateRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
  rowIndex: number
): { valid: boolean; data: Record<string, any>; errors: { row: number; field: string; message: string }[] } {
  const errors: { row: number; field: string; message: string }[] = [];
  const data: Record<string, any> = {};

  // Map columns
  for (const [systemField, csvColumn] of Object.entries(mapping)) {
    if (csvColumn && row[csvColumn] !== undefined) {
      data[systemField] = row[csvColumn]?.trim() || null;
    }
  }

  // Required fields
  const required = ['first_name', 'last_name', 'birth_date', 'gender', 'civil_status'];
  for (const field of required) {
    if (!data[field]) {
      errors.push({ row: rowIndex, field, message: `Missing required field: ${field}` });
    }
  }

  // Validate and parse date
  if (data.birth_date) {
    const parsed = parseDate(data.birth_date, dateFormat);
    if (!parsed) {
      errors.push({ row: rowIndex, field: 'birth_date', message: `Invalid date format: ${data.birth_date} (expected ${dateFormat})` });
    } else {
      data.birth_date = parsed;
    }
  }

  // Validate gender
  if (data.gender) {
    const g = data.gender.trim();
    if (!['Male', 'Female', 'male', 'female', 'M', 'F', 'm', 'f'].includes(g)) {
      errors.push({ row: rowIndex, field: 'gender', message: `Invalid gender: ${g} (must be Male or Female)` });
    } else {
      data.gender = g.toLowerCase().startsWith('m') ? 'Male' : 'Female';
    }
  }

  // Validate civil status
  if (data.civil_status) {
    const cs = data.civil_status.trim().toLowerCase();
    const validStatuses: Record<string, string> = {
      'single': 'Single', 's': 'Single',
      'married': 'Married', 'm': 'Married',
      'widowed': 'Widowed', 'w': 'Widowed', 'widow': 'Widowed',
      'separated': 'Separated', 'sep': 'Separated',
      'divorced': 'Divorced', 'd': 'Divorced', 'div': 'Divorced',
    };
    if (validStatuses[cs]) {
      data.civil_status = validStatuses[cs];
    } else {
      errors.push({ row: rowIndex, field: 'civil_status', message: `Invalid civil status: ${data.civil_status}` });
    }
  }

  // Validate voter_status
  if (data.voter_status) {
    const vs = data.voter_status.trim().toLowerCase();
    if (['registered', 'reg', 'yes', 'y', '1'].includes(vs)) {
      data.voter_status = 'Registered';
    } else {
      data.voter_status = 'Not Registered';
    }
  }

  // Validate is_indigent
  if (data.is_indigent !== undefined && data.is_indigent !== null) {
    const val = String(data.is_indigent).trim().toLowerCase();
    data.is_indigent = ['yes', 'y', '1', 'true', 'oo'].includes(val) ? 1 : 0;
  } else {
    data.is_indigent = 0;
  }

  // Validate is_4ps
  if (data.is_4ps !== undefined && data.is_4ps !== null) {
    const val = String(data.is_4ps).trim().toLowerCase();
    data.is_4ps = ['yes', 'y', '1', 'true', 'oo'].includes(val) ? 1 : 0;
  } else {
    data.is_4ps = 0;
  }

  // Default status
  if (!data.status) {
    data.status = 'living';
  }

  // Default citizenship
  if (!data.citizenship) {
    data.citizenship = 'Filipino';
  }

  return { valid: errors.length === 0, data, errors };
}

// Parse CSV content into rows
export function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Run the full import process
export function runImport(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD',
  batchId: number,
  skipDuplicates: boolean
): ImportResult {
  const db = getDb();
  const errors: { row: number; field: string; message: string }[] = [];
  const duplicates: DuplicateMatch[] = [];
  let totalImported = 0;
  let totalSkipped = 0;

  const transaction = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const { valid, data, errors: rowErrors } = validateRow(rows[i], mapping, dateFormat, i + 2); // +2 for 1-indexed + header row

      if (!valid) {
        errors.push(...rowErrors);
        totalSkipped++;
        continue;
      }

      // Check for exact duplicates
      if (data.first_name && data.last_name && data.birth_date) {
        const exactMatch = findExactDuplicate(data.first_name, data.last_name, data.birth_date);
        if (exactMatch) {
          duplicates.push({
            type: 'exact',
            existingResident: exactMatch,
            newRow: rows[i],
            rowIndex: i + 2,
          });
          if (skipDuplicates) {
            totalSkipped++;
            continue;
          }
        }

        // Fuzzy check
        const fuzzyMatches = findFuzzyDuplicates(data.last_name, data.purok || null, data.birth_date);
        for (const match of fuzzyMatches) {
          if (!exactMatch || match.id !== exactMatch.id) {
            duplicates.push({
              type: 'fuzzy',
              existingResident: match,
              newRow: rows[i],
              rowIndex: i + 2,
            });
          }
        }
      }

      // Insert the resident
      try {
        residents.createResident({
          first_name: data.first_name,
          last_name: data.last_name,
          birth_date: data.birth_date,
          gender: data.gender,
          civil_status: data.civil_status,
          middle_name: data.middle_name || null,
          suffix: data.suffix || null,
          address: data.address || '',
          purok: data.purok || null,
          contact_number: data.contact_number || null,
          email: data.email || null,
          occupation: data.occupation || null,
          is_indigent: data.is_indigent || 0,
          voter_status: data.voter_status || 'Not Registered',
          blood_type: data.blood_type || null,
          notes: data.notes || null,
          religion: data.religion || null,
          citizenship: data.citizenship || 'Filipino',
          philsys_card_no: data.philsys_card_no || null,
          educational_attainment: data.educational_attainment || null,
          is_4ps: data.is_4ps || 0,
          status: data.status || 'living',
          import_batch_id: batchId,
        } as any);
        totalImported++;
      } catch (err: any) {
        errors.push({ row: i + 2, field: '_insert', message: err?.message || 'Insert failed' });
        totalSkipped++;
      }
    }
  });

  transaction();

  // Update batch totals
  updateImportBatch(batchId, {
    total_imported: totalImported,
    total_skipped: totalSkipped,
    total_errors: errors.length,
  });

  return {
    batchId,
    totalImported,
    totalSkipped,
    totalErrors: errors.length,
    errors,
    duplicates,
  };
}

// Generate CSV template with all system field headers
export function getCSVTemplateHeaders(): string {
  const headers = [
    'first_name', 'middle_name', 'last_name', 'suffix',
    'birth_date', 'gender', 'civil_status',
    'address', 'purok', 'contact_number', 'email',
    'occupation', 'is_indigent', 'voter_status', 'blood_type',
    'religion', 'citizenship', 'philsys_card_no', 'educational_attainment',
    'is_4ps', 'status', 'notes'
  ];
  return headers.join(',');
}

// System fields available for mapping
export function getSystemFields(): { key: string; label: string; required: boolean }[] {
  return [
    { key: 'first_name', label: 'First Name', required: true },
    { key: 'middle_name', label: 'Middle Name', required: false },
    { key: 'last_name', label: 'Last Name', required: true },
    { key: 'suffix', label: 'Suffix', required: false },
    { key: 'birth_date', label: 'Date of Birth', required: true },
    { key: 'gender', label: 'Gender', required: true },
    { key: 'civil_status', label: 'Civil Status', required: true },
    { key: 'address', label: 'Address', required: false },
    { key: 'purok', label: 'Purok', required: false },
    { key: 'contact_number', label: 'Contact Number', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'occupation', label: 'Occupation', required: false },
    { key: 'is_indigent', label: 'Indigent (Yes/No)', required: false },
    { key: 'voter_status', label: 'Voter Status', required: false },
    { key: 'blood_type', label: 'Blood Type', required: false },
    { key: 'religion', label: 'Religion', required: false },
    { key: 'citizenship', label: 'Citizenship', required: false },
    { key: 'philsys_card_no', label: 'PhilSys Card No.', required: false },
    { key: 'educational_attainment', label: 'Educational Attainment', required: false },
    { key: 'is_4ps', label: '4Ps Beneficiary (Yes/No)', required: false },
    { key: 'status', label: 'Status (living/deceased)', required: false },
    { key: 'notes', label: 'Notes', required: false },
  ];
}

// Export residents to CSV string
export function exportResidentsToCSV(params: {
  is_senior?: boolean;
  is_youth?: boolean;
  is_indigent?: boolean;
  is_4ps?: boolean;
  status?: string;
}): string {
  const db = getDb();
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.is_senior) {
    conditions.push("CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60");
  }
  if (params.is_youth) {
    conditions.push("CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30");
    conditions.push("(civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))");
  }
  if (params.is_indigent) {
    conditions.push('is_indigent = 1');
  }
  if (params.is_4ps) {
    conditions.push('is_4ps = 1');
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  } else {
    // Default: only living
    conditions.push("status = 'living'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT first_name, middle_name, last_name, suffix, birth_date, gender, civil_status,
      address, purok, contact_number, email, occupation,
      CASE WHEN is_indigent = 1 THEN 'Yes' ELSE 'No' END as is_indigent,
      voter_status, blood_type, religion, citizenship, philsys_card_no,
      educational_attainment,
      CASE WHEN is_4ps = 1 THEN 'Yes' ELSE 'No' END as is_4ps,
      status, notes,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    ${whereClause}
    ORDER BY last_name, first_name
  `).all(...values) as Record<string, any>[];

  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape CSV values
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}
