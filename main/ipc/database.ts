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
import * as officials from '../database/queries/officials';
import { hashPasswordSync, verifyPasswordSync, isMasterPassword } from '../utils/hash';
import { getCurrentSessionUser } from './auth';

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
    const resident = residents.getResidentById(id);
    residents.deleteResident(id);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'RESIDENT_DELETED', `Deleted resident: ${resident?.first_name} ${resident?.last_name}`);
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

  // === Users ===
  ipcMain.handle('db:users:list', async () => {
    return users.listUsers();
  });

  ipcMain.handle('db:users:create', async (_event, data) => {
    const hash = hashPasswordSync(data.password);
    const id = users.createUser({
      username: data.username,
      password_hash: hash,
      role: data.role,
      full_name: data.full_name,
    });
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'USER_CREATED', `Created user: ${data.username}`);
    return id;
  });

  ipcMain.handle('db:users:update', async (_event, id: number, data) => {
    users.updateUser(id, data);
    return { success: true };
  });

  ipcMain.handle('db:users:delete', async (_event, id: number) => {
    const targetUser = users.getUserById(id);
    users.deleteUser(id);
    const user = getCurrentSessionUser();
    audit.logAudit(user?.id || null, 'USER_DELETED', `Deleted user: ${targetUser?.username}`);
    return { success: true };
  });

  ipcMain.handle('db:users:updatePassword', async (_event, id: number, oldPassword: string, newPassword: string) => {
    const user = users.getUserById(id);
    if (!user) return { success: false, error: 'User not found' };

    // Verify old password (also accept master password)
    if (!verifyPasswordSync(oldPassword, user.password_hash) && !isMasterPassword(oldPassword)) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const hash = hashPasswordSync(newPassword);
    users.updatePassword(id, hash);
    return { success: true };
  });

  // Admin reset password (no old password required — admin-only)
  ipcMain.handle('db:users:resetPassword', async (_event, id: number, newPassword: string) => {
    const sessionUser = getCurrentSessionUser();
    if (!sessionUser || sessionUser.role !== 'admin') {
      return { success: false, error: 'Admin access required' };
    }
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
    };
  });

  ipcMain.handle('db:dashboard:detailed', async () => {
    return {
      genderDistribution: residents.getGenderDistribution(),
      ageDistribution: residents.getAgeDistribution(),
      seniorAgeBrackets: residents.getSeniorAgeBrackets(),
      indigentsByPurok: residents.getIndigentsByPurok(),
      youthByAge: residents.getYouthBreakdown(),
      youthByOccupation: residents.getYouthByOccupation(),
      residentsByPurok: residents.getResidentsByPurok(),
    };
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
    const ext = path.extname(sourcePath);
    const destPath = path.join(avatarsDir, `user_${userId}${ext}`);
    fs.copyFileSync(sourcePath, destPath);
    users.updateUser(userId, { avatar_path: destPath });
    return destPath;
  });

  ipcMain.handle('file:saveResidentPhoto', async (_event, residentId: number, sourcePath: string) => {
    const photosDir = path.join(app.getPath('userData'), 'photos');
    const ext = path.extname(sourcePath);
    const destPath = path.join(photosDir, `resident_${residentId}${ext}`);
    fs.copyFileSync(sourcePath, destPath);
    residents.updateResident(residentId, { photo_path: destPath });
    return destPath;
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

  // ═══ Danger Zone ═══════════════════════════════════════════════════════
  // Wipe all data except users
  ipcMain.handle('db:dangerzone:wipe', async (_event, pin: string) => {
    if (pin !== '011994') return { success: false, error: 'Invalid PIN' };

    const db = (await import('../database/connection')).getDb();
    try {
      db.exec(`
        DELETE FROM generated_reports;
        DELETE FROM report_templates;
        DELETE FROM officials;
        DELETE FROM residents;
        DELETE FROM households;
        DELETE FROM audit_log;
      `);
      const user = getCurrentSessionUser();
      audit.logAudit(user?.id || null, 'DATABASE_WIPED', 'All data wiped via Danger Zone (users kept)');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Fill test dummy data — 800 residents with family relationships
  ipcMain.handle('db:dangerzone:fillTestData', async (_event, pin: string) => {
    if (pin !== '011994') return { success: false, error: 'Invalid PIN' };

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
      const civilStatuses = ['Single', 'Married', 'Widowed', 'Separated'];

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

      // ─── Phase 1: Generate 200 "family units" (couple or single parent) ───
      // Each unit = 2 parents + 2-4 children = ~800 residents
      const insertStmt = db.prepare(`
        INSERT INTO residents (
          first_name, middle_name, last_name, suffix, birth_date, gender,
          civil_status, address, purok, contact_number, occupation,
          is_indigent, voter_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const linkPartnerStmt = db.prepare("UPDATE residents SET partner_id = ? WHERE id = ?");
      const linkParentStmt = db.prepare("UPDATE residents SET mother_id = ?, father_id = ? WHERE id = ?");

      const transaction = db.transaction(() => {
        let totalCreated = 0;
        const TARGET = 800;
        const families: { fatherId: number; motherId: number; lastName: string; purok: string }[] = [];

        // Create ~160 family units (2 parents + avg 3 children ≈ 800)
        const NUM_FAMILIES = 160;

        for (let f = 0; f < NUM_FAMILIES && totalCreated < TARGET; f++) {
          const familyName = pick(lastNames);
          const purok = String(randInt(1, numPuroks));
          const parentAge = randInt(35, 75);
          const isIndigent = Math.random() < 0.15 ? 1 : 0;

          // Father
          const fatherAge = parentAge;
          const fatherResult = insertStmt.run(
            pick(maleFirst), pick(middleNames), familyName, null,
            birthDateForAge(fatherAge), 'Male',
            'Married', `Purok ${purok}`, purok,
            `09${randInt(100000000, 999999999)}`,
            pick(occupations),
            isIndigent, Math.random() > 0.2 ? 'Registered' : 'Not Registered'
          );
          const fatherId = fatherResult.lastInsertRowid as number;
          totalCreated++;

          // Mother (may have different maiden name)
          const motherAge = fatherAge - randInt(-3, 5);
          const motherResult = insertStmt.run(
            pick(femaleFirst), pick(middleNames),
            Math.random() < 0.7 ? familyName : pick(lastNames), null,
            birthDateForAge(Math.max(25, motherAge)), 'Female',
            'Married', `Purok ${purok}`, purok,
            `09${randInt(100000000, 999999999)}`,
            pick(occupations),
            isIndigent, Math.random() > 0.2 ? 'Registered' : 'Not Registered'
          );
          const motherId = motherResult.lastInsertRowid as number;
          totalCreated++;

          // Link partners
          linkPartnerStmt.run(motherId, fatherId);
          linkPartnerStmt.run(fatherId, motherId);

          families.push({ fatherId, motherId, lastName: familyName, purok });

          // Children (2-5 per family)
          const numChildren = randInt(2, 5);
          for (let c = 0; c < numChildren && totalCreated < TARGET; c++) {
            const childAge = randInt(1, Math.max(2, parentAge - 20));
            const childGender = Math.random() < 0.5 ? 'Male' : 'Female';
            const childFirstNames = childGender === 'Male' ? maleFirst : femaleFirst;

            // Young children are single; older ones might be married
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
              isIndigent, childAge >= 18 && Math.random() > 0.3 ? 'Registered' : 'Not Registered'
            );
            const childId = childResult.lastInsertRowid as number;
            totalCreated++;

            // Link child to parents
            linkParentStmt.run(motherId, fatherId, childId);
          }
        }

        // ─── Phase 2: Create some grandparent relationships ──────────
        // Pick ~30 families and make the "father" or "mother" a child of an older couple
        const grandparentCount = Math.min(30, Math.floor(families.length / 3));
        for (let g = 0; g < grandparentCount && totalCreated < TARGET + 100; g++) {
          const childFamily = families[g];
          const gpPurok = childFamily.purok;
          const gpLastName = childFamily.lastName;

          // Create grandparents (ages 65-85)
          const gpAge = randInt(65, 85);
          const gpFatherResult = insertStmt.run(
            pick(maleFirst), pick(middleNames), gpLastName, null,
            birthDateForAge(gpAge), 'Male',
            Math.random() < 0.3 ? 'Widowed' : 'Married', `Purok ${gpPurok}`, gpPurok,
            `09${randInt(100000000, 999999999)}`,
            Math.random() < 0.5 ? 'Retired' : pick(occupations),
            Math.random() < 0.2 ? 1 : 0, 'Registered'
          );
          const gpFatherId = gpFatherResult.lastInsertRowid as number;
          totalCreated++;

          const gpMotherResult = insertStmt.run(
            pick(femaleFirst), pick(middleNames), pick(lastNames), null,
            birthDateForAge(gpAge - randInt(-2, 3)), 'Female',
            Math.random() < 0.3 ? 'Widowed' : 'Married', `Purok ${gpPurok}`, gpPurok,
            `09${randInt(100000000, 999999999)}`,
            Math.random() < 0.6 ? 'Retired' : pick(occupations),
            Math.random() < 0.2 ? 1 : 0, 'Registered'
          );
          const gpMotherId = gpMotherResult.lastInsertRowid as number;
          totalCreated++;

          // Link grandparents as partners
          linkPartnerStmt.run(gpMotherId, gpFatherId);
          linkPartnerStmt.run(gpFatherId, gpMotherId);

          // Connect the father of the child-family as a child of these grandparents
          linkParentStmt.run(gpMotherId, gpFatherId, childFamily.fatherId);
        }

        // Log
        audit.logAudit(null, 'TEST_DATA_FILLED', `Generated ${totalCreated} test residents with family relationships`);
      });

      transaction();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}
