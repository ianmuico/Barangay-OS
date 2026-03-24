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
  partner_id?: number | null;
  mother_id?: number | null;
  father_id?: number | null;
  notes?: string | null;
  religion?: string | null;
  citizenship?: string | null;
  philsys_card_no?: string | null;
  educational_attainment?: string | null;
  is_4ps?: number;
  status?: string;
}

interface HouseholdData {
  household_number?: string | null;
  address: string;
}

interface TemplateData {
  name: string;
  content_html: string;
  variables_json?: string;
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

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),

  // Residents
  getResidents: (params: ResidentListParams) => ipcRenderer.invoke('db:residents:list', params),
  getResident: (id: number) => ipcRenderer.invoke('db:residents:get', id),
  searchResidents: (query: string, limit?: number) => ipcRenderer.invoke('db:residents:search', query, limit),
  createResident: (data: ResidentData) => ipcRenderer.invoke('db:residents:create', data),
  updateResident: (id: number, data: Partial<ResidentData>) => ipcRenderer.invoke('db:residents:update', id, data),
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
  createHousehold: (data: HouseholdData) => ipcRenderer.invoke('db:households:create', data),
  updateHousehold: (id: number, data: Partial<HouseholdData>) => ipcRenderer.invoke('db:households:update', id, data),
  deleteHousehold: (id: number) => ipcRenderer.invoke('db:households:delete', id),

  // Report Templates
  getTemplates: () => ipcRenderer.invoke('db:templates:list'),
  getTemplate: (id: number) => ipcRenderer.invoke('db:templates:get', id),
  createTemplate: (data: TemplateData) => ipcRenderer.invoke('db:templates:create', data),
  updateTemplate: (id: number, data: Partial<TemplateData>) => ipcRenderer.invoke('db:templates:update', id, data),
  deleteTemplate: (id: number) => ipcRenderer.invoke('db:templates:delete', id),

  // Reports
  generateReport: (templateId: number, residentId: number) =>
    ipcRenderer.invoke('reports:generate', templateId, residentId),
  exportPDF: (html: string, filename: string) =>
    ipcRenderer.invoke('reports:exportPDF', html, filename),
  printReport: (html: string) =>
    ipcRenderer.invoke('reports:print', html),
  generateMultiReport: (templateIds: number[], residentId: number) =>
    ipcRenderer.invoke('reports:generateMulti', templateIds, residentId),
  exportMultiPDF: (htmlPages: string[], filename: string) =>
    ipcRenderer.invoke('reports:exportMultiPDF', htmlPages, filename),
  printList: (options: PrintListOptions) =>
    ipcRenderer.invoke('reports:printList', options),
  printGroupedList: (options: PrintGroupedListOptions) =>
    ipcRenderer.invoke('reports:printGroupedList', options),
  getGeneratedReports: (residentId?: number) =>
    ipcRenderer.invoke('db:reports:list', residentId),

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

  // Danger Zone
  wipeDatabase: (pin: string) => ipcRenderer.invoke('db:dangerzone:wipe', pin),
  fillTestData: (pin: string) => ipcRenderer.invoke('db:dangerzone:fillTestData', pin),

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
});
