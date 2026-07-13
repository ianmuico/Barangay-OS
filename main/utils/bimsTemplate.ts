// BIMS export column mapping (RBI-aligned).
//
// DILG LGUSS-BIMS accepts external data ONLY via its own prescribed Excel template
// (there is no public API). We do not have that template's exact columns — they are
// login-gated and obtained per-barangay from a DILG Information System Analyst (ISA).
// This profile is a best-guess mapping to the Records of Barangay Inhabitants (RBI)
// fields. When the real template is available, adjust the `header` values here to
// match it exactly — this is the ONLY file that should need to change.

export interface BimsColumn {
  header: string;
  required?: boolean;
  get: (r: any) => string | number;
}

const yn = (v: any) => (v ? 'Yes' : 'No');

export const BIMS_RBI_COLUMNS: BimsColumn[] = [
  { header: 'Last Name', required: true, get: (r) => r.last_name || '' },
  { header: 'First Name', required: true, get: (r) => r.first_name || '' },
  { header: 'Middle Name', get: (r) => r.middle_name || '' },
  { header: 'Suffix', get: (r) => r.suffix || '' },
  { header: 'Sex', required: true, get: (r) => r.gender || '' },
  { header: 'Date of Birth', required: true, get: (r) => r.birth_date || '' },
  { header: 'Place of Birth', get: (r) => r.birth_place || '' },
  { header: 'Civil Status', get: (r) => r.civil_status || '' },
  { header: 'Citizenship', get: (r) => r.citizenship || '' },
  { header: 'Religion', get: (r) => r.religion || '' },
  { header: 'Occupation', get: (r) => r.occupation || '' },
  { header: 'Educational Attainment', get: (r) => r.educational_attainment || '' },
  { header: 'PhilSys Card No', get: (r) => r.philsys_card_no || '' },
  { header: 'Contact Number', get: (r) => r.contact_number || '' },
  { header: 'Purok/Zone', get: (r) => r.purok || '' },
  { header: 'Address', get: (r) => r.address || '' },
  { header: 'Household No', get: (r) => r.household_number || '' },
  { header: 'Relationship to Head', get: (r) => r.relationship_to_head || '' },
  { header: 'Registered Voter', get: (r) => (r.voter_status === 'Registered' ? 'Yes' : 'No') },
  { header: 'Labor Force Status', get: (r) => r.labor_force_status || '' },
  { header: 'Residency Status', get: (r) => r.residency_status || '' },
  { header: 'Senior Citizen', get: (r) => yn((r.age ?? 0) >= 60) },
  { header: 'PWD', get: (r) => yn(r.is_pwd) },
  { header: 'Disability Type', get: (r) => r.disability_type || '' },
  { header: 'PWD ID No', get: (r) => r.pwd_id_no || '' },
  { header: 'Solo Parent', get: (r) => yn(r.is_solo_parent) },
  { header: 'Out-of-School Youth', get: (r) => yn(r.is_osy) },
  { header: 'OFW', get: (r) => yn(r.is_ofw) },
  { header: 'Indigenous Person', get: (r) => yn(r.is_ip) },
  { header: 'Ethnicity', get: (r) => r.ethnicity || '' },
  { header: '4Ps Beneficiary', get: (r) => yn(r.is_4ps) },
  { header: 'Indigent', get: (r) => yn(r.is_indigent) },
];
