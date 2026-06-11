export const TEMPLATE_VARIABLES = [
  { key: 'fullName', label: 'Full Name', description: 'Complete name with suffix' },
  { key: 'firstName', label: 'First Name', description: 'First name only' },
  { key: 'middleName', label: 'Middle Name', description: 'Middle name' },
  { key: 'lastName', label: 'Last Name', description: 'Last name / surname' },
  { key: 'suffix', label: 'Suffix', description: 'Name suffix (Jr., Sr., etc.)' },
  { key: 'middleInitial', label: 'Middle Initial', description: 'Middle name initial with period' },
  { key: 'purok', label: 'Purok', description: 'Purok number/name' },
  { key: 'address', label: 'Address', description: 'Full address' },
  { key: 'birthDate', label: 'Birth Date', description: 'Formatted birth date' },
  { key: 'age', label: 'Age', description: 'Current age in years' },
  { key: 'gender', label: 'Gender', description: 'Male or Female' },
  { key: 'civilStatus', label: 'Civil Status', description: 'Single, Married, etc.' },
  { key: 'contactNumber', label: 'Contact Number', description: 'Phone/mobile number' },
  { key: 'email', label: 'Email', description: 'Email address' },
  { key: 'occupation', label: 'Occupation', description: 'Job/occupation' },
  { key: 'voterStatus', label: 'Voter Status', description: 'Registered or Not Registered' },
  { key: 'bloodType', label: 'Blood Type', description: 'Blood type' },
  { key: 'partnerName', label: 'Partner/Spouse Name', description: 'Name of partner/spouse' },
  { key: 'barangay', label: 'Barangay Name', description: 'Name of the barangay (from settings)' },
  { key: 'barangayAddress', label: 'Barangay Address', description: 'Address of the barangay' },
  { key: 'municipality', label: 'Municipality/City', description: 'Municipality or city name' },
  { key: 'province', label: 'Province', description: 'Province name' },
  { key: 'date', label: 'Current Date', description: 'Today\'s date formatted' },
  { key: 'dateOrdinal', label: 'Date (Ordinal)', description: 'e.g., "10th day of June, 2026"' },
  { key: 'year', label: 'Current Year', description: 'Current year' },
  { key: 'religion', label: 'Religion', description: 'Resident\'s religion' },
  { key: 'citizenship', label: 'Citizenship', description: 'Resident\'s citizenship' },
  { key: 'philsysCardNo', label: 'PhilSys Card No.', description: 'National ID number' },
  { key: 'educationalAttainment', label: 'Educational Attainment', description: 'Highest education level' },
  // Business variables — fill in automatically for documents created from the Businesses page
  { key: 'businessName', label: 'Business Name', description: 'Name of the business' },
  { key: 'businessNature', label: 'Business Nature', description: 'Nature/type of the business' },
  { key: 'businessAddress', label: 'Business Address', description: 'Business address' },
  { key: 'businessPurok', label: 'Business Purok', description: 'Purok where the business operates' },
  { key: 'businessOwners', label: 'Business Owners', description: 'All owners, comma-separated' },
  { key: 'businessStatus', label: 'Business Status', description: 'Active or Closed' },
  { key: 'businessDateRegistered', label: 'Date Registered', description: 'Business registration date' },
];

// Special template tags
export const TEMPLATE_SPECIAL_TAGS = [
  { key: '{{header}}', label: 'Barangay Header', description: 'Inserts the standard letterhead with logos and barangay info' },
  { key: '{{input:fieldName}}', label: 'Custom Input', description: 'Shows a text input box when generating (replace fieldName with your field)' },
  { key: '{{signatory:role}}', label: 'Signatory', description: 'Auto-fills from officials table (e.g., {{signatory:punong_barangay}})' },
];

export const GRADIENT_COLORS = [
  ['#FF6B6B', '#EE5A24'],
  ['#4ECDC4', '#2ECC71'],
  ['#3498DB', '#2980B9'],
  ['#9B59B6', '#8E44AD'],
  ['#F39C12', '#E67E22'],
  ['#1ABC9C', '#16A085'],
  ['#E74C3C', '#C0392B'],
  ['#2ECC71', '#27AE60'],
  ['#3498DB', '#2C3E50'],
  ['#E91E63', '#9C27B0'],
];

export function getGradientForId(id: number): [string, string] {
  return GRADIENT_COLORS[id % GRADIENT_COLORS.length] as [string, string];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── Template page visibility ────────────────────────────────────────────────
// pages_json on a template lists where it appears; NULL/empty = everywhere.
export const TEMPLATE_PAGES = [
  { key: 'residents', label: 'Residents' },
  { key: 'seniors', label: 'Senior Citizens' },
  { key: 'indigents', label: 'Indigents' },
  { key: 'youth', label: 'Youth' },
  { key: 'four-ps', label: '4Ps Beneficiaries' },
  { key: 'deceased', label: 'Deceased' },
  { key: 'flagged', label: 'Flagged Residents' },
  { key: 'generator', label: 'Generator' },
  { key: 'cases', label: 'Cases & Summons' },
  { key: 'businesses', label: 'Businesses' },
];

export function templateVisibleOn(t: { pages_json?: string | null }, pageKey?: string): boolean {
  if (!pageKey || !t.pages_json) return true;
  try {
    const pages = JSON.parse(t.pages_json);
    if (!Array.isArray(pages) || pages.length === 0) return true;
    return pages.includes(pageKey);
  } catch {
    return true;
  }
}
