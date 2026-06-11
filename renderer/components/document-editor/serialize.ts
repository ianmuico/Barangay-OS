import { TEMPLATE_VARIABLES } from '@/lib/constants';
import { getAPI, type Official } from '@/lib/ipc';

const VAR_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map(v => [v.key, v.label])
);

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ─── Stored {{...}} tags → editor chip elements ──────────────────────────────
export function tagsToChips(html: string): string {
  let result = html;
  result = result.replace(/\{\{header\}\}/g, '<div data-chip-block="header"></div>');
  result = result.replace(/\{\{input:(\w+)\}\}/g, (_m, key) =>
    `<span data-chip="input" data-key="${escapeAttr(key)}" data-label="✎ ${escapeAttr(key)}"></span>`);
  result = result.replace(/\{\{signatory:(\w+)\}\}/g, (_m, key) =>
    `<span data-chip="signatory" data-key="${escapeAttr(key)}" data-label="✍ ${escapeAttr(prettyRole(key))}"></span>`);
  result = result.replace(/\{\{official:(\w+)\}\}/g, (_m, key) =>
    `<span data-chip="official" data-key="${escapeAttr(key)}" data-label="${escapeAttr(prettyRole(key))}"></span>`);
  result = result.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    `<span data-chip="var" data-key="${escapeAttr(key)}" data-label="${escapeAttr(VAR_LABELS[key] || key)}"></span>`);
  return result;
}

// ─── Editor chip elements → stored {{...}} tags ──────────────────────────────
export function chipsToTags(html: string): string {
  if (typeof document === 'undefined') return html;
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('span[data-chip]').forEach((el) => {
    const kind = el.getAttribute('data-chip') || 'var';
    const key = el.getAttribute('data-key') || '';
    const tag = kind === 'var' ? `{{${key}}}` : `{{${kind}:${key}}}`;
    el.replaceWith(document.createTextNode(tag));
  });

  container.querySelectorAll('div[data-chip-block="header"]').forEach((el) => {
    el.replaceWith(document.createTextNode('{{header}}'));
  });

  return container.innerHTML;
}

export function prettyRole(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Position name → tag-friendly role key, e.g. "Punong Barangay" → "punong_barangay"
export function roleKeyFromPosition(position: string): string {
  return position.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Sample-data preview resolution (client-side mirror of main/ipc/reports.ts) ──
export const SAMPLE_RESIDENT: Record<string, string> = {
  fullName: 'Juan D. Dela Cruz Jr.',
  firstName: 'Juan',
  middleName: 'Dimagiba',
  lastName: 'Dela Cruz',
  suffix: 'Jr.',
  middleInitial: 'D.',
  purok: '3',
  address: 'Purok 3, Sample Street',
  birthDate: 'January 15, 1990',
  age: '36',
  gender: 'Male',
  civilStatus: 'Married',
  contactNumber: '0917 123 4567',
  email: 'juan.delacruz@example.com',
  occupation: 'Farmer',
  voterStatus: 'Registered',
  bloodType: 'O+',
  partnerName: 'Maria Santos Dela Cruz',
  religion: 'Roman Catholic',
  citizenship: 'Filipino',
  philsysCardNo: '1234-5678-9012-3456',
  educationalAttainment: 'High School Graduate',
};

function ordinal(n: number): string {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export interface PreviewContext {
  barangay: string;
  barangayAddress: string;
  municipality: string;
  province: string;
  logoDataUrl?: string | null;
  headerTemplate?: string | null; // custom letterhead from Settings → Barangay
  officials: Official[];
}

// Mirrors buildHeaderHtml in main/ipc/reports.ts — used by the editor's
// letterhead preview and the sample-data preview.
export function buildLetterheadHtml(ctx: Pick<PreviewContext, 'barangay' | 'municipality' | 'province' | 'logoDataUrl' | 'headerTemplate'>): string {
  const barangay = ctx.barangay || 'BARANGAY';
  const municipality = ctx.municipality || '';
  const province = ctx.province || '';
  const logoImg = ctx.logoDataUrl
    ? `<img src="${ctx.logoDataUrl}" style="width:70px;height:70px;object-fit:contain;" />`
    : '';

  if (ctx.headerTemplate) {
    let html = ctx.headerTemplate;
    html = html.replace(/\{\{barangay\}\}/g, barangay);
    html = html.replace(/\{\{municipality\}\}/g, municipality);
    html = html.replace(/\{\{province\}\}/g, province);
    html = html.replace(/\{\{logo\}\}/g, logoImg);
    return `<div data-letterhead>${html}</div>`;
  }

  return `<div data-letterhead style="text-align:center;margin-bottom:16px;">
    <table style="width:100%;border:none;border-collapse:collapse;">
      <tr>
        <td style="width:80px;text-align:center;border:none;padding:0;vertical-align:middle;">${logoImg}</td>
        <td style="text-align:center;border:none;padding:0;vertical-align:middle;">
          <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
          <p style="margin:0;font-size:10pt;">Province of ${province}</p>
          <p style="margin:0;font-size:10pt;">Municipality of ${municipality}</p>
          <p style="margin:2px 0 0;font-size:13pt;font-weight:bold;">${barangay}</p>
        </td>
        <td style="width:80px;border:none;padding:0;"></td>
      </tr>
    </table>
  </div>`;
}

export function resolvePreviewHtml(taggedHtml: string, ctx: PreviewContext): string {
  const now = new Date();
  const month = now.toLocaleDateString('en-PH', { month: 'long' });
  const vars: Record<string, string> = {
    ...SAMPLE_RESIDENT,
    barangay: ctx.barangay || 'Barangay Name',
    barangayAddress: ctx.barangayAddress || '',
    municipality: ctx.municipality || 'Municipality',
    province: ctx.province || 'Province',
    date: now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    dateOrdinal: `${ordinal(now.getDate())} day of ${month}, ${now.getFullYear()}`,
    year: String(now.getFullYear()),
  };

  const headerHtml = buildLetterheadHtml(ctx);

  const findOfficial = (role: string) => {
    const roleKey = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ctx.officials.find(o => {
      const pos = o.position.toLowerCase().replace(/[^a-z0-9]/g, '');
      return pos.includes(roleKey) || roleKey.includes(pos);
    });
  };

  let result = taggedHtml;
  result = result.replace(/\{\{header\}\}/g, headerHtml);
  result = result.replace(/\{\{input:(\w+)\}\}/g, (_m, f) =>
    `<span style="color:#666;text-decoration:underline;">___${f}___</span>`);
  result = result.replace(/\{\{official:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    return o ? [o.first_name, o.last_name].filter(Boolean).join(' ')
      : `<span style="color:#666;text-decoration:underline;">___${role}___</span>`;
  });
  result = result.replace(/\{\{signatory:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    const name = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').toUpperCase() : '_________________________';
    const position = o ? o.position : prettyRole(role);
    return `<div style="text-align:center;margin-top:40px;">
      <div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">
        <strong>${name}</strong><br/>
        <span style="font-size:10pt;">${position}</span>
      </div>
    </div>`;
  });
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

// ─── One-off case document resolution ────────────────────────────────────────
// Resolves a template (or blank scaffold) against a specific case so the admin
// can edit the finished document directly in the editor before printing.
export interface CaseDocContext extends PreviewContext {
  caseNumber: string;
  caseType: string;
  caseStatus: string;
  filedDate: string;
  caseDescription: string;
  complainants: string; // "Juan Cruz, Maria Santos"
  respondents: string;
}

export function resolveCaseDocumentHtml(taggedHtml: string, ctx: CaseDocContext): string {
  const now = new Date();
  const month = now.toLocaleDateString('en-PH', { month: 'long' });
  const caseVars: Record<string, string> = {
    caseNumber: ctx.caseNumber,
    caseType: ctx.caseType,
    caseStatus: ctx.caseStatus,
    filedDate: ctx.filedDate ? new Date(ctx.filedDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    caseDescription: ctx.caseDescription,
    complainants: ctx.complainants,
    respondents: ctx.respondents,
    barangay: ctx.barangay,
    barangayAddress: ctx.barangayAddress,
    municipality: ctx.municipality,
    province: ctx.province,
    date: now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    dateOrdinal: `${ordinal(now.getDate())} day of ${month}, ${now.getFullYear()}`,
    year: String(now.getFullYear()),
  };

  const findOfficial = (role: string) => {
    const roleKey = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ctx.officials.find(o => {
      const pos = o.position.toLowerCase().replace(/[^a-z0-9]/g, '');
      return pos.includes(roleKey) || roleKey.includes(pos);
    });
  };

  let result = taggedHtml;
  // Header stays a live template block — it renders the current letterhead in
  // the editor (hover to edit it) and resolves at print/export time.
  result = result.replace(/\{\{header\}\}/g, '<div data-chip-block="header"></div>');
  result = result.replace(/\{\{official:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    return o ? [o.first_name, o.last_name].filter(Boolean).join(' ') : `<span style="text-decoration:underline;color:#666;">___${role}___</span>`;
  });
  result = result.replace(/\{\{signatory:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    const name = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').toUpperCase() : '_________________________';
    const position = o ? o.position : prettyRole(role);
    return `<div style="text-align:center;margin-top:40px;"><div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;"><strong>${name}</strong><br/><span style="font-size:10pt;">${position}</span></div></div>`;
  });
  for (const [key, value] of Object.entries(caseVars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  // Input fields and any leftover resident variables become editable blanks
  result = result.replace(/\{\{input:(\w+)\}\}/g, (_m, f) =>
    `<span style="text-decoration:underline;color:#666;">___${f}___</span>`);
  result = result.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    `<span style="text-decoration:underline;color:#666;">___${key}___</span>`);
  return result;
}

// ─── One-off resident document resolution ───────────────────────────────────
// Same idea as case documents, but tied to a resident: all resident variables
// resolve to their real values so the admin edits a finished document.
function calcAgeFromBirth(birthDate?: string | null): string {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

export function residentVars(resident: any): Record<string, string> {
  const fullName = [resident.first_name, resident.middle_name, resident.last_name, resident.suffix].filter(Boolean).join(' ');
  return {
    fullName,
    firstName: resident.first_name || '',
    middleName: resident.middle_name || '',
    lastName: resident.last_name || '',
    suffix: resident.suffix || '',
    middleInitial: resident.middle_name ? resident.middle_name.charAt(0) + '.' : '',
    purok: resident.purok || '',
    address: resident.address || '',
    birthDate: resident.birth_date ? new Date(resident.birth_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    age: resident.age !== undefined && resident.age !== null ? String(resident.age) : calcAgeFromBirth(resident.birth_date),
    gender: resident.gender || '',
    civilStatus: resident.civil_status || '',
    contactNumber: resident.contact_number || '',
    email: resident.email || '',
    occupation: resident.occupation || '',
    voterStatus: resident.voter_status || '',
    bloodType: resident.blood_type || '',
    partnerName: resident.partner_name || '',
    religion: resident.religion || '',
    citizenship: resident.citizenship || 'Filipino',
    philsysCardNo: resident.philsys_card_no || '',
    educationalAttainment: resident.educational_attainment || '',
  };
}

export function resolveResidentDocumentHtml(taggedHtml: string, resident: any, ctx: PreviewContext): string {
  const now = new Date();
  const month = now.toLocaleDateString('en-PH', { month: 'long' });
  const vars: Record<string, string> = {
    ...residentVars(resident),
    barangay: ctx.barangay,
    barangayAddress: ctx.barangayAddress,
    municipality: ctx.municipality,
    province: ctx.province,
    date: now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    dateOrdinal: `${ordinal(now.getDate())} day of ${month}, ${now.getFullYear()}`,
    year: String(now.getFullYear()),
  };

  const findOfficial = (role: string) => {
    const roleKey = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ctx.officials.find(o => {
      const pos = o.position.toLowerCase().replace(/[^a-z0-9]/g, '');
      return pos.includes(roleKey) || roleKey.includes(pos);
    });
  };

  let result = taggedHtml;
  result = result.replace(/\{\{header\}\}/g, '<div data-chip-block="header"></div>');
  result = result.replace(/\{\{official:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    return o ? [o.first_name, o.last_name].filter(Boolean).join(' ') : `<span style="text-decoration:underline;color:#666;">___${role}___</span>`;
  });
  result = result.replace(/\{\{signatory:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    const name = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').toUpperCase() : '_________________________';
    const position = o ? o.position : prettyRole(role);
    return `<div style="text-align:center;margin-top:40px;"><div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;"><strong>${name}</strong><br/><span style="font-size:10pt;">${position}</span></div></div>`;
  });
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  result = result.replace(/\{\{input:(\w+)\}\}/g, (_m, f) =>
    `<span style="text-decoration:underline;color:#666;">___${f}___</span>`);
  result = result.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    `<span style="text-decoration:underline;color:#666;">___${key}___</span>`);
  return result;
}


// ─── One-off business document resolution ────────────────────────────────────
// Business variables resolve from the business record; resident variables
// resolve from the FIRST resident owner (e.g. for Business Clearance wording).
export interface BusinessDocContext extends PreviewContext {
  business: {
    name: string;
    nature?: string | null;
    address?: string | null;
    purok?: string | null;
    status?: string;
    date_registered?: string | null;
  };
  ownerNames: string; // "Juan Cruz, Maria Santos"
  primaryResidentOwner?: any | null; // full resident record of the first resident owner
}

export function resolveBusinessDocumentHtml(taggedHtml: string, ctx: BusinessDocContext): string {
  const now = new Date();
  const month = now.toLocaleDateString('en-PH', { month: 'long' });
  const vars: Record<string, string> = {
    ...(ctx.primaryResidentOwner ? residentVars(ctx.primaryResidentOwner) : {}),
    businessName: ctx.business.name,
    businessNature: ctx.business.nature || '',
    businessAddress: ctx.business.address || '',
    businessPurok: ctx.business.purok || '',
    businessOwners: ctx.ownerNames,
    businessStatus: ctx.business.status === 'closed' ? 'Closed' : 'Active',
    businessDateRegistered: ctx.business.date_registered
      ? new Date(ctx.business.date_registered).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
      : '',
    barangay: ctx.barangay,
    barangayAddress: ctx.barangayAddress,
    municipality: ctx.municipality,
    province: ctx.province,
    date: now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    dateOrdinal: `${ordinal(now.getDate())} day of ${month}, ${now.getFullYear()}`,
    year: String(now.getFullYear()),
  };

  const findOfficial = (role: string) => {
    const roleKey = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ctx.officials.find(o => {
      const pos = o.position.toLowerCase().replace(/[^a-z0-9]/g, '');
      return pos.includes(roleKey) || roleKey.includes(pos);
    });
  };

  let result = taggedHtml;
  result = result.replace(/\{\{header\}\}/g, '<div data-chip-block="header"></div>');
  result = result.replace(/\{\{official:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    return o ? [o.first_name, o.last_name].filter(Boolean).join(' ') : `<span style="text-decoration:underline;color:#666;">___${role}___</span>`;
  });
  result = result.replace(/\{\{signatory:(\w+)\}\}/g, (_m, role) => {
    const o = findOfficial(role);
    const name = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').toUpperCase() : '_________________________';
    const position = o ? o.position : prettyRole(role);
    return `<div style="text-align:center;margin-top:40px;"><div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;"><strong>${name}</strong><br/><span style="font-size:10pt;">${position}</span></div></div>`;
  });
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  result = result.replace(/\{\{input:(\w+)\}\}/g, (_m, f) =>
    `<span style="text-decoration:underline;color:#666;">___${f}___</span>`);
  result = result.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    `<span style="text-decoration:underline;color:#666;">___${key}___</span>`);
  return result;
}

export function blankBusinessDocumentHtml(ctx: BusinessDocContext): string {
  return resolveBusinessDocumentHtml(
    `{{header}}<h2 style="text-align:center;">{{input:document_title}}</h2><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{businessName}}</strong>${ctx.business.nature ? ', a {{businessNature}} business' : ''}, owned by <strong>{{businessOwners}}</strong>, is operating at {{businessAddress}}${ctx.business.purok ? ', Purok {{businessPurok}}' : ''}, {{barangay}}, {{municipality}}, {{province}}.</p><p style="text-indent:40px;">Start writing the document here...</p><p style="text-indent:40px;">Issued this {{dateOrdinal}} at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}`,
    ctx,
  );
}

// Resolve header markers/tags into the actual letterhead for on-screen display
// (previews). Print/export resolves them in the main process instead.
export async function resolveHeaderForDisplay(html: string): Promise<string> {
  if (!/data-chip-block="header"|\{\{header\}\}/.test(html)) return html;
  const api = getAPI();
  if (!api) return html;
  try {
    const [barangay, municipality, province, headerTemplate, logo] = await Promise.all([
      api.getSetting('barangay_name'),
      api.getSetting('municipality'),
      api.getSetting('province'),
      api.getSetting('header_template'),
      api.getLogoBase64(),
    ]);
    const head = buildLetterheadHtml({
      barangay: barangay || '',
      municipality: municipality || '',
      province: province || '',
      headerTemplate: headerTemplate || null,
      logoDataUrl: logo,
    });
    return html
      .replace(/<div[^>]*data-chip-block="header"[^>]*>\s*<\/div>/g, head)
      .replace(/\{\{header\}\}/g, head);
  } catch {
    return html;
  }
}

export function blankResidentDocumentHtml(resident: any, ctx: PreviewContext): string {
  return resolveResidentDocumentHtml(
    `{{header}}<h2 style="text-align:center;">{{input:document_title}}</h2><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, and a resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}.</p><p style="text-indent:40px;">Start writing the document here...</p><p style="text-indent:40px;">Issued this {{dateOrdinal}} at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}`,
    resident,
    ctx,
  );
}

// Default scaffold when starting a case document from scratch
export function blankCaseDocumentHtml(ctx: CaseDocContext): string {
  return resolveCaseDocumentHtml(
    `{{header}}<p style="text-align:center;font-size:10pt;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p><h2 style="text-align:center;">{{input:document_title}}</h2><p style="text-align:center;font-size:10pt;">Case No. {{caseNumber}} — Filed {{filedDate}}</p><p><strong>Complainant(s):</strong> {{complainants}}</p><p><strong>Respondent(s):</strong> {{respondents}}</p><p></p><p style="text-indent:40px;">Start writing the document here...</p><p style="text-indent:40px;">Issued this {{dateOrdinal}} at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}`,
    ctx,
  );
}
