-- Add updatedAt column with a default value for existing rows
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Set default for existing rows
UPDATE "Category" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- Add a trigger to update updatedAt on row update
CREATE OR REPLACE FUNCTION update_updated_at_category()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedAt = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_updated_at_category_trigger ON "Category";
CREATE TRIGGER update_updated_at_category_trigger
    BEFORE UPDATE ON "Category"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_category();
