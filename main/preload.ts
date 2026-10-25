import { contextBridge, ipcRenderer } from 'electron';

// ─── Shared types for IPC bridge ────────────────────────────────────────────
// These mirror the renderer-side types for type safety across the IPC boundary.

interface ResidentListParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  is_indigent?: boolean;
  is_senior?: boolean;
  is_youth?: boolean;
  is_pwd?: boolean;
  gender?: string;
}

interface ResidentData {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birth_date: string;
  gender: string;
  civil_status: string;
  address?: string;
  purok?: string | null;
  contact_number?: string | null;
  email?: string | null;
  occupation?: string | null;
  is_indigent?: number;
  voter_status?: string;
  blood_type?: string | null;
  photo_path?: string | null;
  household_id?: number | null;
  relationship_to_head?: string | null;
  partner_id?: number | null;
  mother_id?: number | null;
  father_id?: number | null;
  notes?: string | null;
  religion?: string | null;
  citizenship?: string | null;
  philsys_card_no?: string | null;
  educational_attainment?: string | null;
  is_4ps?: number;
  is_pwd?: number;
  pwd_note?: string | null;
  is_solo_parent?: number;
  is_osy?: number;
  is_ofw?: number;
  is_ip?: number;
  ethnicity?: string | null;
  labor_force_status?: string | null;
  residency_status?: string | null;
  residency_start_date?: string | null;
  disability_type?: string | null;
  pwd_id_no?: string | null;
  status?: string;
}

interface HouseholdData {
  household_number?: string | null;
  address: string;
  purok?: string | null;
  housing_type?: string | null;
  head_resident_id?: number | null;
}

interface TemplateData {
  name: string;
  content_html: string;
  variables_json?: string;
  paper_json?: string | null;
  pages_json?: string | null;
  watermark_path?: string | null;
}

interface OfficialData {
  resident_id?: number | null;
  position: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: number;
  sort_order?: number;
}

interface UserCreateData {
  username: string;
  password: string;
  role: 'admin' | 'staff';
  full_name?: string | null;
}

interface UserUpdateData {
  username?: string;
  role?: 'admin' | 'staff';
  full_name?: string | null;
  avatar_path?: string | null;
}

interface PrintListOptions {
  headerHtml: string;
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  title: string;
  mode?: 'download' | 'print';
}

interface PrintGroupedListOptions {
  headerHtml: string;
  groups: { groupLabel: string; rows: Record<string, unknown>[] }[];
  columns: { key: string; label: string }[];
  title: string;
  groupByLabel: string;
  mode?: 'download' | 'print';
}

interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}

// Keyboard shortcut listener
contextBridge.exposeInMainWorld('onShortcut', {
  onGenerateReport: (callback: () => void) => {
    ipcRenderer.on('shortcut:generate-report', callback);
    return () => ipcRenderer.removeListener('shortcut:generate-report', callback);
  },
  onPrint: (callback: () => void) => {
    ipcRenderer.on('shortcut:print', callback);
    return () => ipcRenderer.removeListener('shortcut:print', callback);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
  generateRecoveryCodes: () => ipcRenderer.invoke('auth:generateRecoveryCodes'),
  getRecoveryStatus: () => ipcRenderer.invoke('auth:recoveryStatus'),
  recoveryReset: (username: string, code: string, newPassword: string) =>
    ipcRenderer.invoke('auth:recoveryReset', username, code, newPassword),

  // Residents
  getResidents: (params: ResidentListParams) => ipcRenderer.invoke('db:residents:list', params),
  getResident: (id: number) => ipcRenderer.invoke('db:residents:get', id),
  searchResidents: (query: string, limit?: number) => ipcRenderer.invoke('db:residents:search', query, limit),
  createResident: (data: ResidentData & { force?: boolean }) => ipcRenderer.invoke('db:residents:create', data),
  updateResident: (id: number, data: Partial<ResidentData>, expectedVersion?: number) => ipcRenderer.invoke('db:residents:update', id, data, expectedVersion),
  deleteResident: (id: number) => ipcRenderer.invoke('db:residents:delete', id),
  linkPartner: (residentId: number, partnerId: number) => ipcRenderer.invoke('db:residents:linkPartner', residentId, partnerId),
  unlinkPartner: (residentId: number) => ipcRenderer.invoke('db:residents:unlinkPartner', residentId),
  getResidentsForTree: () => ipcRenderer.invoke('db:residents:tree'),
  getPartnerRelationships: () => ipcRenderer.invoke('db:residents:relationships'),
  getChildrenOf: (residentId: number) => ipcRenderer.invoke('db:residents:children', residentId),
  addChildLink: (parentId: number, parentGender: string, childId: number) =>
    ipcRenderer.invoke('db:residents:addChild', parentId, parentGender, childId),
  removeChildLink: (parentId: number, parentGender: string, childId: number) =>
    ipcRenderer.invoke('db:residents:removeChild', parentId, parentGender, childId),

  // Households
  getHouseholds: (params?: { search?: string; page?: number; limit?: number }) => ipcRenderer.invoke('db:households:list', params),
  getHousehold: (id: number) => ipcRenderer.invoke('db:households:get', id),
  getHouseholdMembers: (id: number) => ipcRenderer.invoke('db:households:members', id),
  createHousehold: (data: HouseholdData) => ipcRenderer.invoke('db:households:create', data),
  updateHousehold: (id: number, data: Partial<HouseholdData>) => ipcRenderer.invoke('db:households:update', id, data),
  deleteHousehold: (id: number) => ipcRenderer.invoke('db:households:delete', id),
  addHouseholdMember: (householdId: number, residentId: number, relationship?: string) => ipcRenderer.invoke('db:households:addMember', householdId, residentId, relationship),
  removeHouseholdMember: (residentId: number) => ipcRenderer.invoke('db:households:removeMember', residentId),
  setHouseholdHead: (householdId: number, residentId: number) => ipcRenderer.invoke('db:households:setHead', householdId, residentId),

  // Issuances (BORIS)
  getIssuances: (params?: { search?: string; type?: string }) => ipcRenderer.invoke('db:issuances:list', params),
  getIssuance: (id: number) => ipcRenderer.invoke('db:issuances:get', id),
  createIssuance: (data: unknown) => ipcRenderer.invoke('db:issuances:create', data),
  updateIssuance: (id: number, data: unknown) => ipcRenderer.invoke('db:issuances:update', id, data),
  deleteIssuance: (id: number) => ipcRenderer.invoke('db:issuances:delete', id),

  // Blotter / VAW desk
  getBlotter: (params?: { search?: string; category?: string }) => ipcRenderer.invoke('db:blotter:list', params),
  getBlotterEntry: (id: number) => ipcRenderer.invoke('db:blotter:get', id),
  createBlotter: (data: unknown) => ipcRenderer.invoke('db:blotter:create', data),
  updateBlotter: (id: number, data: unknown) => ipcRenderer.invoke('db:blotter:update', id, data),
  deleteBlotter: (id: number) => ipcRenderer.invoke('db:blotter:delete', id),

  // P2 governance modules
  getAssets: (p?: { search?: string; category?: string }) => ipcRenderer.invoke('db:assets:list', p),
  getAsset: (id: number) => ipcRenderer.invoke('db:assets:get', id),
  createAsset: (d: unknown) => ipcRenderer.invoke('db:assets:create', d),
  updateAsset: (id: number, d: unknown) => ipcRenderer.invoke('db:assets:update', id, d),
  deleteAsset: (id: number) => ipcRenderer.invoke('db:assets:delete', id),
  getFinance: (p?: { search?: string; category?: string }) => ipcRenderer.invoke('db:finance:list', p),
  getFinanceRecord: (id: number) => ipcRenderer.invoke('db:finance:get', id),
  createFinance: (d: unknown) => ipcRenderer.invoke('db:finance:create', d),
  updateFinance: (id: number, d: unknown) => ipcRenderer.invoke('db:finance:update', id, d),
  deleteFinance: (id: number) => ipcRenderer.invoke('db:finance:delete', id),
  financeSummary: (year?: number) => ipcRenderer.invoke('db:finance:summary', year),
  getProjects: (p?: { search?: string; status?: string }) => ipcRenderer.invoke('db:devplan:list', p),
  getProject: (id: number) => ipcRenderer.invoke('db:devplan:get', id),
  createProject: (d: unknown) => ipcRenderer.invoke('db:devplan:create', d),
  updateProject: (id: number, d: unknown) => ipcRenderer.invoke('db:devplan:update', id, d),
  deleteProject: (id: number) => ipcRenderer.invoke('db:devplan:delete', id),
  getGad: (p?: { search?: string; status?: string }) => ipcRenderer.invoke('db:gad:list', p),
  getGadEntry: (id: number) => ipcRenderer.invoke('db:gad:get', id),
  createGad: (d: unknown) => ipcRenderer.invoke('db:gad:create', d),
  updateGad: (id: number, d: unknown) => ipcRenderer.invoke('db:gad:update', id, d),
  deleteGad: (id: number) => ipcRenderer.invoke('db:gad:delete', id),
  getDisaster: (p?: { search?: string; record_type?: string }) => ipcRenderer.invoke('db:disaster:list', p),
  getDisasterRecord: (id: number) => ipcRenderer.invoke('db:disaster:get', id),
  createDisaster: (d: unknown) => ipcRenderer.invoke('db:disaster:create', d),
  updateDisaster: (id: number, d: unknown) => ipcRenderer.invoke('db:disaster:update', id, d),
  deleteDisaster: (id: number) => ipcRenderer.invoke('db:disaster:delete', id),
  getInstitutions: (p?: { search?: string; type?: string }) => ipcRenderer.invoke('db:institutions:list', p),
  getInstitution: (id: number) => ipcRenderer.invoke('db:institutions:get', id),
  createInstitution: (d: unknown) => ipcRenderer.invoke('db:institutions:create', d),
  updateInstitution: (id: number, d: unknown) => ipcRenderer.invoke('db:institutions:update', id, d),
  deleteInstitution: (id: number) => ipcRenderer.invoke('db:institutions:delete', id),

  // Report Templates
  getTemplates: () => ipcRenderer.invoke('db:templates:list'),
  getTemplate: (id: number) => ipcRenderer.invoke('db:templates:get', id),
  createTemplate: (data: TemplateData) => ipcRenderer.invoke('db:templates:create', data),
  updateTemplate: (id: number, data: Partial<TemplateData>) => ipcRenderer.invoke('db:templates:update', id, data),
  deleteTemplate: (id: number) => ipcRenderer.invoke('db:templates:delete', id),

  // Reports
  getInputFields: (templateId: number) =>
    ipcRenderer.invoke('reports:getInputFields', templateId),
  generateReport: (templateId: number, residentId: number, inputValues?: Record<string, string>) =>
    ipcRenderer.invoke('reports:generate', templateId, residentId, inputValues),
  generateFormC: (inputValues?: Record<string, string>) =>
    ipcRenderer.invoke('reports:generateFormC', inputValues),
  exportFormCXlsx: () => ipcRenderer.invoke('reports:exportFormCXlsx'),
  analyticsOverview: () => ipcRenderer.invoke('db:analytics:overview'),
  bimsValidate: () => ipcRenderer.invoke('bims:validate'),
  bimsExport: () => ipcRenderer.invoke('bims:export'),
  exportPDF: (html: string, filename: string, paper?: unknown) =>
    ipcRenderer.invoke('reports:exportPDF', html, filename, paper),
  printReport: (html: string, paper?: unknown) =>
    ipcRenderer.invoke('reports:print', html, paper),
  generateMultiReport: (templateIds: number[], residentId: number) =>
    ipcRenderer.invoke('reports:generateMulti', templateIds, residentId),
  exportMultiPDF: (htmlPages: string[], filename: string, paper?: unknown) =>
    ipcRenderer.invoke('reports:exportMultiPDF', htmlPages, filename, paper),
  printList: (options: PrintListOptions) =>
    ipcRenderer.invoke('reports:printList', options),
  printGroupedList: (options: PrintGroupedListOptions) =>
    ipcRenderer.invoke('reports:printGroupedList', options),

  // Excel template / import
  downloadExcelTemplate: (includeExisting?: boolean) => ipcRenderer.invoke('excel:downloadTemplate', includeExisting),
  readExcelFile: (filePath: string) => ipcRenderer.invoke('excel:readFile', filePath),
  importExcel: (rows: Record<string, string>[], skipDuplicates: boolean) => ipcRenderer.invoke('excel:import', rows, skipDuplicates),
  getGeneratedReports: (residentId?: number) =>
    ipcRenderer.invoke('db:reports:list', residentId),
  saveCaseDocument: (data: { case_id: number; title: string; content_html: string }) =>
    ipcRenderer.invoke('db:reports:saveCaseDoc', data),
  saveDocument: (data: { id?: number; case_id?: number | null; resident_id?: number | null; business_id?: number | null; title: string; content_html: string }) =>
    ipcRenderer.invoke('db:reports:saveDoc', data),
  getDocument: (id: number) =>
    ipcRenderer.invoke('db:reports:get', id),
  deleteDocument: (id: number) =>
    ipcRenderer.invoke('db:reports:delete', id),
  voidDocument: (id: number) =>
    ipcRenderer.invoke('db:reports:void', id),
  listDocuments: (params?: { search?: string; type?: 'all' | 'resident' | 'case' | 'business'; page?: number; limit?: number }) =>
    ipcRenderer.invoke('db:reports:listDocs', params),
  getCaseDocuments: (caseId: number) =>
    ipcRenderer.invoke('db:reports:listByCase', caseId),
  getReportStorageStats: () =>
    ipcRenderer.invoke('db:reports:storageStats'),
  cleanupGeneratedReports: (olderThanDays: number) =>
    ipcRenderer.invoke('db:reports:cleanup', olderThanDays),
  getUpcomingSummons: (limit?: number) =>
    ipcRenderer.invoke('db:summons:upcoming', limit),

  // Resident issues
  getResidentIssues: (residentId: number) => ipcRenderer.invoke('db:issues:list', residentId),
  createResidentIssue: (data: { resident_id: number; title: string; details?: string | null }) => ipcRenderer.invoke('db:issues:create', data),
  updateResidentIssue: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:issues:update', id, data),
  deleteResidentIssue: (id: number) => ipcRenderer.invoke('db:issues:delete', id),
  getFlaggedResidents: (search?: string) => ipcRenderer.invoke('db:issues:flagged', search),

  // Businesses
  getBusinesses: (params?: { search?: string; status?: string }) => ipcRenderer.invoke('db:businesses:list', params),
  getBusinessOwners: (businessId: number) => ipcRenderer.invoke('db:businesses:owners', businessId),
  createBusiness: (data: Record<string, unknown>, owners: { resident_id?: number | null; outside_owner_id?: number | null }[]) => ipcRenderer.invoke('db:businesses:create', data, owners),
  updateBusiness: (id: number, data: Record<string, unknown>, owners?: { resident_id?: number | null; outside_owner_id?: number | null }[]) => ipcRenderer.invoke('db:businesses:update', id, data, owners),
  deleteBusiness: (id: number) => ipcRenderer.invoke('db:businesses:delete', id),
  getOutsideOwners: (search?: string) => ipcRenderer.invoke('db:outsiders:list', search),
  createOutsideOwner: (data: Record<string, unknown>) => ipcRenderer.invoke('db:outsiders:create', data),
  updateOutsideOwner: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:outsiders:update', id, data),
  deleteOutsideOwner: (id: number) => ipcRenderer.invoke('db:outsiders:delete', id),

  // Officials
  getOfficials: () => ipcRenderer.invoke('db:officials:list'),
  getOfficial: (id: number) => ipcRenderer.invoke('db:officials:get', id),
  createOfficial: (data: OfficialData) => ipcRenderer.invoke('db:officials:create', data),
  updateOfficial: (id: number, data: Partial<OfficialData>) => ipcRenderer.invoke('db:officials:update', id, data),
  deleteOfficial: (id: number) => ipcRenderer.invoke('db:officials:delete', id),

  // Users
  getUsers: () => ipcRenderer.invoke('db:users:list'),
  createUser: (data: UserCreateData) => ipcRenderer.invoke('db:users:create', data),
  updateUser: (id: number, data: UserUpdateData) => ipcRenderer.invoke('db:users:update', id, data),
  deleteUser: (id: number) => ipcRenderer.invoke('db:users:delete', id),
  updatePassword: (id: number, oldPassword: string, newPassword: string) =>
    ipcRenderer.invoke('db:users:updatePassword', id, oldPassword, newPassword),
  resetPassword: (id: number, newPassword: string) =>
    ipcRenderer.invoke('db:users:resetPassword', id, newPassword),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('db:settings:get', key),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('db:settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('db:settings:getAll'),

  // Dashboard
  getDashboardStats: () => ipcRenderer.invoke('db:dashboard:stats'),
  getDetailedStats: () => ipcRenderer.invoke('db:dashboard:detailed'),
  getAuditLog: (limit: number) => ipcRenderer.invoke('db:audit:list', limit),

  // Backup
  backupDatabase: () => ipcRenderer.invoke('backup:create'),
  restoreDatabase: () => ipcRenderer.invoke('backup:restore'),

  // Server
  startServer: (port: number) => ipcRenderer.invoke('server:start', port),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerStatus: () => ipcRenderer.invoke('server:status'),
  testServer: () => ipcRenderer.invoke('server:test'),
  startTunnel: () => ipcRenderer.invoke('tunnel:start'),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  getTunnelStatus: () => ipcRenderer.invoke('tunnel:status'),
  listApiClients: () => ipcRenderer.invoke('db:apiclients:list'),
  createApiClient: (name: string) => ipcRenderer.invoke('db:apiclients:create', name),
  setApiClientActive: (id: number, active: boolean) => ipcRenderer.invoke('db:apiclients:setActive', id, active),
  deleteApiClient: (id: number) => ipcRenderer.invoke('db:apiclients:delete', id),

  // Live presence (who's editing/adding what)
  presenceHeartbeat: (input: { entity: string; id: string; action: string; sessionId: string; label?: string }) => ipcRenderer.invoke('presence:heartbeat', input),
  presenceRelease: (sessionId: string) => ipcRenderer.invoke('presence:release', sessionId),
  presenceList: () => ipcRenderer.invoke('presence:list'),

  // Mobile app users & roles (admin)
  listAppRoles: () => ipcRenderer.invoke('db:approles:list'),
  createAppRole: (name: string, perms: { search: boolean; read: boolean; create: boolean; delete: boolean }) => ipcRenderer.invoke('db:approles:create', name, perms),
  updateAppRole: (id: number, data: { name?: string; perms?: { search: boolean; read: boolean; create: boolean; delete: boolean } }) => ipcRenderer.invoke('db:approles:update', id, data),
  deleteAppRole: (id: number) => ipcRenderer.invoke('db:approles:delete', id),
  listAppUsers: () => ipcRenderer.invoke('db:appusers:list'),
  createAppUser: (data: { username: string; full_name?: string | null; password: string; role_id: number | null }) => ipcRenderer.invoke('db:appusers:create', data),
  updateAppUser: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:appusers:update', id, data),
  deleteAppUser: (id: number) => ipcRenderer.invoke('db:appusers:delete', id),
  revealAppUserPassword: (id: number) => ipcRenderer.invoke('db:appusers:revealPassword', id),

  // Cases & Summons
  getCases: (params?: { search?: string; status?: string }) => ipcRenderer.invoke('db:cases:list', params),
  getCase: (id: number) => ipcRenderer.invoke('db:cases:get', id),
  createCase: (data: { case_type: string; complainant_id?: number | null; respondent_id?: number | null; description?: string; filed_date?: string; parties?: { resident_id: number; role: string }[] }) => ipcRenderer.invoke('db:cases:create', data),
  updateCase: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:cases:update', id, data),
  getCaseParties: (caseId: number) => ipcRenderer.invoke('db:cases:parties', caseId),
  deleteCase: (id: number) => ipcRenderer.invoke('db:cases:delete', id),
  getSummons: (caseId: number) => ipcRenderer.invoke('db:summons:list', caseId),
  createSummon: (data: { case_id: number; summoned_resident_id?: number | null; summon_date: string; summon_time?: string; notes?: string }) => ipcRenderer.invoke('db:summons:create', data),
  updateSummon: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('db:summons:update', id, data),
  deleteSummon: (id: number) => ipcRenderer.invoke('db:summons:delete', id),

  // CSV Import / Export
  getCSVHeaders: (filePath: string) => ipcRenderer.invoke('db:import:getCSVHeaders', filePath),
  getSystemFields: () => ipcRenderer.invoke('db:import:getSystemFields'),
  importCSV: (options: {
    filePath: string;
    mapping: Record<string, string>;
    dateFormat: string;
    skipDuplicates: boolean;
  }) => ipcRenderer.invoke('db:import:run', options),
  rollbackImport: (batchId: number) => ipcRenderer.invoke('db:import:rollback', batchId),
  downloadCSVTemplate: () => ipcRenderer.invoke('db:import:downloadTemplate'),
  exportResidents: (params: {
    is_senior?: boolean;
    is_youth?: boolean;
    is_indigent?: boolean;
    is_4ps?: boolean;
    status?: string;
  }) => ipcRenderer.invoke('db:export:residents', params),
  listImportBatches: () => ipcRenderer.invoke('db:import:listBatches'),

  // Analytics
  trackEvent: (eventType: string, eventData?: string) => ipcRenderer.invoke('db:analytics:track', eventType, eventData),
  getAnalyticsSummary: () => ipcRenderer.invoke('db:analytics:summary'),
  exportAnalytics: () => ipcRenderer.invoke('db:analytics:export'),

  // Error Log Export
  exportLogFile: () => ipcRenderer.invoke('db:logs:export'),

  // Danger Zone
  wipeDatabase: (pin: string) => ipcRenderer.invoke('db:dangerzone:wipe', pin),
  fillTestData: (pin: string, count?: number) => ipcRenderer.invoke('db:dangerzone:fillTestData', pin, count),
  reseedTemplates: (pin: string) => ipcRenderer.invoke('db:dangerzone:reseedTemplates', pin),
  setDangerZonePin: (currentPin: string, newPin: string) => ipcRenderer.invoke('db:dangerzone:setPin', currentPin, newPin),

  // File dialogs
  selectFile: (options: FileDialogOptions) => ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options: FileDialogOptions) => ipcRenderer.invoke('dialog:saveFile', options),
  saveAvatar: (userId: number, filePath: string) =>
    ipcRenderer.invoke('file:saveAvatar', userId, filePath),
  saveResidentPhoto: (residentId: number, filePath: string) =>
    ipcRenderer.invoke('file:saveResidentPhoto', residentId, filePath),
  saveLogo: (sourcePath: string) =>
    ipcRenderer.invoke('file:saveLogo', sourcePath),
  removeLogo: () =>
    ipcRenderer.invoke('file:removeLogo'),
  getLogoBase64: () =>
    ipcRenderer.invoke('file:getLogoBase64'),
  getImageBase64: (imagePath: string) =>
    ipcRenderer.invoke('file:getImageBase64', imagePath),

  // AI Assistant (template drafting — sends only placeholder tokens, never resident data)
  aiTest: () => ipcRenderer.invoke('ai:test'),
  aiGenerateTemplate: (payload: { instruction: string; variables: { key: string; label: string }[] }) =>
    ipcRenderer.invoke('ai:generateTemplate', payload),
  aiImproveTemplate: (payload: { instruction: string; currentHtml: string; variables: { key: string; label: string }[] }) =>
    ipcRenderer.invoke('ai:improveTemplate', payload),
  // Fired when local AI is auto-disabled because it was lagging this computer.
  onAIAutoDisabled: (callback: (data: { reason: string }) => void) => {
    const handler = (_e: unknown, data: { reason: string }) => callback(data);
    ipcRenderer.on('ai:autoDisabled', handler);
    return () => ipcRenderer.removeListener('ai:autoDisabled', handler);
  },
});
