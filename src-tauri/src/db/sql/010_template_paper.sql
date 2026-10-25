
-- Per-template paper settings: {"size":"A4"|"Letter"|"Long","orientation":"portrait"|"landscape","margins":{"top":1,"bottom":1,"left":1,"right":1}} (margins in inches)
ALTER TABLE report_templates ADD COLUMN paper_json TEXT;
