-- Add updatedAt column to Category table
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to update updatedAt on row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedAt = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_updatedAt_on_category ON "Category";
CREATE TRIGGER update_updatedAt_on_category
    BEFORE UPDATE ON "Category"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
