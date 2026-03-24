import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { getTemplateById } from '../database/queries/templates';
import { getResidentById } from '../database/queries/residents';
import { createGeneratedReport } from '../database/queries/reports';
import { getSetting } from '../database/queries/settings';
import { listOfficials } from '../database/queries/officials';
import { logAudit } from '../database/queries/audit';
import { getCurrentSessionUser } from './auth';

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildHeaderHtml(): string {
  const barangayName = getSetting('barangay_name') || 'BARANGAY';
  const municipality = getSetting('municipality') || '';
  const province = getSetting('province') || '';
  const logoBase64 = getLogoBase64();

  const logoImg = logoBase64
    ? `<img src="${logoBase64}" style="width:70px;height:70px;object-fit:contain;" />`
    : '';

  return `<div style="text-align:center;margin-bottom:20px;">
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;">
      ${logoImg}
      <div>
        <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
        <p style="margin:0;font-size:10pt;">${province}</p>
        <p style="margin:0;font-size:10pt;">Municipality of ${municipality}</p>
        <p style="margin:4px 0 0;font-size:14pt;font-weight:bold;letter-spacing:1px;">${barangayName.toUpperCase()}</p>
      </div>
      ${logoImg ? '<div style="width:70px;"></div>' : ''}
    </div>
  </div>`;
}

function resolveSignatories(html: string): string {
  const officials = listOfficials();

  return html.replace(/\{\{signatory:(\w+)\}\}/g, (match, role) => {
    const roleLower = role.toLowerCase();

    // Find official by position (case-insensitive partial match)
    const official = officials.find(o => {
      const pos = o.position.toLowerCase().replace(/[^a-z]/g, '');
      return pos.includes(roleLower) || roleLower.includes(pos);
    });

    if (official) {
      const name = [official.first_name, official.last_name].filter(Boolean).join(' ');
      const position = official.position;
      return `<div style="text-align:center;margin-top:40px;">
        <div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">
          <strong>${name.toUpperCase()}</strong><br/>
          <span style="font-size:10pt;">${position}</span>
        </div>
      </div>`;
    }

    // Return placeholder if no official found
    return `<div style="text-align:center;margin-top:40px;">
      <div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">
        <strong>_________________________</strong><br/>
        <span style="font-size:10pt;">${role}</span>
      </div>
    </div>`;
  });
}

function resolveVariables(html: string, resident: any, inputValues?: Record<string, string>): string {
  const fullName = [resident.first_name, resident.middle_name, resident.last_name, resident.suffix]
    .filter(Boolean)
    .join(' ');

  const middleInitial = resident.middle_name ? resident.middle_name.charAt(0) + '.' : '';

  let partnerName = '';
  if (resident.partner_id) {
    const partner = getResidentById(resident.partner_id);
    if (partner) {
      partnerName = [partner.first_name, partner.middle_name, partner.last_name, partner.suffix]
        .filter(Boolean)
        .join(' ');
    }
  }

  const variables: Record<string, string> = {
    fullName,
    firstName: resident.first_name || '',
    middleName: resident.middle_name || '',
    lastName: resident.last_name || '',
    suffix: resident.suffix || '',
    middleInitial,
    purok: resident.purok || '',
    address: resident.address || '',
    birthDate: resident.birth_date ? formatDate(new Date(resident.birth_date)) : '',
    age: resident.birth_date ? String(calculateAge(resident.birth_date)) : '',
    gender: resident.gender || '',
    civilStatus: resident.civil_status || '',
    contactNumber: resident.contact_number || '',
    email: resident.email || '',
    occupation: resident.occupation || '',
    voterStatus: resident.voter_status || '',
    bloodType: resident.blood_type || '',
    partnerName,
    // New fields
    religion: resident.religion || '',
    citizenship: resident.citizenship || 'Filipino',
    philsysCardNo: resident.philsys_card_no || '',
    educationalAttainment: resident.educational_attainment || '',
    // Settings
    barangay: getSetting('barangay_name') || '',
    barangayAddress: getSetting('barangay_address') || '',
    municipality: getSetting('municipality') || '',
    province: getSetting('province') || '',
    date: formatDate(new Date()),
    year: String(new Date().getFullYear()),
  };

  let result = html;

  // Resolve {{header}} tag
  result = result.replace(/\{\{header\}\}/g, buildHeaderHtml());

  // Resolve {{input:fieldName}} — replace with provided values or leave placeholder
  result = result.replace(/\{\{input:(\w+)\}\}/g, (match, fieldName) => {
    if (inputValues && inputValues[fieldName] !== undefined) {
      return inputValues[fieldName];
    }
    return `<span style="color:#666;text-decoration:underline;">___${fieldName}___</span>`;
  });

  // Resolve {{signatory:role}} tags
  result = resolveSignatories(result);

  // Resolve standard variables
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return result;
}

function getLogoBase64(): string | null {
  const logoPath = getSetting('barangay_logo_path');
  if (!logoPath || !fs.existsSync(logoPath)) return null;
  const ext = path.extname(logoPath).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const data = fs.readFileSync(logoPath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

function buildFullHtml(html: string): string {
  const barangayName = getSetting('barangay_name') || 'BARANGAY';
  const logoBase64 = getLogoBase64();

  const watermarkContent = logoBase64
    ? `<img src="${logoBase64}" class="watermark" />`
    : `<svg class="watermark" viewBox="0 0 420 420" xmlns="http://www.w3.org/2000/svg">
        <circle cx="210" cy="210" r="195" fill="none" stroke="#1a1a1a" stroke-width="4"/>
        <circle cx="210" cy="210" r="175" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
        <text x="210" y="160" text-anchor="middle" font-size="20" font-family="serif" font-weight="bold" fill="#1a1a1a">REPUBLIC OF THE</text>
        <text x="210" y="185" text-anchor="middle" font-size="20" font-family="serif" font-weight="bold" fill="#1a1a1a">PHILIPPINES</text>
        <text x="210" y="230" text-anchor="middle" font-size="28" font-family="serif" font-weight="bold" fill="#1a1a1a">${barangayName.toUpperCase()}</text>
        <text x="210" y="270" text-anchor="middle" font-size="14" font-family="serif" fill="#1a1a1a">OFFICIAL DOCUMENT</text>
      </svg>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 1in; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      position: relative;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.06;
      z-index: -1;
      width: 420px;
      height: 420px;
      pointer-events: none;
      object-fit: contain;
    }
    h1, h2, h3 { margin-top: 0; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #000; padding: 4px 8px; }
  </style>
</head>
<body>
  ${watermarkContent}
  ${html}
</body>
</html>`;
}

// Extract {{input:fieldName}} tags from template HTML
function extractInputFields(html: string): string[] {
  const regex = /\{\{input:(\w+)\}\}/g;
  const fields: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!fields.includes(match[1])) fields.push(match[1]);
  }
  return fields;
}

export function registerReportHandlers(): void {
  // Get input fields required by a template
  ipcMain.handle('reports:getInputFields', async (_event, templateId: number) => {
    const template = getTemplateById(templateId);
    if (!template) return [];
    return extractInputFields(template.content_html);
  });
  ipcMain.handle('reports:generate', async (_event, templateId: number, residentId: number, inputValues?: Record<string, string>) => {
    const template = getTemplateById(templateId);
    if (!template) return { success: false, error: 'Template not found' };

    const resident = getResidentById(residentId);
    if (!resident) return { success: false, error: 'Resident not found' };

    const resolvedHtml = resolveVariables(template.content_html, resident, inputValues);

    const user = getCurrentSessionUser();
    const reportId = createGeneratedReport({
      template_id: templateId,
      resident_id: residentId,
      content_html: resolvedHtml,
      generated_by: user?.id || 0,
    });

    logAudit(user?.id || null, 'REPORT_GENERATED',
      `Generated "${template.name}" for ${resident.first_name} ${resident.last_name}`);

    return { success: true, html: resolvedHtml, reportId };
  });

  ipcMain.handle('reports:exportPDF', async (_event, html: string, filename: string) => {
    try {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      const fullHtml = buildFullHtml(html);
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

      const pdfBuffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        pageSize: 'A4',
      });

      printWindow.close();

      const savePath = await require('electron').dialog.showSaveDialog({
        title: 'Save PDF',
        defaultPath: `${filename}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (savePath.canceled || !savePath.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      fs.writeFileSync(savePath.filePath, pdfBuffer);
      return { success: true, path: savePath.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('reports:print', async (_event, html: string) => {
    try {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      const fullHtml = buildFullHtml(html);
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

      // Small delay to ensure content is fully rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => {
          printWindow.close();
          if (!success && failureReason) {
            console.error('Print failed:', failureReason);
          }
        }
      );

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Multi-template generate: generate multiple templates for one resident
  ipcMain.handle('reports:generateMulti', async (_event, templateIds: number[], residentId: number) => {
    const resident = getResidentById(residentId);
    if (!resident) return { success: false, error: 'Resident not found' };

    const results: { templateName: string; html: string }[] = [];
    const user = getCurrentSessionUser();

    for (const tid of templateIds) {
      const template = getTemplateById(tid);
      if (!template) continue;
      const resolvedHtml = resolveVariables(template.content_html, resident);
      createGeneratedReport({
        template_id: tid,
        resident_id: residentId,
        content_html: resolvedHtml,
        generated_by: user?.id || 0,
      });
      results.push({ templateName: template.name, html: resolvedHtml });
    }

    logAudit(user?.id || null, 'REPORT_BATCH_GENERATED',
      `Generated ${results.length} reports for ${resident.first_name} ${resident.last_name}`);

    return { success: true, reports: results };
  });

  // Export multi-page PDF (each template on its own page)
  ipcMain.handle('reports:exportMultiPDF', async (_event, htmlPages: string[], filename: string) => {
    try {
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      const combinedHtml = htmlPages.map((html, i) => {
        const pageBreak = i < htmlPages.length - 1 ? 'page-break-after: always;' : '';
        return `<div style="${pageBreak}">${html}</div>`;
      }).join('\n');

      const fullHtml = buildFullHtml(combinedHtml);
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

      const pdfBuffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        pageSize: 'A4',
      });

      printWindow.close();

      const savePath = await require('electron').dialog.showSaveDialog({
        title: 'Save PDF',
        defaultPath: `${filename}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (savePath.canceled || !savePath.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      fs.writeFileSync(savePath.filePath, pdfBuffer);
      return { success: true, path: savePath.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Shared table CSS for all list prints
  const listTableCSS = `
    @page { size: A4; margin: 0.75in 0.75in 1in 0.75in; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .header { text-align: center; margin-bottom: 24px; }
    .header p { margin: 2px 0; font-size: 9pt; color: #666; }
    .header h2 { margin: 6px 0 2px; font-size: 16pt; font-weight: 700; letter-spacing: 0.5px; }
    .header h3 { margin: 2px 0 0; font-size: 11pt; font-weight: 600; color: #444; }
    .custom-header { margin-bottom: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    thead th {
      background: #f8f9fa;
      font-weight: 600;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #555;
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
      text-align: left;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #ddd;
      color: #333;
    }
    tbody tr.alt { background: #fafbfc; }
    .row-num {
      text-align: center;
      color: #999;
      font-size: 8pt;
      width: 30px;
    }
    .summary {
      margin-top: 16px;
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 8px;
    }
    .group-title { text-align: center; margin-bottom: 16px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .group-title h3 { margin: 0 0 4px; font-size: 12pt; font-weight: 600; color: #222; text-transform: uppercase; letter-spacing: 0.5px; }
    .group-label { font-size: 14pt; font-weight: 700; color: #111; }
    .group-count { font-size: 10pt; font-weight: 400; color: #666; }
    .group-summary {
      margin-top: 12px;
      font-size: 9pt;
      color: #666;
      text-align: right;
      font-style: italic;
    }
  `;

  const pdfOptions = {
    printBackground: true,
    landscape: false,
    pageSize: 'A4' as const,
    margins: { marginType: 'custom' as const, top: 0.5, bottom: 0.8, left: 0.5, right: 0.5 },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#999;font-family:sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  };

  // Helper: generate PDF buffer or print directly
  async function generateListPdf(html: string, mode: 'download' | 'print', defaultFilename: string): Promise<{ success: boolean; path?: string; error?: string }> {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(resolve => setTimeout(resolve, 400));

    if (mode === 'print') {
      return new Promise((resolve) => {
        printWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            printWindow.close();
            if (success) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: failureReason || 'Print failed' });
            }
          }
        );
      });
    }

    // Download mode
    const pdfBuffer = await printWindow.webContents.printToPDF(pdfOptions as any);
    printWindow.close();

    const savePath = await require('electron').dialog.showSaveDialog({
      title: 'Save List PDF',
      defaultPath: defaultFilename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (savePath.canceled || !savePath.filePath) {
      return { success: false, error: 'Save cancelled' };
    }

    fs.writeFileSync(savePath.filePath, pdfBuffer);
    return { success: true, path: savePath.filePath };
  }

  // Print resident list as table
  ipcMain.handle('reports:printList', async (_event, options: {
    headerHtml: string;
    rows: any[];
    columns: { key: string; label: string }[];
    title: string;
    mode?: 'download' | 'print';
  }) => {
    try {
      const barangayName = getSetting('barangay_name') || 'BARANGAY';
      const municipality = getSetting('municipality') || '';
      const province = getSetting('province') || '';
      const logoBase64 = getLogoBase64();

      const watermark = logoBase64
        ? `<img src="${logoBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.05;width:400px;height:400px;object-fit:contain;z-index:-1;pointer-events:none;" />`
        : '';

      const tableHeaders = options.columns.map(c => `<th>${c.label}</th>`).join('');
      const tableRows = options.rows.map((row, i) => {
        const cells = options.columns.map(c => `<td>${row[c.key] ?? '-'}</td>`).join('');
        return `<tr class="${i % 2 === 1 ? 'alt' : ''}"><td class="row-num">${i + 1}</td>${cells}</tr>`;
      }).join('');

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${listTableCSS}</style>
</head>
<body>
  ${watermark}
  ${options.headerHtml ? `<div class="custom-header">${options.headerHtml}</div>` : `
  <div class="header">
    <p>Republic of the Philippines</p>
    <p>${municipality}${province ? ', ' + province : ''}</p>
    <h2>${barangayName}</h2>
    <h3>${options.title}</h3>
  </div>`}
  <table>
    <thead><tr><th class="row-num">#</th>${tableHeaders}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="summary">Total: <strong>${options.rows.length}</strong> records</div>
</body>
</html>`;

      const filename = `${options.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      return await generateListPdf(fullHtml, options.mode || 'download', filename);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Print grouped resident list — each group on a fresh page
  ipcMain.handle('reports:printGroupedList', async (_event, options: {
    headerHtml: string;
    groups: { groupLabel: string; rows: any[] }[];
    columns: { key: string; label: string }[];
    title: string;
    groupByLabel: string;
    mode?: 'download' | 'print';
  }) => {
    try {
      const barangayName = getSetting('barangay_name') || 'BARANGAY';
      const municipality = getSetting('municipality') || '';
      const province = getSetting('province') || '';
      const logoBase64 = getLogoBase64();

      const watermark = logoBase64
        ? `<img src="${logoBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.05;width:400px;height:400px;object-fit:contain;z-index:-1;pointer-events:none;" />`
        : '';

      const tableHeaders = options.columns.map(c => `<th>${c.label}</th>`).join('');

      const headerBlock = options.headerHtml
        ? `<div class="custom-header">${options.headerHtml}</div>`
        : `<div class="header">
            <p>Republic of the Philippines</p>
            <p>${municipality}${province ? ', ' + province : ''}</p>
            <h2>${barangayName}</h2>
          </div>`;

      const groupPages = options.groups.map((group, groupIdx) => {
        const tableRows = group.rows.map((row, i) => {
          const cells = options.columns.map(c => `<td>${row[c.key] ?? '-'}</td>`).join('');
          return `<tr class="${i % 2 === 1 ? 'alt' : ''}"><td class="row-num">${i + 1}</td>${cells}</tr>`;
        }).join('');

        const pageBreak = groupIdx < options.groups.length - 1 ? 'page-break-after: always;' : '';

        return `
          <div class="group-page" style="${pageBreak}">
            ${headerBlock}
            <div class="group-title">
              <h3>${options.title}</h3>
              <div class="group-label">${group.groupLabel} <span class="group-count">(${group.rows.length} records)</span></div>
            </div>
            <table>
              <thead><tr><th class="row-num">#</th>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="group-summary">${group.rows.length} records in this group</div>
          </div>`;
      }).join('\n');

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${listTableCSS}</style>
</head>
<body>
  ${watermark}
  ${groupPages}
</body>
</html>`;

      const filename = `${options.title.replace(/[^a-zA-Z0-9]/g, '_')}_by_${options.groupByLabel.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      return await generateListPdf(fullHtml, options.mode || 'download', filename);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
