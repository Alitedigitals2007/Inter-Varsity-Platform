=============================================================================
-- Migration: Add ON DELETE CASCADE to Match table foreign keys
-- =============================================================================

-- Drop existing constraint for competitionId and recreate with CASCADE
-- PostgreSQL requires dropping the constraint before modifying it
DO $$
DECLARE
 old_constraint_name TEXT;
BEGIN
 SELECT tc.constraint_name INTO old_constraint_name
 FROM information_schema.table_constraints tc
 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
 WHERE tc.constraint_type = 'FOREIGN KEY'
 AND tc.table_name = 'Match'
 AND kcu.column_name = 'competitionId'
 AND tc.table_schema = 'public'
 LIMIT 1;
 
 IF old_constraint_name IS NOT NULL THEN
 EXECUTE format('ALTER TABLE "Match" DROP CONSTRAINT %I', old_constraint_name);
 END IF;
END $$;

-- Add new constraint with ON DELETE CASCADE
ALTER TABLE "Match" ADD CONSTRAINT "Match_competitionId_fkey"
 FOREIGN KEY ("competitionId")
 REFERENCES "Competition"("id")
 ON DELETE CASCADE;

-- Drop existing constraint for roundId and recreate with CASCADE
DO $$
DECLARE
 old_constraint_name TEXT;
BEGIN
 SELECT tc.constraint_name INTO old_constraint_name
 FROM information_schema.table_constraints tc
 JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
 WHERE tc.constraint_type = 'FOREIGN KEY'
 AND tc.table_name = 'Match'
 AND kcu.column_name = 'roundId'
 AND tc.table_schema = 'public'
 LIMIT 1;
 
 IF old_constraint_name IS NOT NULL THEN
 EXECUTE format('ALTER TABLE "Match" DROP CONSTRAINT %I', old_constraint_name);
 END IF;
END $$;

-- Add new constraint with ON DELETE CASCADE for roundId
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey"
 FOREIGN KEY ("roundId")
 REFERENCES "Round"("id")
 ON DELETE CASCADE;

-- Create indexes if they don't exist (performance optimization)
CREATE INDEX IF NOT EXISTS "Match_competitionId_idx" ON "Match"("competitionId");
CREATE INDEX IF NOT EXISTS "Match_roundId_idx" ON "Match"("roundId");

-- Add CASCADE to activeSchoolId if needed (optional - for soft deletes)
-- Uncomment if your Match table has an activeSchoolId column with a self-referencing FK
-- DO $$
-- DECLARE old_constraint_name TEXT;
-- BEGIN
-- SELECT tc.constraint_name INTO old_constraint_name
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- AND tc.table_name = 'Match'
-- AND kcu.column_name = 'activeSchoolId'
-- AND tc.table_schema = 'public'
-- LIMIT 1;
-- IF old_constraint_name IS NOT NULL THEN
-- EXECUTE format('ALTER TABLE "Match" DROP CONSTRAINT %I', old_constraint_name);
-- END IF;
-- END $$;
-- ALTER TABLE "Match" ADD CONSTRAINT "Match_activeSchoolId_fkey"
-- FOREIGN KEY ("activeSchoolId")
-- REFERENCES "School"("id")
-- ON DELETE SET NULL;

SELECT 'Migration completed successfully' as status;