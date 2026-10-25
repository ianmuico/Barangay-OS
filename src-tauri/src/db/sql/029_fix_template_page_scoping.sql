
UPDATE report_templates SET pages_json = '["businesses"]'
  WHERE name = 'Business Clearance' AND pages_json IS NULL;
UPDATE report_templates SET pages_json = '["cases"]'
  WHERE name IN ('Sumbong (Complaint)', 'Pagtawag / Summons (Bisaya)', 'Minutas sa Husay (Mediation)')
  AND pages_json IS NULL;
UPDATE report_templates SET pages_json = '["residents","seniors","indigents","youth","four-ps","pwd","solo-parents","osy","ofw","ip","deceased","flagged","generator"]'
  WHERE name IN (
    'Barangay Clearance', 'Certificate of Residency', 'Certificate of Indigency',
    'Certification for Loan', 'First Time Job Seekers (RA 11261)', 'Out of School Youth (OSY)',
    'Residence Certificate (4Ps)', 'Living Separately Certification', 'Oath of Undertaking (Job Seekers)'
  ) AND pages_json IS NULL;
