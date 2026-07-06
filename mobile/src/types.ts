export interface Permissions {
  search: boolean;
  read: boolean;
  create: boolean; // also governs edit/update
  delete: boolean;
}

export interface AppUser {
  id: number;
  name: string;
  username: string;
  role: string | null;
  permissions: Permissions;
}

export interface Resident {
  id: number;
  resident_uid?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birth_date: string;
  age?: number;
  gender: string;
  civil_status: string;
  address?: string | null;
  purok?: string | null;
  contact_number?: string | null;
  email?: string | null;
  occupation?: string | null;
  is_indigent?: number;
  is_4ps?: number;
  is_pwd?: number;
  pwd_note?: string | null;
  voter_status?: string | null;
  religion?: string | null;
  citizenship?: string | null;
  educational_attainment?: string | null;
  status?: string;
  row_version?: number;
}

export interface ResidentList {
  data: Resident[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Connection {
  baseUrl: string;        // office Wi-Fi URL (primary)
  webUrl?: string | null; // optional internet URL (tunnel) — used when Wi-Fi is unreachable
  deviceKey: string;
}
