-- ─────────────────────────────────────────────────────────────────────────────
-- Seed data for the Inter-Varsity Competition Platform (PostgreSQL).
-- Mirrors prisma/seed.ts. Safe to re-run (idempotent via ON CONFLICT).
--
-- Usage:
--   psql "$DATABASE_URL" -f sql/schema.sql   (or: prisma db push / migrate)
--   psql "$DATABASE_URL" -f sql/seed.sql
--
-- Staff accounts:
--   There are NO default credentials. The 'admin' row below exists only so the
--   seeded question bank has a creator (foreign key); it is locked with a
--   hash of a discarded random value and cannot be logged into.
--   Set a real password afterwards, e.g.:
--     psql "$DATABASE_URL" -c "UPDATE \"User\" SET \"passwordHash\" = '<bcrypt-hash>' WHERE \"loginId\" = 'admin';"
--   or create staff through the Admin dashboard. `npm run db:seed` generates
--   the admin password for you (ADMIN_PASSWORD / GM_PASSWORD overrides).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── staff accounts ───────────────────────────────────────────────────────────
INSERT INTO "User" ("id", "loginId", "passwordHash", "name", "role", "active", "createdAt", "updatedAt")
VALUES
  ('usr_admin', 'admin', '$2b$10$BUdZKk3kCZqUwwMu95nJWefx7X3BHdKXXv6lw2a3c6xOY31sn391a', 'Administrator', 'ADMIN', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── schools ──────────────────────────────────────────────────────────────────
INSERT INTO "School" ("id", "name", "abbreviation", "active", "createdAt", "updatedAt")
VALUES
  ('sch_unilag', 'University of Lagos',      'UNILAG', true, NOW(), NOW()),
  ('sch_abu',    'Ahmadu Bello University',  'ABU',    true, NOW(), NOW()),
  ('sch_ui',     'University of Ibadan',     'UI',     true, NOW(), NOW()),
  ('sch_buk',    'Bayero University Kano',   'BUK',    true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ── categories ───────────────────────────────────────────────────────────────
INSERT INTO "Category" ("id", "name", "createdAt")
VALUES
  ('cat_math', 'Mathematics', NOW()),
  ('cat_phys', 'Physics', NOW()),
  ('cat_gen',  'General Knowledge', NOW())
ON CONFLICT ("name") DO NOTHING;

-- ── questions ────────────────────────────────────────────────────────────────
INSERT INTO "Question" ("id", "text", "categoryId", "type", "answerKey", "acceptedAlternatives", "numericTolerance", "defaultPoints", "createdById", "active", "createdAt", "updatedAt")
VALUES
  ('q_01', 'What is the value of π rounded to two decimal places?', 'cat_math', 'SHORT_TEXT', '3.14', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_02', 'Solve for x: 2x + 6 = 14', 'cat_math', 'NUMERICAL', '4', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_03', 'What is the sum of the interior angles of a triangle?', 'cat_math', 'SHORT_TEXT', '180', ARRAY['180 degrees', '180°']::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_04', 'Is 17 a prime number?', 'cat_math', 'TRUE_FALSE', 'true', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_05', 'What is the derivative of x²?', 'cat_math', 'SHORT_TEXT', '2x', ARRAY[]::TEXT[], NULL, 20, 'usr_admin', true, NOW(), NOW()),
  ('q_06', 'What is the SI unit of force?', 'cat_phys', 'SHORT_TEXT', 'newton', ARRAY['N']::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_07', 'What is the speed of light in a vacuum (approx., ×10⁸ m/s)?', 'cat_phys', 'NUMERICAL', '3', ARRAY[]::TEXT[], 0.1, 20, 'usr_admin', true, NOW(), NOW()),
  ('q_08', 'Which law states that pressure and volume are inversely proportional at constant temperature?', 'cat_phys', 'MULTIPLE_CHOICE', NULL, ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_09', 'Does an object in free fall (ignoring air resistance) accelerate at approximately 9.8 m/s² on Earth?', 'cat_phys', 'TRUE_FALSE', 'true', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_10', 'What is the capital of Nigeria?', 'cat_gen', 'SHORT_TEXT', 'Abuja', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_11', 'Which planet is known as the Red Planet?', 'cat_gen', 'MULTIPLE_CHOICE', NULL, ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_12', 'How many continents are there on Earth?', 'cat_gen', 'NUMERICAL', '7', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_13', 'What is the chemical symbol for gold?', 'cat_gen', 'SHORT_TEXT', 'Au', ARRAY[]::TEXT[], NULL, 20, 'usr_admin', true, NOW(), NOW()),
  ('q_14', 'Is the Great Wall of China visible from space with the naked eye?', 'cat_gen', 'TRUE_FALSE', 'false', ARRAY[]::TEXT[], NULL, 20, 'usr_admin', true, NOW(), NOW()),
  ('q_15', 'In which year did World War II end?', 'cat_gen', 'NUMERICAL', '1945', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_16', 'What is the square root of 144?', 'cat_math', 'NUMERICAL', '12', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_17', 'What gas do plants absorb from the atmosphere for photosynthesis?', 'cat_phys', 'MULTIPLE_CHOICE', NULL, ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_18', 'What is the largest ocean on Earth?', 'cat_gen', 'SHORT_TEXT', 'Pacific', ARRAY['Pacific Ocean', 'the pacific', 'pacific ocean']::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_19', 'How many degrees are in a right angle?', 'cat_math', 'NUMERICAL', '90', ARRAY[]::TEXT[], NULL, 10, 'usr_admin', true, NOW(), NOW()),
  ('q_20', 'What particle carries the electromagnetic force?', 'cat_phys', 'SHORT_TEXT', 'photon', ARRAY[]::TEXT[], NULL, 20, 'usr_admin', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- options for multiple-choice questions
INSERT INTO "QuestionOption" ("id", "questionId", "text", "isCorrect", "orderIndex")
VALUES
  ('qo_08a', 'q_08', 'Boyle''s law',   true,  0),
  ('qo_08b', 'q_08', 'Charles''s law', false, 1),
  ('qo_08c', 'q_08', 'Hooke''s law',   false, 2),
  ('qo_08d', 'q_08', 'Ohm''s law',     false, 3),
  ('qo_11a', 'q_11', 'Mars',           true,  0),
  ('qo_11b', 'q_11', 'Venus',          false, 1),
  ('qo_11c', 'q_11', 'Jupiter',        false, 2),
  ('qo_11d', 'q_11', 'Saturn',         false, 3),
  ('qo_17a', 'q_17', 'Carbon dioxide', true,  0),
  ('qo_17b', 'q_17', 'Oxygen',         false, 1),
  ('qo_17c', 'q_17', 'Nitrogen',       false, 2),
  ('qo_17d', 'q_17', 'Hydrogen',       false, 3)
ON CONFLICT ("id") DO NOTHING;

-- ── competition + round + match ──────────────────────────────────────────────
INSERT INTO "Competition" ("id", "name", "edition", "organizer", "venue", "status", "publicViewing", "timeZone", "language", "createdAt", "updatedAt")
VALUES ('cmp_main', 'Inter-Varsity Championship', '2026', 'Inter-Varsity Organizing Committee', 'Main Auditorium', 'DRAFT', true, 'UTC', 'en', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Round" ("id", "competitionId", "name", "orderIndex", "status", "config", "leaderboardEnabled", "requiresApproval", "createdAt", "updatedAt")
VALUES ('rnd_prelim', 'cmp_main', 'Preliminary', 0, 'DRAFT', '{}'::JSONB, true, false, NOW(), NOW())
ON CONFLICT ("competitionId", "orderIndex") DO NOTHING;

INSERT INTO "Match" ("id", "competitionId", "roundId", "matchNumber", "status", "phase", "selectionMethod", "config", "currentTurnIndex", "turnCounter", "version", "leaderboardVisible", "timerStatus", "createdAt", "updatedAt")
VALUES ('mt_001', 'cmp_main', 'rnd_prelim', 1, 'DRAFT', 'LOBBY', 'BOARD', '{"turns":{"total":8}}'::JSONB, 0, 0, 0, false, 'IDLE', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MatchSchool" ("id", "matchId", "schoolId", "turnOrder", "score", "correctCount", "qualification")
VALUES
  ('ms_01', 'mt_001', 'sch_unilag', 0, 0, 0, 'NOT_APPLICABLE'),
  ('ms_02', 'mt_001', 'sch_abu',    1, 0, 0, 'NOT_APPLICABLE'),
  ('ms_03', 'mt_001', 'sch_ui',     2, 0, 0, 'NOT_APPLICABLE'),
  ('ms_04', 'mt_001', 'sch_buk',    3, 0, 0, 'NOT_APPLICABLE')
ON CONFLICT ("matchId", "schoolId") DO NOTHING;

-- first 16 active questions assigned to match #1 (same as seed.ts take 16)
INSERT INTO "MatchQuestion" ("id", "matchId", "questionId", "pointValue", "state")
VALUES
  ('mq_01', 'mt_001', 'q_01', 10, 'AVAILABLE'),
  ('mq_02', 'mt_001', 'q_02', 10, 'AVAILABLE'),
  ('mq_03', 'mt_001', 'q_03', 10, 'AVAILABLE'),
  ('mq_04', 'mt_001', 'q_04', 10, 'AVAILABLE'),
  ('mq_05', 'mt_001', 'q_05', 20, 'AVAILABLE'),
  ('mq_06', 'mt_001', 'q_06', 10, 'AVAILABLE'),
  ('mq_07', 'mt_001', 'q_07', 20, 'AVAILABLE'),
  ('mq_08', 'mt_001', 'q_08', 10, 'AVAILABLE'),
  ('mq_09', 'mt_001', 'q_09', 10, 'AVAILABLE'),
  ('mq_10', 'mt_001', 'q_10', 10, 'AVAILABLE'),
  ('mq_11', 'mt_001', 'q_11', 10, 'AVAILABLE'),
  ('mq_12', 'mt_001', 'q_12', 10, 'AVAILABLE'),
  ('mq_13', 'mt_001', 'q_13', 20, 'AVAILABLE'),
  ('mq_14', 'mt_001', 'q_14', 20, 'AVAILABLE'),
  ('mq_15', 'mt_001', 'q_15', 10, 'AVAILABLE'),
  ('mq_16', 'mt_001', 'q_16', 10, 'AVAILABLE')
ON CONFLICT ("matchId", "questionId") DO NOTHING;

-- ── school access codes (XXXX-XXXX, unambiguous alphabet) ────────────────────
INSERT INTO "SchoolAccessCode" ("id", "code", "schoolId", "competitionId", "status", "maxDevices", "createdAt")
VALUES
  ('sac_unilag', 'H7KM-P3X9', 'sch_unilag', 'cmp_main', 'ACTIVE', 1, NOW()),
  ('sac_abu',    'B2ND-Q8VW', 'sch_abu',    'cmp_main', 'ACTIVE', 1, NOW()),
  ('sac_ui',     'K9XT-M4RJ', 'sch_ui',     'cmp_main', 'ACTIVE', 1, NOW()),
  ('sac_buk',    'P3WD-N7H2', 'sch_buk',    'cmp_main', 'ACTIVE', 1, NOW())
ON CONFLICT ("code") DO NOTHING;

COMMIT;
