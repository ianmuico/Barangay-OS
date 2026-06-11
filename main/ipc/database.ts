import { ipcMain, dialog, app } from 'electron';
import path from 'path';
import fs from 'fs';
import * as residents from '../database/queries/residents';
import * as users from '../database/queries/users';
import * as templates from '../database/queries/templates';
import * as reports from '../database/queries/reports';
import * as settings from '../database/queries/settings';
import * as households from '../database/queries/households';
import * as audit from '../database/queries/audit';
import * as issues from '../database/queries/issues';
import * as businesses from '../database/queries/businesses';
import * as officials from '../database/queries/officials';
import { hashPasswordSync, verifyPasswordSync } from '../utils/hash';
import { getCurrentSessionUser } from './auth';
import * as importModule from '../database/queries/import';
import * as cases from '../database/queries/cases';
import * as analytics from '../database/queries/analytics';
import { logError } from '../utils/logger';

// ─── RBAC: Role-based access control ─────────────────────────────────
function requireAuth(): ReturnType<typeof getCurrentSessionUser> {
  const user = getCurrentSessionUser();
  if (!user) throw new Error('Not authenticated');
  return user;
}

function requireAdmin(): ReturnType<typeof getCurrentSessionUser> {
  const user = requireAuth();
  if (user!.role !== 'admin') throw new Error('Admin access required');
  return user;
}

export function registerDatabaseHandlers(): void {
  // === Residents ===
  ipcMain.handle('db:residents:list', async (_event, params) => {
    return residents.listResidents(params);
  });

  ipcMain.handle('db:residents:get', async (_event, id: number) => {
    return residents.getResidentById(id);
  });

  ipcMain.handle('db:residents:search', async (_event, query: string, limit?: number) => {
    return residents.searchResidents(query, limit);
  });

  ipcMain.handle('db:residents:create', async (_event, data) => {
    const id = residents.createResident(data);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'RESIDENT_CREATED', `Created resident: ${data.first_name} ${data.last_name}`);
    return id;
  });

  ipcMain.handle('db:residents:update', async (_event, id: number, data) => {
    residents.updateResident(id, data);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'RESIDENT_UPDATED', `Updated resident ID: ${id}`);
    return { success: true };
  });

  ipcMain.handle('db:residents:delete', async (_event, id: number) => {
    const user = requireAdmin();
    const resident = residents.getResidentById(id);
    residents.deleteResident(id);
    audit.logAudit(user!.id, 'RESIDENT_DELETED', `Deleted resident: ${resident?.first_name} ${resident?.last_name}`);
    return { success: true };
  });

  ipcMain.handle('db:residents:linkPartner', async (_event, residentId: number, partnerId: number) => {
    residents.linkPartner(residentId, partnerId);
    return { success: true };
  });

  ipcMain.handle('db:residents:unlinkPartner', async (_event, residentId: number) => {
    residents.unlinkPartner(residentId);
    return { success: true };
  });

  ipcMain.handle('db:residents:tree', async () => {
    return residents.getAllResidentsForTree();
  });

  ipcMain.handle('db:residents:relationships', async () => {
    return residents.getPartnerRelationships();
  });

  ipcMain.handle('db:residents:children', async (_event, residentId: number) => {
    return residents.getChildrenOf(residentId);
  });

  ipcMain.handle('db:residents:addChild', async (_event, parentId: number, parentGender: string, childId: number) => {
    residents.addChildLink(parentId, parentGender, childId);
    return { success: true };
  });

  ipcMain.handle('db:residents:removeChild', async (_event, parentId: number, parentGender: string, childId: number) => {
    residents.removeChildLink(parentId, parentGender, childId);
    return { success: true };
  });

  // === Households ===
  ipcMain.handle('db:households:list', async () => {
    return households.listHouseholds();
  });

  ipcMain.handle('db:households:create', async (_event, data) => {
    return households.createHousehold(data);
  });

  ipcMain.handle('db:households:update', async (_event, id: number, data) => {
    households.updateHousehold(id, data);
    return { success: true };
  });

  ipcMain.handle('db:households:delete', async (_event, id: number) => {
    households.deleteHousehold(id);
    return { success: true };
  });

  // === Users (admin-only for create/delete/reset) ===
  ipcMain.handle('db:users:list', async () => {
    requireAdmin();
    return users.listUsers();
  });

  ipcMain.handle('db:users:create', async (_event, data) => {
    const user = requireAdmin();
    const hash = hashPasswordSync(data.password);
    const id = users.createUser({
      username: data.username,
      password_hash: hash,
      role: data.role,
      full_name: data.full_name,
    });
    audit.logAudit(user!.id, 'USER_CREATED', `Created user: ${data.username}`);
    return id;
  });

  ipcMain.handle('db:users:update', async (_event, id: number, data) => {
    requireAdmin();
    users.updateUser(id, data);
    return { success: true };
  });

  ipcMain.handle('db:users:delete', async (_event, id: number) => {
    const user = requireAdmin();
    const targetUser = users.getUserById(id);
    users.deleteUser(id);
    audit.logAudit(user!.id, 'USER_DELETED', `Deleted user: ${targetUser?.username}`);
    return { success: true };
  });

  ipcMain.handle('db:users:updatePassword', async (_event, id: number, oldPassword: string, newPassword: string) => {
    requireAuth();
    const user = users.getUserById(id);
    if (!user) return { success: false, error: 'User not found' };

    if (!verifyPasswordSync(oldPassword, user.password_hash)) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const hash = hashPasswordSync(newPassword);
    users.updatePassword(id, hash);
    return { success: true };
  });

  // Admin reset password (no old password required — admin-only)
  ipcMain.handle('db:users:resetPassword', async (_event, id: number, newPassword: string) => {
    requireAdmin();
    const hash = hashPasswordSync(newPassword);
    users.updatePassword(id, hash);
    return { success: true };
  });

  // === Templates ===
  ipcMain.handle('db:templates:list', async () => {
    return templates.listTemplates();
  });

  ipcMain.handle('db:templates:get', async (_event, id: number) => {
    return templates.getTemplateById(id);
  });

  ipcMain.handle('db:templates:create', async (_event, data) => {
    const user = getCurrentSessionUser();
    return templates.createTemplate({ ...data, created_by: user?.id || null });
  });

  ipcMain.handle('db:templates:update', async (_event, id: number, data) => {
    templates.updateTemplate(id, data);
    return { success: true };
  });

  ipcMain.handle('db:templates:delete', async (_event, id: number) => {
    templates.deleteTemplate(id);
    return { success: true };
  });

  // === Generated Reports ===
  ipcMain.handle('db:reports:list', async (_event, residentId?: number) => {
    return reports.listGeneratedReports(residentId);
  });

  // Custom/case documents: explicit saves AND every print/export is kept.
  // Pass `id` to update an existing saved document in place.
  ipcMain.handle('db:reports:saveDoc', async (_event, data: { id?: number; case_id?: number | null; resident_id?: number | null; business_id?: number | null; title: string; content_html: string }) => {
    const user = getCurrentSessionUser();
    if (data.id) {
      reports.updateGeneratedReport(data.id, { title: data.title, content_html: data.content_html });
      return data.id;
    }
    const id = reports.createGeneratedReport({
      case_id: data.case_id ?? null,
      resident_id: data.resident_id ?? null,
      business_id: data.business_id ?? null,
      title: data.title,
      content_html: data.content_html,
      generated_by: user?.id || 0,
    });
    audit.logAudit(user?.id || null, 'DOCUMENT_SAVED', `Saved "${data.title}"`);
    return id;
  });
  // Back-compat alias
  ipcMain.handle('db:reports:saveCaseDoc', async (_event, data: { case_id: number; title: string; content_html: string }) => {
    const user = getCurrentSessionUser();
    const id = reports.createGeneratedReport({
      case_id: data.case_id,
      title: data.title,
      content_html: data.content_html,
      generated_by: user?.id || 0,
    });
    audit.logAudit(user?.id || null, 'CASE_DOC_SAVED', `Saved "${data.title}"`);
    return id;
  });
  ipcMain.handle('db:reports:get', async (_event, id: number) => {
    return reports.getGeneratedReportById(id);
  });
  ipcMain.handle('db:reports:delete', async (_event, id: number) => {
    requireAdmin();
    reports.deleteGeneratedReport(id);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'DOCUMENT_DELETED', `Deleted generated document #${id}`);
    return { success: true };
  });
  ipcMain.handle('db:reports:listDocs', async (_event, params: { search?: string; type?: 'all' | 'resident' | 'case' | 'business'; page?: number; limit?: number }) => {
    return reports.listDocuments(params || {});
  });
  ipcMain.handle('db:reports:listByCase', async (_event, caseId: number) => {
    return reports.listCaseDocuments(caseId);
  });

  // Storage failsafe for generated documents
  ipcMain.handle('db:reports:storageStats', async () => {
    return reports.getReportStorageStats();
  });
  ipcMain.handle('db:reports:cleanup', async (_event, olderThanDays: number) => {
    requireAdmin();
    const deleted = reports.cleanupGeneratedReports(olderThanDays);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'REPORTS_CLEANED', `Deleted ${deleted} generated documents older than ${olderThanDays} days`);
    return { success: true, deleted };
  });

  // Upcoming summons (for reminders)
  ipcMain.handle('db:summons:upcoming', async (_event, limit?: number) => {
    return cases.getUpcomingSummons(limit || 50);
  });

  // === Officials ===
  ipcMain.handle('db:officials:list', async () => {
    return officials.listOfficials();
  });

  ipcMain.handle('db:officials:get', async (_event, id: number) => {
    return officials.getOfficialById(id);
  });

  ipcMain.handle('db:officials:create', async (_event, data) => {
    const id = officials.createOfficial(data);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'OFFICIAL_CREATED', `Created official: ${data.position}`);
    return id;
  });

  ipcMain.handle('db:officials:update', async (_event, id: number, data) => {
    officials.updateOfficial(id, data);
    return { success: true };
  });

  ipcMain.handle('db:officials:delete', async (_event, id: number) => {
    officials.deleteOfficial(id);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'OFFICIAL_DELETED', `Deleted official ID: ${id}`);
    return { success: true };
  });

  // === Settings ===
  ipcMain.handle('db:settings:get', async (_event, key: string) => {
    return settings.getSetting(key);
  });

  ipcMain.handle('db:settings:set', async (_event, key: string, value: string) => {
    settings.setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle('db:settings:getAll', async () => {
    return settings.getAllSettings();
  });

  // === Dashboard ===
  ipcMain.handle('db:dashboard:stats', async () => {
    return {
      totalResidents: residents.getResidentCount(),
      totalSeniors: residents.getSeniorCount(),
      totalIndigents: residents.getIndigentCount(),
      totalYouth: residents.getYouthCount(),
      total4Ps: residents.get4PsCount(),
      totalPWD: residents.getPwdCount(),
    };
  });

  ipcMain.handle('db:dashboard:detailed', async () => {
    const db = (await import('../database/connection')).getDb();
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

    return {
      genderDistribution: residents.getGenderDistribution(),
      ageDistribution: residents.getAgeDistribution(),
      seniorAgeBrackets: residents.getSeniorAgeBrackets(),
      indigentsByPurok: residents.getIndigentsByPurok(),
      youthByAge: residents.getYouthBreakdown(),
      youthByOccupation: residents.getYouthByOccupation(),
      residentsByPurok: residents.getResidentsByPurok(),
      civilStatusDistribution: db.prepare(
        "SELECT COALESCE(civil_status, 'Unknown') as status, COUNT(*) as count FROM residents WHERE status != 'deceased' GROUP BY civil_status ORDER BY count DESC"
      ).all(),
      voterStats: {
        registered: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(COALESCE(voter_status,'')) = 'registered'"),
        notRegistered: count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(COALESCE(voter_status,'')) != 'registered'"),
      },
      monthlyRegistrations: db.prepare(
        "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM residents WHERE created_at >= date('now', '-12 months') GROUP BY month ORDER BY month ASC"
      ).all(),
      caseStats: {
        total: count('SELECT COUNT(*) n FROM cases'),
        pending: count("SELECT COUNT(*) n FROM cases WHERE status = 'pending'"),
        ongoing: count("SELECT COUNT(*) n FROM cases WHERE status = 'ongoing'"),
        resolved: count("SELECT COUNT(*) n FROM cases WHERE status = 'resolved'"),
        dismissed: count("SELECT COUNT(*) n FROM cases WHERE status = 'dismissed'"),
      },
      householdCount: count('SELECT COUNT(*) n FROM households'),
      deceasedCount: count("SELECT COUNT(*) n FROM residents WHERE status = 'deceased'"),
      upcomingSummons: cases.getUpcomingSummons(5),
      activeCases: cases.listCases({}).filter(c => c.status === 'pending' || c.status === 'ongoing').slice(0, 6)
        .map(c => ({
          id: c.id, case_number: c.case_number, case_type: c.case_type, status: c.status,
          filed_date: c.filed_date,
          parties: [c.complainant_names || c.complainant_name, c.respondent_names || c.respondent_name].filter(Boolean).join(' vs '),
        })),
    };
  });

  // === Resident issues (behavior flags) ===
  ipcMain.handle('db:issues:list', async (_event, residentId: number) => {
    return issues.listIssuesForResident(residentId);
  });
  ipcMain.handle('db:issues:create', async (_event, data: { resident_id: number; title: string; details?: string | null }) => {
    const user = getCurrentSessionUser();
    const id = issues.createIssue({ ...data, created_by: user?.id || 0 });
    audit.logAudit(user?.id || null, 'ISSUE_CREATED', `Flagged resident #${data.resident_id}: ${data.title}`);
    return id;
  });
  ipcMain.handle('db:issues:update', async (_event, id: number, data: any) => {
    issues.updateIssue(id, data);
    return { success: true };
  });
  ipcMain.handle('db:issues:delete', async (_event, id: number) => {
    issues.deleteIssue(id);
    return { success: true };
  });
  ipcMain.handle('db:issues:flagged', async (_event, search?: string) => {
    return issues.listFlaggedResidents(search);
  });

  // === Businesses ===
  ipcMain.handle('db:businesses:list', async (_event, params?: { search?: string; status?: string }) => {
    return businesses.listBusinesses(params);
  });
  ipcMain.handle('db:businesses:owners', async (_event, businessId: number) => {
    return businesses.getBusinessOwners(businessId);
  });
  ipcMain.handle('db:businesses:create', async (_event, data: any, owners: any[]) => {
    const id = businesses.createBusiness(data, owners || []);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'BUSINESS_CREATED', `Registered business "${data.name}"`);
    return id;
  });
  ipcMain.handle('db:businesses:update', async (_event, id: number, data: any, owners?: any[]) => {
    businesses.updateBusiness(id, data, owners);
    return { success: true };
  });
  ipcMain.handle('db:businesses:delete', async (_event, id: number) => {
    businesses.deleteBusiness(id);
    return { success: true };
  });

  // === Outside owners ===
  ipcMain.handle('db:outsiders:list', async (_event, search?: string) => {
    return businesses.listOutsideOwners(search);
  });
  ipcMain.handle('db:outsiders:create', async (_event, data: any) => {
    return businesses.createOutsideOwner(data);
  });
  ipcMain.handle('db:outsiders:update', async (_event, id: number, data: any) => {
    businesses.updateOutsideOwner(id, data);
    return { success: true };
  });
  ipcMain.handle('db:outsiders:delete', async (_event, id: number) => {
    businesses.deleteOutsideOwner(id);
    return { success: true };
  });

  // === Audit ===
  ipcMain.handle('db:audit:list', async (_event, limit: number) => {
    return audit.getAuditLog(limit);
  });

  // === File operations ===
  ipcMain.handle('dialog:openFile', async (_event, options) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  ipcMain.handle('dialog:saveFile', async (_event, options) => {
    const result = await dialog.showSaveDialog(options);
    return result;
  });

  ipcMain.handle('file:saveAvatar', async (_event, userId: number, sourcePath: string) => {
    const avatarsDir = path.join(app.getPath('userData'), 'avatars');
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    const ext = path.extname(sourcePath);
    const destPath = path.join(avatarsDir, `user_${userId}${ext}`);
    fs.copyFileSync(sourcePath, destPath);
    users.updateUser(userId, { avatar_path: destPath });
    return destPath;
  });

  ipcMain.handle('file:saveResidentPhoto', async (_event, residentId: number, sourcePath: string) => {
    const photosDir = path.join(app.getPath('userData'), 'photos');
    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
    const ext = path.extname(sourcePath);
    const destPath = path.join(photosDir, `resident_${residentId}${ext}`);
    fs.copyFileSync(sourcePath, destPath);
    residents.updateResident(residentId, { photo_path: destPath });
    return destPath;
  });

  // Read an image stored by the app and return it as a data URL for display.
  // Restricted to the app's data folder so arbitrary files can't be read.
  ipcMain.handle('file:getImageBase64', async (_event, imagePath: string) => {
    if (!imagePath) return null;
    const resolved = path.resolve(imagePath);
    const userData = app.getPath('userData');
    if (!resolved.startsWith(userData + path.sep)) return null;
    if (!fs.existsSync(resolved)) return null;
    const ext = path.extname(resolved).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const data = fs.readFileSync(resolved);
    return `data:${mime};base64,${data.toString('base64')}`;
  });

  // === Barangay Logo ===
  ipcMain.handle('file:saveLogo', async (_event, sourcePath: string) => {
    const logoDir = path.join(app.getPath('userData'), 'assets');
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
    const ext = path.extname(sourcePath);
    const destPath = path.join(logoDir, `barangay_logo${ext}`);
    fs.copyFileSync(sourcePath, destPath);
    settings.setSetting('barangay_logo_path', destPath);
    return destPath;
  });

  ipcMain.handle('file:removeLogo', async () => {
    const logoPath = settings.getSetting('barangay_logo_path');
    if (logoPath && fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
    }
    settings.setSetting('barangay_logo_path', '');
    return true;
  });

  ipcMain.handle('file:getLogoBase64', async () => {
    const logoPath = settings.getSetting('barangay_logo_path');
    if (!logoPath || !fs.existsSync(logoPath)) return null;
    const ext = path.extname(logoPath).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
    const data = fs.readFileSync(logoPath);
    return `data:${mime};base64,${data.toString('base64')}`;
  });

  // ═══ Cases & Summons ════════════════════════════════════════════════════
  ipcMain.handle('db:cases:list', async (_event, params?: { search?: string; status?: string }) => {
    return cases.listCases(params);
  });
  ipcMain.handle('db:cases:get', async (_event, id: number) => {
    return cases.getCaseById(id);
  });
  ipcMain.handle('db:cases:create', async (_event, data: any) => {
    const { parties, ...caseData } = data;
    const id = cases.createCase(caseData);
    if (Array.isArray(parties)) cases.setCaseParties(id, parties);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'CASE_CREATED', `Created case`);
    return id;
  });
  ipcMain.handle('db:cases:update', async (_event, id: number, data: any) => {
    const { parties, ...caseData } = data;
    cases.updateCase(id, caseData);
    if (Array.isArray(parties)) cases.setCaseParties(id, parties);
    return { success: true };
  });
  ipcMain.handle('db:cases:parties', async (_event, caseId: number) => {
    return cases.listCaseParties(caseId);
  });
  ipcMain.handle('db:cases:delete', async (_event, id: number) => {
    cases.deleteCase(id);
    return { success: true };
  });
  ipcMain.handle('db:summons:list', async (_event, caseId: number) => {
    return cases.listSummons(caseId);
  });
  ipcMain.handle('db:summons:create', async (_event, data: any) => {
    return cases.createSummon(data);
  });
  ipcMain.handle('db:summons:update', async (_event, id: number, data: any) => {
    cases.updateSummon(id, data);
    return { success: true };
  });
  ipcMain.handle('db:summons:delete', async (_event, id: number) => {
    cases.deleteSummon(id);
    return { success: true };
  });

  // ═══ CSV Import / Export ════════════════════════════════════════════════
  ipcMain.handle('db:import:getCSVHeaders', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { headers } = importModule.parseCSV(content);
      return headers;
    } catch (err: any) {
      logError('Failed to read CSV headers', err);
      return [];
    }
  });

  ipcMain.handle('db:import:getSystemFields', async () => {
    return importModule.getSystemFields();
  });

  ipcMain.handle('db:import:run', async (_event, options: {
    filePath: string;
    mapping: Record<string, string>;
    dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
    skipDuplicates: boolean;
  }) => {
    try {
      const content = fs.readFileSync(options.filePath, 'utf-8');
      const { rows } = importModule.parseCSV(content);
      const user = getCurrentSessionUser();
      const batchId = importModule.createImportBatch(
        path.basename(options.filePath),
        user?.id || null
      );
      const result = importModule.runImport(
        rows,
        options.mapping,
        options.dateFormat,
        batchId,
        options.skipDuplicates
      );
      audit.logAudit(
        user?.id || null,
        'CSV_IMPORTED',
        `Imported ${result.totalImported} residents from ${path.basename(options.filePath)} (batch ${batchId})`
      );
      return result;
    } catch (err: any) {
      logError('CSV import failed', err);
      return { batchId: 0, totalImported: 0, totalSkipped: 0, totalErrors: 1, errors: [{ row: 0, field: '_system', message: err?.message || 'Import failed' }], duplicates: [] };
    }
  });

  ipcMain.handle('db:import:rollback', async (_event, batchId: number) => {
    try {
      const result = importModule.rollbackImportBatch(batchId);
      const user = getCurrentSessionUser();
      audit.logAudit(user?.id || null, 'IMPORT_ROLLED_BACK', `Rolled back import batch ${batchId}: ${result.deletedCount} residents removed`);
      return { success: true, deletedCount: result.deletedCount };
    } catch (err: any) {
      logError('Import rollback failed', err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('db:import:downloadTemplate', async () => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Save CSV Template',
        defaultPath: 'resident-import-template.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { success: false };
      const template = importModule.getCSVTemplateHeaders();
      fs.writeFileSync(result.filePath, template + '\n', 'utf-8');
      return { success: true, path: result.filePath };
    } catch (err: any) {
      logError('Download template failed', err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('db:export:residents', async (_event, params: {
    is_senior?: boolean;
    is_youth?: boolean;
    is_indigent?: boolean;
    is_4ps?: boolean;
    status?: string;
  }) => {
    try {
      requireAdmin();
      const csv = importModule.exportResidentsToCSV(params);
      if (!csv) return { success: false, error: 'No data to export' };

      const result = await dialog.showSaveDialog({
        title: 'Export Residents',
        defaultPath: 'residents-export.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { success: false };

      // Add BOM for Excel compatibility
      fs.writeFileSync(result.filePath, '\ufeff' + csv, 'utf-8');
      const user = getCurrentSessionUser();
      audit.logAudit(user?.id || null, 'RESIDENTS_EXPORTED', `Exported residents to ${path.basename(result.filePath)}`);
      return { success: true, path: result.filePath };
    } catch (err: any) {
      logError('Export failed', err);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('db:import:listBatches', async () => {
    return importModule.listImportBatches();
  });

  // ═══ Error Log Export ══════════════════════════════════════════════════
  ipcMain.handle('db:logs:export', async () => {
    try {
      const { getLogFilePath } = await import('../utils/logger');
      const logPath = getLogFilePath();
      if (!fs.existsSync(logPath)) return { success: false, error: 'No log file found' };

      const result = await dialog.showSaveDialog({
        title: 'Export Log File',
        defaultPath: `barangay-log-${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
      });
      if (result.canceled || !result.filePath) return { success: false };

      fs.copyFileSync(logPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ═══ Analytics ══════════════════════════════════════════════════════════
  ipcMain.handle('db:analytics:track', async (_event, eventType: string, eventData?: string) => {
    analytics.trackEvent(eventType, eventData);
    return { success: true };
  });

  ipcMain.handle('db:analytics:summary', async () => {
    return analytics.getAnalyticsSummary();
  });

  ipcMain.handle('db:analytics:export', async () => {
    try {
      requireAdmin();
      const csv = analytics.exportAnalytics();
      if (!csv) return { success: false, error: 'No analytics data' };
      const result = await dialog.showSaveDialog({
        title: 'Export Analytics',
        defaultPath: `analytics-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { success: false };
      fs.writeFileSync(result.filePath, '\ufeff' + csv, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ═══ Danger Zone (admin-only) ═══════════════════════════════════════
  // Configure danger zone PIN (stored as bcrypt hash)
  ipcMain.handle('db:dangerzone:setPin', async (_event, currentPin: string, newPin: string) => {
    requireAdmin();
    const storedHash = settings.getSetting('danger_zone_pin_hash');
    // If no hash stored yet, verify against legacy plaintext or require first setup
    if (storedHash) {
      if (!verifyPasswordSync(currentPin, storedHash)) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    } else {
      // Legacy: check old plaintext pin if it exists, or accept any current pin on first setup
      const legacyPin = settings.getSetting('danger_zone_pin');
      if (legacyPin && currentPin !== legacyPin) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    }
    if (!newPin || newPin.length < 4) return { success: false, error: 'New PIN must be at least 4 characters' };
    settings.setSetting('danger_zone_pin_hash', hashPasswordSync(newPin));
    // Remove legacy plaintext pin if it exists
    settings.setSetting('danger_zone_pin', '');
    return { success: true };
  });

  // Wipe all data except users (admin-only)
  ipcMain.handle('db:dangerzone:wipe', async (_event, pin: string) => {
    requireAdmin();
    const storedHash = settings.getSetting('danger_zone_pin_hash');
    if (storedHash) {
      if (!verifyPasswordSync(pin, storedHash)) return { success: false, error: 'Invalid PIN' };
    } else {
      // Legacy fallback
      const configuredPin = settings.getSetting('danger_zone_pin') || '011994';
      if (pin !== configuredPin) return { success: false, error: 'Invalid PIN' };
    }

    const db = (await import('../database/connection')).getDb();
    try {
      db.exec(`
        DELETE FROM generated_reports;
        DELETE FROM officials;
        DELETE FROM residents;
        DELETE FROM households;
        DELETE FROM cases;
        DELETE FROM summons;
        DELETE FROM audit_log;
      `);
      /* Note: report_templates is intentionally preserved during wipe */
      const user = getCurrentSessionUser();
      audit.logAudit(user?.id || null, 'DATABASE_WIPED', 'All data wiped via Danger Zone (users kept)');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Re-seed default report templates (admin-only)
  ipcMain.handle('db:dangerzone:reseedTemplates', async (_event, pin: string) => {
    requireAdmin();
    const storedHash = settings.getSetting('danger_zone_pin_hash');
    if (storedHash) {
      if (!verifyPasswordSync(pin, storedHash)) return { success: false, error: 'Invalid PIN' };
    } else {
      const configuredPin = settings.getSetting('danger_zone_pin') || '011994';
      if (pin !== configuredPin) return { success: false, error: 'Invalid PIN' };
    }

    try {
      const { reseedTemplates } = await import('../database/connection');
      reseedTemplates();
      const user = getCurrentSessionUser();
      audit.logAudit(user?.id || null, 'TEMPLATES_RESEEDED', 'Default report templates restored via Danger Zone');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Fill test dummy data — 800 residents with family relationships (admin-only)
  ipcMain.handle('db:dangerzone:fillTestData', async (_event, pin: string, count?: number) => {
    requireAdmin();
    const storedHash = settings.getSetting('danger_zone_pin_hash');
    if (storedHash) {
      if (!verifyPasswordSync(pin, storedHash)) return { success: false, error: 'Invalid PIN' };
    } else {
      const configuredPin = settings.getSetting('danger_zone_pin') || '011994';
      if (pin !== configuredPin) return { success: false, error: 'Invalid PIN' };
    }

    const db = (await import('../database/connection')).getDb();

    try {
      // ─── Name pools ────────────────────────────────────────
      const lastNames = [
        'Santos', 'Reyes', 'Cruz', 'Bautista', 'Gonzales', 'Lopez', 'Garcia', 'Mendoza',
        'Torres', 'Ramos', 'Aquino', 'Castro', 'Rivera', 'Flores', 'Villanueva', 'Dela Cruz',
        'Morales', 'Soriano', 'Pascual', 'Navarro', 'Mercado', 'Salvador', 'Aguilar', 'Fernandez',
        'De Leon', 'Rosario', 'Manalo', 'Perez', 'Dizon', 'Santiago', 'Valdez', 'Enriquez',
        'Lim', 'Tan', 'Go', 'Ong', 'Sy', 'Chua', 'Co', 'Yu',
      ];
      const maleFirst = [
        'Juan', 'Jose', 'Pedro', 'Carlos', 'Miguel', 'Rafael', 'Antonio', 'Francisco',
        'Luis', 'Ramon', 'Manuel', 'Roberto', 'Eduardo', 'Alberto', 'Fernando', 'Ricardo',
        'Ernesto', 'Alfredo', 'Danilo', 'Rodolfo', 'Renato', 'Reynaldo', 'Ariel', 'Mark',
        'John', 'James', 'Christian', 'Angelo', 'Vincent', 'Bryan', 'Kevin', 'Justin',
        'Kyle', 'Sean', 'Patrick', 'Daniel', 'Gabriel', 'Nathaniel', 'Joshua', 'Elijah',
      ];
      const femaleFirst = [
        'Maria', 'Ana', 'Rosa', 'Carmen', 'Luisa', 'Elena', 'Teresa', 'Gloria',
        'Patricia', 'Cristina', 'Lourdes', 'Rosario', 'Victoria', 'Isabel', 'Josefina', 'Remedios',
        'Grace', 'Joy', 'Faith', 'Hope', 'Michelle', 'Nicole', 'Angela', 'Jasmine',
        'Samantha', 'Angelica', 'Stephanie', 'Clarissa', 'Katrina', 'Bianca', 'Andrea', 'Sophia',
        'Princess', 'Alyssa', 'Hannah', 'Trisha', 'Mika', 'Althea', 'Keziah', 'Chloe',
      ];
      const middleNames = [
        'Reyes', 'Santos', 'Cruz', 'Lopez', 'Garcia', 'Bautista', 'Gonzales', 'Mendoza',
        'Torres', 'Rivera', 'Flores', 'Morales', 'Soriano', 'Ramos', 'Aquino', 'Castro',
      ];
      const occupations = [
        'Farmer', 'Fisher', 'Vendor', 'Tricycle Driver', 'Construction Worker',
        'Teacher', 'Government Employee', 'OFW', 'Store Owner', 'Carpenter',
        'Electrician', 'Mechanic', 'Nurse', 'Midwife', 'Barangay Health Worker',
        'Student', 'Student', 'Student', 'Student',
        null, null, null,
      ];
      const suffixes = [null, null, null, null, null, null, null, null, 'Jr.', 'Sr.', 'III', 'IV'];
      const religions = ['Roman Catholic', 'Roman Catholic', 'Roman Catholic', 'Roman Catholic',
        'Iglesia ni Cristo', 'Born Again Christian', 'Muslim', 'Seventh Day Adventist', 'Baptist'];
      const educations = ['Elementary', 'High School', 'High School Graduate', 'College Level',
        'College Graduate', 'Vocational', 'Post Graduate', null];
      const caseTypes = ['mediation', 'complaint', 'dispute', 'other'];
      const caseDescriptions = [
        'Noise complaint from neighboring household during late hours.',
        'Boundary dispute between adjacent lots in the purok.',
        'Verbal altercation between residents over parking space.',
        'Unpaid debt / lending dispute.',
        'Property damage caused by stray animals.',
        'Physical altercation during community gathering.',
        'Harassment and verbal threats between neighbors.',
        'Dispute over water supply and irrigation rights.',
        'Damage to property from construction work on adjacent lot.',
        'Domestic dispute escalated to public disturbance.',
      ];

      const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

      // Get number of puroks
      const numPuroks = parseInt(settings.getSetting('number_of_puroks') || '7', 10);

      // Generate a birth date for a target age
      const birthDateForAge = (age: number): string => {
        const now = new Date();
        const year = now.getFullYear() - age;
        const month = randInt(1, 12);
        const day = randInt(1, 28);
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      };

      // Generate a random date within last N months
      const recentDate = (monthsAgo: number): string => {
        const now = new Date();
        const past = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
        const diff = now.getTime() - past.getTime();
        const d = new Date(past.getTime() + Math.random() * diff);
        return d.toISOString().split('T')[0];
      };

      // ─── Phase 1: Generate ~170 family units → ~1000 residents ────
      const insertStmt = db.prepare(`
        INSERT INTO residents (
          first_name, middle_name, last_name, suffix, birth_date, gender,
          civil_status, address, purok, contact_number, occupation,
          is_indigent, voter_status, is_4ps, status, death_date,
          religion, citizenship, educational_attainment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const linkPartnerStmt = db.prepare("UPDATE residents SET partner_id = ? WHERE id = ?");
      const linkParentStmt = db.prepare("UPDATE residents SET mother_id = ?, father_id = ? WHERE id = ?");

      const allResidentIds: number[] = [];

      const transaction = db.transaction(() => {
        let totalCreated = 0;
        const TARGET = Math.min(8000, Math.max(100, Math.floor(count || 1000)));
        // Phase 1 builds ~70% of the target as base families; ancestor and
        // descendant chains (Phases 2a/2b) fill the rest with deep generations.
        const PHASE1_TARGET = Math.floor(TARGET * 0.7);
        const families: { fatherId: number; motherId: number; lastName: string; purok: string; fatherAge: number }[] = [];
        const childRecords: { id: number; age: number; gender: string; lastName: string; purok: string }[] = [];

        const NUM_FAMILIES = Math.ceil(PHASE1_TARGET / 5.5);
        let deceasedCount = 0;
        let seniorCount = 0;
        let youthCount = 0;
        let indigentCount = 0;
        let fourPsCount = 0;

        for (let f = 0; f < NUM_FAMILIES && totalCreated < PHASE1_TARGET; f++) {
          const familyName = pick(lastNames);
          const purok = String(randInt(1, numPuroks));

          // Every 5th family is a "large family" (5-8 children)
          const isLargeFamily = f % 5 === 0;
          const parentAge = isLargeFamily ? randInt(45, 70) : randInt(30, 75);

          // Flags: 15% indigent, 8% are 4Ps beneficiaries
          const isIndigent = Math.random() < 0.15 ? 1 : 0;
          const is4Ps = isIndigent && Math.random() < 0.55 ? 1 : 0;
          if (isIndigent) indigentCount += 2;
          if (is4Ps) fourPsCount += 2;

          // Father
          const fatherAge = parentAge;
          if (fatherAge >= 60) seniorCount++;
          const fatherResult = insertStmt.run(
            pick(maleFirst), pick(middleNames), familyName, pick(suffixes),
            birthDateForAge(fatherAge), 'Male',
            'Married', `Purok ${purok}`, purok,
            `09${randInt(100000000, 999999999)}`,
            pick(occupations),
            isIndigent, Math.random() > 0.2 ? 'Registered' : 'Not Registered',
            is4Ps, 'living', null,
            pick(religions), 'Filipino', pick(educations)
          );
          const fatherId = fatherResult.lastInsertRowid as number;
          allResidentIds.push(fatherId);
          totalCreated++;

          // Mother (may have different maiden name)
          const motherAge = fatherAge - randInt(-3, 5);
          if (motherAge >= 60) seniorCount++;
          const motherResult = insertStmt.run(
            pick(femaleFirst), pick(middleNames),
            Math.random() < 0.7 ? familyName : pick(lastNames), null,
            birthDateForAge(Math.max(25, motherAge)), 'Female',
            'Married', `Purok ${purok}`, purok,
            `09${randInt(100000000, 999999999)}`,
            pick(occupations),
            isIndigent, Math.random() > 0.2 ? 'Registered' : 'Not Registered',
            is4Ps, 'living', null,
            pick(religions), 'Filipino', pick(educations)
          );
          const motherId = motherResult.lastInsertRowid as number;
          allResidentIds.push(motherId);
          totalCreated++;

          // Link partners
          linkPartnerStmt.run(motherId, fatherId);
          linkPartnerStmt.run(fatherId, motherId);

          families.push({ fatherId, motherId, lastName: familyName, purok, fatherAge: parentAge });

          // Children — large families get 5-8, normal get 2-4
          const numChildren = isLargeFamily ? randInt(5, 8) : randInt(2, 4);
          for (let c = 0; c < numChildren && totalCreated < PHASE1_TARGET; c++) {
            const childAge = randInt(1, Math.max(2, parentAge - 18));
            const childGender = Math.random() < 0.5 ? 'Male' : 'Female';
            const childFirstNames = childGender === 'Male' ? maleFirst : femaleFirst;

            if (childAge >= 15 && childAge <= 30) youthCount++;

            let childCivil = 'Single';
            if (childAge >= 25 && Math.random() < 0.4) childCivil = 'Married';

            let childOcc: string | null = null;
            if (childAge >= 15 && childAge <= 22) childOcc = 'Student';
            else if (childAge > 22) childOcc = pick(occupations);

            const childResult = insertStmt.run(
              pick(childFirstNames), pick(middleNames), familyName, null,
              birthDateForAge(childAge), childGender,
              childCivil, `Purok ${purok}`, purok,
              childAge >= 15 ? `09${randInt(100000000, 999999999)}` : null,
              childOcc,
              isIndigent, childAge >= 18 && Math.random() > 0.3 ? 'Registered' : 'Not Registered',
              is4Ps, 'living', null,
              pick(religions), 'Filipino',
              childAge >= 6 ? pick(educations) : null
            );
            const childId = childResult.lastInsertRowid as number;
            allResidentIds.push(childId);
            totalCreated++;

            linkParentStmt.run(motherId, fatherId, childId);
            childRecords.push({ id: childId, age: childAge, gender: childGender, lastName: familyName, purok });
          }
        }

        // ─── Phase 2a: Multi-generation ancestor chains ────────────
        // Builds lineages 1-4 generations UP from family fathers so deep
        // family trees can be tested. Very old ancestors are recorded as
        // deceased with a death date.
        const makeAncestorPair = (childId: number, childAge: number, lastName: string, purok: string): { fatherId: number; age: number } | null => {
          if (totalCreated >= TARGET) return null;
          const gpAge = childAge + randInt(20, 28);
          if (gpAge > 110) return null;
          const fatherDeceased = gpAge > 88 || (gpAge > 75 && Math.random() < 0.3);
          const motherDeceased = gpAge > 90 || (gpAge > 75 && Math.random() < 0.25);

          const gpFatherResult = insertStmt.run(
            pick(maleFirst), pick(middleNames), lastName, null,
            birthDateForAge(gpAge), 'Male',
            motherDeceased ? 'Widowed' : 'Married', `Purok ${purok}`, purok,
            fatherDeceased ? null : `09${randInt(100000000, 999999999)}`,
            fatherDeceased ? null : (Math.random() < 0.6 ? 'Retired' : pick(occupations)),
            Math.random() < 0.25 ? 1 : 0, fatherDeceased ? 'Not Registered' : 'Registered',
            0, fatherDeceased ? 'deceased' : 'living', fatherDeceased ? recentDate(randInt(6, 120)) : null,
            pick(religions), 'Filipino', pick(educations)
          );
          const gpFatherId = gpFatherResult.lastInsertRowid as number;
          allResidentIds.push(gpFatherId);
          totalCreated++;
          if (!fatherDeceased && gpAge >= 60) seniorCount++;
          if (fatherDeceased) deceasedCount++;

          const gpMotherAge = gpAge - randInt(-2, 3);
          const gpMotherResult = insertStmt.run(
            pick(femaleFirst), pick(middleNames), pick(lastNames), null,
            birthDateForAge(Math.max(40, gpMotherAge)), 'Female',
            fatherDeceased ? 'Widowed' : 'Married', `Purok ${purok}`, purok,
            motherDeceased ? null : `09${randInt(100000000, 999999999)}`,
            motherDeceased ? null : (Math.random() < 0.6 ? 'Retired' : pick(occupations)),
            Math.random() < 0.25 ? 1 : 0, motherDeceased ? 'Not Registered' : 'Registered',
            0, motherDeceased ? 'deceased' : 'living', motherDeceased ? recentDate(randInt(6, 120)) : null,
            pick(religions), 'Filipino', pick(educations)
          );
          const gpMotherId = gpMotherResult.lastInsertRowid as number;
          allResidentIds.push(gpMotherId);
          totalCreated++;
          if (!motherDeceased && gpMotherAge >= 60) seniorCount++;
          if (motherDeceased) deceasedCount++;

          linkPartnerStmt.run(gpMotherId, gpFatherId);
          linkPartnerStmt.run(gpFatherId, gpMotherId);
          linkParentStmt.run(gpMotherId, gpFatherId, childId);
          return { fatherId: gpFatherId, age: gpAge };
        };

        const ancestorChainFamilies = Math.max(10, Math.floor(families.length / 3));
        for (let g = 0; g < ancestorChainFamilies && totalCreated < TARGET; g++) {
          const fam = families[g];
          const chainLevels = randInt(1, 4);
          let currentId = fam.fatherId;
          let currentAge = fam.fatherAge;
          for (let lv = 0; lv < chainLevels; lv++) {
            const next = makeAncestorPair(currentId, currentAge, fam.lastName, fam.purok);
            if (!next) break;
            currentId = next.fatherId;
            currentAge = next.age;
          }
        }

        // ─── Phase 2b: Married children with families of their own (chains DOWN) ──
        const makeDescendants = (parent: { id: number; age: number; gender: string; lastName: string; purok: string }, depthLeft: number) => {
          if (depthLeft <= 0 || parent.age < 22 || totalCreated >= TARGET) return;

          const spouseGender = parent.gender === 'Male' ? 'Female' : 'Male';
          const spouseAge = Math.max(20, parent.age + randInt(-4, 4));
          const spouseResult = insertStmt.run(
            pick(spouseGender === 'Male' ? maleFirst : femaleFirst), pick(middleNames),
            spouseGender === 'Female' && Math.random() < 0.7 ? parent.lastName : pick(lastNames), null,
            birthDateForAge(spouseAge), spouseGender,
            'Married', `Purok ${parent.purok}`, parent.purok,
            `09${randInt(100000000, 999999999)}`,
            pick(occupations),
            Math.random() < 0.15 ? 1 : 0, Math.random() > 0.2 ? 'Registered' : 'Not Registered',
            0, 'living', null,
            pick(religions), 'Filipino', pick(educations)
          );
          const spouseId = spouseResult.lastInsertRowid as number;
          allResidentIds.push(spouseId);
          totalCreated++;
          if (spouseAge >= 60) seniorCount++;

          db.prepare("UPDATE residents SET civil_status = 'Married' WHERE id = ?").run(parent.id);
          linkPartnerStmt.run(spouseId, parent.id);
          linkPartnerStmt.run(parent.id, spouseId);

          const motherId = parent.gender === 'Female' ? parent.id : spouseId;
          const fatherId = parent.gender === 'Male' ? parent.id : spouseId;

          const numKids = randInt(1, 3);
          for (let k = 0; k < numKids && totalCreated < TARGET; k++) {
            const kidAge = Math.max(0, randInt(0, parent.age - 20));
            const kidGender = Math.random() < 0.5 ? 'Male' : 'Female';
            if (kidAge >= 15 && kidAge <= 30) youthCount++;
            const kidResult = insertStmt.run(
              pick(kidGender === 'Male' ? maleFirst : femaleFirst), pick(middleNames), parent.lastName, null,
              birthDateForAge(kidAge), kidGender,
              'Single', `Purok ${parent.purok}`, parent.purok,
              kidAge >= 15 ? `09${randInt(100000000, 999999999)}` : null,
              kidAge >= 15 && kidAge <= 22 ? 'Student' : (kidAge > 22 ? pick(occupations) : null),
              Math.random() < 0.15 ? 1 : 0, kidAge >= 18 && Math.random() > 0.3 ? 'Registered' : 'Not Registered',
              0, 'living', null,
              pick(religions), 'Filipino', kidAge >= 6 ? pick(educations) : null
            );
            const kidId = kidResult.lastInsertRowid as number;
            allResidentIds.push(kidId);
            totalCreated++;
            linkParentStmt.run(motherId, fatherId, kidId);

            // Sometimes the chain continues another generation down
            if (kidAge >= 22 && Math.random() < 0.5) {
              makeDescendants({ id: kidId, age: kidAge, gender: kidGender, lastName: parent.lastName, purok: parent.purok }, depthLeft - 1);
            }
          }
        };

        for (const child of childRecords) {
          if (totalCreated >= TARGET) break;
          if (child.age >= 25 && Math.random() < 0.35) {
            makeDescendants(child, randInt(1, 3));
          }
        }

        // ─── Phase 3: Mark additional residents as deceased ──
        const deceasedCandidates = allResidentIds.slice();
        const extraDeceased = Math.max(10, Math.floor(TARGET * 0.015));
        for (let d = 0; d < extraDeceased && deceasedCandidates.length > 0; d++) {
          const idx = randInt(0, deceasedCandidates.length - 1);
          const resId = deceasedCandidates.splice(idx, 1)[0];
          const deathDate = recentDate(36); // died within last 3 years
          db.prepare("UPDATE residents SET status = 'deceased', death_date = ? WHERE id = ?").run(deathDate, resId);
          deceasedCount++;
        }

        // ─── Phase 4: Create officials from existing residents ────────
        const officialPositions = [
          'Punong Barangay',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Kagawad',
          'Barangay Secretary',
          'Barangay Treasurer',
          'SK Chairperson',
        ];

        const officialStmt = db.prepare(`
          INSERT INTO officials (resident_id, position, start_date, is_active, sort_order)
          VALUES (?, ?, ?, 1, ?)
        `);

        // Pick adults (30+) from allResidentIds for officials
        const adultRows = db.prepare(
          "SELECT id FROM residents WHERE status = 'living' AND birth_date <= ? ORDER BY RANDOM() LIMIT ?"
        ).all(birthDateForAge(30), officialPositions.length) as { id: number }[];

        for (let o = 0; o < Math.min(adultRows.length, officialPositions.length); o++) {
          officialStmt.run(
            adultRows[o].id,
            officialPositions[o],
            `${new Date().getFullYear() - randInt(0, 2)}-01-01`,
            o + 1
          );
        }

        // ─── Phase 5: Create cases with summons ────────────────────
        const caseStmt = db.prepare(`
          INSERT INTO cases (case_number, case_type, complainant_id, respondent_id, description, filed_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const summonStmt = db.prepare(`
          INSERT INTO summons (case_id, summon_number, summon_date, summon_time, status, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const livingIds = db.prepare("SELECT id FROM residents WHERE status = 'living' ORDER BY RANDOM() LIMIT 30").all() as { id: number }[];
        const year = new Date().getFullYear();
        const caseStatuses = ['pending', 'ongoing', 'resolved', 'dismissed'];
        const summonStatuses = ['scheduled', 'served', 'appeared', 'no_show'];
        const summonTimes = ['08:00', '09:00', '10:00', '13:00', '14:00', '15:00'];

        for (let cs = 0; cs < 10 && livingIds.length >= 2; cs++) {
          const complainantIdx = cs * 2;
          const respondentIdx = cs * 2 + 1;
          if (complainantIdx >= livingIds.length || respondentIdx >= livingIds.length) break;

          const caseNum = `${year}-${String(cs + 1).padStart(3, '0')}`;
          const caseStatus = pick(caseStatuses);
          const filedDate = recentDate(12);

          caseStmt.run(
            caseNum,
            pick(caseTypes),
            livingIds[complainantIdx].id,
            livingIds[respondentIdx].id,
            pick(caseDescriptions),
            filedDate,
            caseStatus
          );
          const caseId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };

          // Register parties — occasionally with multiple complainants/respondents
          const partyStmt = db.prepare("INSERT INTO case_parties (case_id, resident_id, role) VALUES (?, ?, ?)");
          partyStmt.run(caseId.id, livingIds[complainantIdx].id, 'complainant');
          partyStmt.run(caseId.id, livingIds[respondentIdx].id, 'respondent');
          if (Math.random() < 0.3 && livingIds.length > respondentIdx + 1) {
            partyStmt.run(caseId.id, livingIds[(respondentIdx + randInt(1, 5)) % livingIds.length].id, 'respondent');
          }

          // Each case gets 1-3 summons
          const numSummons = randInt(1, 3);
          for (let s = 0; s < numSummons; s++) {
            const summonDate = recentDate(6);
            summonStmt.run(
              caseId.id,
              s + 1,
              summonDate,
              pick(summonTimes),
              pick(summonStatuses),
              s === 0 ? 'Initial summon issued' : `Follow-up summon #${s + 1}`
            );
          }
        }

        // Ensure every generated resident has a permanent UID (QR codes)
        db.exec(`
          UPDATE residents SET resident_uid =
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))), 2) || '-' ||
            substr('89ab', (abs(random()) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
            lower(hex(randomblob(6)))
          WHERE resident_uid IS NULL
        `);

        // Log
        audit.logAudit(null, 'TEST_DATA_FILLED',
          `Generated ${totalCreated} residents (${seniorCount} seniors, ${youthCount} youth, ` +
          `${indigentCount} indigent, ${fourPsCount} 4Ps, ${deceasedCount} deceased), ` +
          `${Math.min(adultRows.length, officialPositions.length)} officials, 10 cases with summons`
        );
      });

      transaction();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}
