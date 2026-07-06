// Type definitions for the Electron IPC bridge

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'staff';
  full_name: string | null;
  avatar_path: string | null;
  preferences_json: string;
  created_at: string;
  updated_at: string;
}

export interface Resident {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: string;
  gender: string;
  civil_status: string;
  address: string;
  purok: string | null;
  contact_number: string | null;
  email: string | null;
  occupation: string | null;
  is_indigent: number;
  voter_status: string;
  blood_type: string | null;
  photo_path: string | null;
  household_id: number | null;
  partner_id: number | null;
  mother_id: number | null;
  father_id: number | null;
  notes: string | null;
  // New fields (migration 005)
  religion: string | null;
  citizenship: string | null;
  philsys_card_no: string | null;
  educational_attainment: string | null;
  is_4ps: number;
  is_pwd?: number;
  pwd_note?: string | null;
  status: string;
  death_date?: string | null;
  resident_uid?: string | null;
  created_at: string;
  updated_at: string;
  age?: number;
  case_count?: number;
  open_issues?: number;
  row_version?: number;
}

export interface ResidentData {
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
  is_pwd?: number;
  pwd_note?: string | null;
  status?: string;
  death_date?: string | null;
}

export interface ResidentListParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  is_indigent?: boolean;
  is_senior?: boolean;
  is_youth?: boolean;
  is_4ps?: boolean;
  is_pwd?: boolean;
  gender?: string;
  status?: string; // 'living' | 'deceased' | 'all'
}

export interface Household {
  id: number;
  household_number: string | null;
  address: string;
  created_at: string;
}

export interface HouseholdData {
  household_number?: string | null;
  address: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  content_html: string;
  variables_json: string;
  paper_json: string | null;
  pages_json: string | null;
  watermark_path: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaperSettings {
  size: 'A4' | 'Letter' | 'Long';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; bottom: number; left: number; right: number }; // inches
}

export interface TemplateData {
  name: string;
  content_html: string;
  variables_json?: string;
  paper_json?: string | null;
  pages_json?: string | null;
  watermark_path?: string | null;
}

export interface Official {
  id: number;
  resident_id: number | null;
  position: string;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  photo_path?: string;
}

export interface OfficialData {
  resident_id?: number | null;
  position: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: number;
  sort_order?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  totalResidents: number;
  totalSeniors: number;
  totalIndigents: number;
  totalYouth: number;
  total4Ps: number;
  totalPWD?: number;
}

export interface ImportResult {
  batchId: number;
  totalImported: number;
  totalSkipped: number;
  totalErrors: number;
  errors: { row: number; field: string; message: string }[];
  duplicates: { type: 'exact' | 'fuzzy'; existingResident: { id: number; first_name: string; last_name: string; birth_date: string; purok: string | null }; rowIndex: number }[];
}

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

export interface SystemField {
  key: string;
  label: string;
  required: boolean;
}

export interface DetailedStats {
  genderDistribution: { gender: string; count: number }[];
  ageDistribution: { bracket: string; count: number }[];
  seniorAgeBrackets: { bracket: string; count: number }[];
  indigentsByPurok: { purok: string; count: number }[];
  youthByAge: { category: string; count: number }[];
  youthByOccupation: { category: string; count: number }[];
  residentsByPurok: { purok: string; count: number }[];
  civilStatusDistribution?: { status: string; count: number }[];
  voterStats?: { registered: number; notRegistered: number };
  monthlyRegistrations?: { month: string; count: number }[];
  caseStats?: { total: number; pending: number; ongoing: number; resolved: number; dismissed: number };
  householdCount?: number;
  deceasedCount?: number;
  upcomingSummons?: { id: number; case_number?: string; summon_date: string; summon_time: string | null; summoned_name?: string; status: string }[];
  activeCases?: { id: number; case_number: string; case_type: string; status: string; filed_date: string; parties: string }[];
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  action: string;
  details: string | null;
  created_at: string;
  username?: string;
}

export interface ServerStatus {
  running: boolean;
  address?: string;
  port?: number;
  url?: string;
}

export interface TunnelState {
  status: 'stopped' | 'downloading' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
}

export interface TreeResident {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string;
  partner_id: number | null;
  mother_id: number | null;
  father_id: number | null;
  purok: string | null;
  age: number;
}

export interface PartnerRelationship {
  id: number;
  first_name: string;
  last_name: string;
  partner_id: number;
  partner_first_name: string;
  partner_last_name: string;
}

export interface DocumentListItem {
  id: number;
  title: string | null;
  template_name: string | null;
  resident_id: number | null;
  resident_name: string | null;
  case_id: number | null;
  case_number: string | null;
  business_id: number | null;
  business_name: string | null;
  size_bytes: number;
  generated_at: string;
}

export interface RolePerms { search: boolean; read: boolean; create: boolean; delete: boolean; }
export interface AppRole {
  id: number; name: string;
  perm_search: number; perm_read: number; perm_create: number; perm_delete: number;
  is_system: number; created_at: string;
}
export interface AppUser {
  id: number; username: string; full_name: string | null;
  role_id: number | null; role_name?: string | null;
  is_active: number; created_at: string; last_login: string | null;
}

export interface PresenceEntry {
  key: string;
  entity: string;
  id: string;
  action: string;
  who: string;
  label?: string;
  sessionId: string;
  since: number;
  lastBeat: number;
}

export interface GeneratedReport {
  id: number;
  template_id: number | null;
  resident_id: number | null;
  case_id: number | null;
  business_id?: number | null;
  title: string | null;
  content_html: string;
  generated_by: number | null;
  generated_at: string;
  template_name?: string;
  resident_name?: string;
}

export interface ResidentIssue {
  id: number;
  resident_id: number;
  title: string;
  details: string | null;
  status: 'open' | 'resolved';
  created_by: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface FlaggedResident {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string;
  purok: string | null;
  open_issues: number;
  total_issues: number;
  case_count: number;
  latest_issue: string | null;
  latest_issue_at: string | null;
}

export interface Business {
  id: number;
  name: string;
  nature: string | null;
  address: string | null;
  purok: string | null;
  status: 'active' | 'closed';
  date_registered: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  owner_names?: string;
}

export interface BusinessOwner {
  id: number;
  business_id: number;
  resident_id: number | null;
  outside_owner_id: number | null;
  name?: string;
  is_outside?: number;
}

export interface OutsideOwner {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string | null;
  birth_date: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  business_names?: string;
}

export interface PrintListOptions {
  headerHtml: string;
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  title: string;
  mode?: 'download' | 'print';
}

export interface PrintGroupedListOptions {
  headerHtml: string;
  groups: { groupLabel: string; rows: Record<string, unknown>[] }[];
  columns: { key: string; label: string }[];
  title: string;
  groupByLabel: string;
  mode?: 'download' | 'print';
}

export interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}

export interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface UserCreateData {
  username: string;
  password: string;
  role: 'admin' | 'staff';
  full_name?: string | null;
}

export interface UserUpdateData {
  username?: string;
  role?: 'admin' | 'staff';
  full_name?: string | null;
  avatar_path?: string | null;
}

export interface ElectronAPI {
  login: (username: string, password: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<{ success: boolean }>;
  generateRecoveryCodes: () => Promise<{ success: boolean; codes?: string[]; error?: string }>;
  getRecoveryStatus: () => Promise<{ remaining: number }>;
  recoveryReset: (username: string, code: string, newPassword: string) => Promise<{ success: boolean; remaining?: number; error?: string }>;
  getCurrentUser: () => Promise<User | null>;

  getResidents: (params: ResidentListParams) => Promise<PaginatedResult<Resident>>;
  getResident: (id: number) => Promise<Resident | null>;
  searchResidents: (query: string, limit?: number) => Promise<Resident[]>;
  createResident: (data: ResidentData & { force?: boolean }) => Promise<{ id?: number; duplicate?: { id: number; first_name: string; last_name: string; birth_date: string; purok: string | null } }>;
  updateResident: (id: number, data: Partial<ResidentData>, expectedVersion?: number) => Promise<{ success: boolean; conflict?: boolean; current?: Resident }>;
  deleteResident: (id: number) => Promise<{ success: boolean }>;
  linkPartner: (residentId: number, partnerId: number) => Promise<{ success: boolean }>;
  unlinkPartner: (residentId: number) => Promise<{ success: boolean }>;
  getChildrenOf: (residentId: number) => Promise<Resident[]>;
  addChildLink: (parentId: number, parentGender: string, childId: number) => Promise<{ success: boolean }>;
  removeChildLink: (parentId: number, parentGender: string, childId: number) => Promise<{ success: boolean }>;
  getResidentsForTree: () => Promise<TreeResident[]>;
  getPartnerRelationships: () => Promise<PartnerRelationship[]>;

  getHouseholds: (params?: { search?: string; page?: number; limit?: number }) => Promise<Household[]>;
  createHousehold: (data: HouseholdData) => Promise<number>;
  updateHousehold: (id: number, data: Partial<HouseholdData>) => Promise<{ success: boolean }>;
  deleteHousehold: (id: number) => Promise<{ success: boolean }>;

  getTemplates: () => Promise<ReportTemplate[]>;
  getTemplate: (id: number) => Promise<ReportTemplate | null>;
  createTemplate: (data: TemplateData) => Promise<number>;
  updateTemplate: (id: number, data: Partial<TemplateData>) => Promise<{ success: boolean }>;
  deleteTemplate: (id: number) => Promise<{ success: boolean }>;

  getInputFields: (templateId: number) => Promise<string[]>;
  generateReport: (templateId: number, residentId: number, inputValues?: Record<string, string>) => Promise<{ success: boolean; html?: string; reportId?: number; paper?: PaperSettings; error?: string }>;
  exportPDF: (html: string, filename: string, paper?: PaperSettings) => Promise<{ success: boolean; path?: string; error?: string }>;
  printReport: (html: string, paper?: PaperSettings) => Promise<{ success: boolean; error?: string }>;
  generateMultiReport: (templateIds: number[], residentId: number) => Promise<{ success: boolean; reports?: { templateName: string; html: string; paper?: PaperSettings }[]; error?: string }>;
  exportMultiPDF: (htmlPages: string[], filename: string, paper?: PaperSettings) => Promise<{ success: boolean; path?: string; error?: string }>;
  printList: (options: PrintListOptions) => Promise<{ success: boolean; path?: string; error?: string }>;
  printGroupedList: (options: PrintGroupedListOptions) => Promise<{ success: boolean; path?: string; error?: string }>;
  getGeneratedReports: (residentId?: number) => Promise<GeneratedReport[]>;
  saveCaseDocument: (data: { case_id: number; title: string; content_html: string }) => Promise<number>;
  saveDocument: (data: { id?: number; case_id?: number | null; resident_id?: number | null; business_id?: number | null; title: string; content_html: string }) => Promise<number>;
  getDocument: (id: number) => Promise<GeneratedReport | undefined>;
  deleteDocument: (id: number) => Promise<{ success: boolean }>;
  listDocuments: (params?: { search?: string; type?: 'all' | 'resident' | 'case' | 'business'; page?: number; limit?: number }) => Promise<{ data: DocumentListItem[]; total: number; page: number; totalPages: number }>;
  getCaseDocuments: (caseId: number) => Promise<GeneratedReport[]>;
  getReportStorageStats: () => Promise<{ count: number; totalBytes: number; oldest: string | null }>;
  cleanupGeneratedReports: (olderThanDays: number) => Promise<{ success: boolean; deleted: number }>;
  getUpcomingSummons: (limit?: number) => Promise<{ id: number; case_id: number; case_number?: string; summon_date: string; summon_time: string | null; summoned_name?: string; status: string }[]>;

  getResidentIssues: (residentId: number) => Promise<ResidentIssue[]>;
  createResidentIssue: (data: { resident_id: number; title: string; details?: string | null }) => Promise<number>;
  updateResidentIssue: (id: number, data: Partial<ResidentIssue>) => Promise<{ success: boolean }>;
  deleteResidentIssue: (id: number) => Promise<{ success: boolean }>;
  getFlaggedResidents: (search?: string) => Promise<FlaggedResident[]>;
  getBusinesses: (params?: { search?: string; status?: string }) => Promise<Business[]>;
  getBusinessOwners: (businessId: number) => Promise<BusinessOwner[]>;
  createBusiness: (data: Partial<Business> & { name: string }, owners: { resident_id?: number | null; outside_owner_id?: number | null }[]) => Promise<number>;
  updateBusiness: (id: number, data: Partial<Business>, owners?: { resident_id?: number | null; outside_owner_id?: number | null }[]) => Promise<{ success: boolean }>;
  deleteBusiness: (id: number) => Promise<{ success: boolean }>;
  getOutsideOwners: (search?: string) => Promise<OutsideOwner[]>;
  createOutsideOwner: (data: Partial<OutsideOwner> & { first_name: string; last_name: string }) => Promise<number>;
  updateOutsideOwner: (id: number, data: Partial<OutsideOwner>) => Promise<{ success: boolean }>;
  deleteOutsideOwner: (id: number) => Promise<{ success: boolean }>;
  getOfficials: () => Promise<Official[]>;
  getOfficial: (id: number) => Promise<Official | null>;
  createOfficial: (data: OfficialData) => Promise<number>;
  updateOfficial: (id: number, data: Partial<OfficialData>) => Promise<{ success: boolean }>;
  deleteOfficial: (id: number) => Promise<{ success: boolean }>;

  getUsers: () => Promise<User[]>;
  createUser: (data: UserCreateData) => Promise<number>;
  updateUser: (id: number, data: UserUpdateData) => Promise<{ success: boolean }>;
  deleteUser: (id: number) => Promise<{ success: boolean }>;
  updatePassword: (id: number, oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (id: number, newPassword: string) => Promise<{ success: boolean; error?: string }>;

  getSetting: (key: string) => Promise<string | undefined>;
  setSetting: (key: string, value: string) => Promise<{ success: boolean }>;
  getAllSettings: () => Promise<Record<string, string>>;

  getDashboardStats: () => Promise<DashboardStats>;
  getDetailedStats: () => Promise<DetailedStats>;
  getAuditLog: (limit: number) => Promise<AuditEntry[]>;

  // CSV Import / Export
  getCSVHeaders: (filePath: string) => Promise<string[]>;
  getSystemFields: () => Promise<SystemField[]>;
  importCSV: (options: { filePath: string; mapping: Record<string, string>; dateFormat: string; skipDuplicates: boolean }) => Promise<ImportResult>;
  rollbackImport: (batchId: number) => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
  downloadCSVTemplate: () => Promise<{ success: boolean; path?: string }>;
  downloadExcelTemplate: (includeExisting?: boolean) => Promise<{ success: boolean; path?: string; error?: string }>;
  readExcelFile: (filePath: string) => Promise<{ success: boolean; rows?: Record<string, string>[]; count?: number; error?: string }>;
  importExcel: (rows: Record<string, string>[], skipDuplicates: boolean) => Promise<{ success: boolean; batchId?: number; totalImported?: number; totalSkipped?: number; totalErrors?: number; errors?: { row: number; field: string; message: string }[]; duplicates?: unknown[]; error?: string }>;
  exportResidents: (params: { is_senior?: boolean; is_youth?: boolean; is_indigent?: boolean; is_4ps?: boolean; status?: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  listImportBatches: () => Promise<ImportBatch[]>;

  // Error Log Export
  exportLogFile: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // Danger Zone
  wipeDatabase: (pin: string) => Promise<{ success: boolean; error?: string }>;
  fillTestData: (pin: string, count?: number) => Promise<{ success: boolean; error?: string }>;
  reseedTemplates: (pin: string) => Promise<{ success: boolean; error?: string }>;
  setDangerZonePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;

  backupDatabase: () => Promise<{ success: boolean; path?: string; error?: string }>;
  restoreDatabase: () => Promise<{ success: boolean; error?: string }>;

  startServer: (port: number) => Promise<{ success: boolean; address?: string; port?: number; url?: string; error?: string }>;
  stopServer: () => Promise<{ success: boolean; error?: string }>;
  getServerStatus: () => Promise<ServerStatus>;
  testServer: () => Promise<{ success: boolean; health?: unknown; stats?: unknown; error?: string }>;
  startTunnel: () => Promise<TunnelState>;
  stopTunnel: () => Promise<TunnelState>;
  getTunnelStatus: () => Promise<TunnelState>;
  listApiClients: () => Promise<{ id: number; name: string; is_active: number; created_at: string; last_seen: string | null }[]>;
  createApiClient: (name: string) => Promise<{ id: number; token: string }>;
  setApiClientActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
  deleteApiClient: (id: number) => Promise<{ success: boolean }>;
  presenceHeartbeat: (input: { entity: string; id: string; action: string; sessionId: string; label?: string }) => Promise<PresenceEntry[]>;
  presenceRelease: (sessionId: string) => Promise<{ success: boolean }>;
  presenceList: () => Promise<PresenceEntry[]>;
  listAppRoles: () => Promise<AppRole[]>;
  createAppRole: (name: string, perms: RolePerms) => Promise<number>;
  updateAppRole: (id: number, data: { name?: string; perms?: RolePerms }) => Promise<{ success: boolean }>;
  deleteAppRole: (id: number) => Promise<{ success: boolean; error?: string }>;
  listAppUsers: () => Promise<AppUser[]>;
  createAppUser: (data: { username: string; full_name?: string | null; password: string; role_id: number | null }) => Promise<number>;
  updateAppUser: (id: number, data: Partial<{ username: string; full_name: string | null; password: string; role_id: number | null; is_active: number }>) => Promise<{ success: boolean }>;
  deleteAppUser: (id: number) => Promise<{ success: boolean }>;
  revealAppUserPassword: (id: number) => Promise<string | null>;

  selectFile: (options: FileDialogOptions) => Promise<FileDialogResult>;
  saveFile: (options: FileDialogOptions) => Promise<SaveDialogResult>;
  saveAvatar: (userId: number, filePath: string) => Promise<string>;
  saveResidentPhoto: (residentId: number, filePath: string) => Promise<string>;
  saveLogo: (sourcePath: string) => Promise<string>;
  removeLogo: () => Promise<boolean>;
  getLogoBase64: () => Promise<string | null>;
  getImageBase64: (imagePath: string) => Promise<string | null>;

  // AI Assistant (template drafting)
  aiTest: () => Promise<{ success: boolean; model?: string; reply?: string; error?: string }>;
  aiGenerateTemplate: (payload: { instruction: string; variables: { key: string; label: string }[] }) => Promise<{ success: boolean; html?: string; error?: string }>;
  aiImproveTemplate: (payload: { instruction: string; currentHtml: string; variables: { key: string; label: string }[] }) => Promise<{ success: boolean; html?: string; error?: string }>;
  onAIAutoDisabled: (callback: (data: { reason: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function getAPI(): ElectronAPI | null {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}
