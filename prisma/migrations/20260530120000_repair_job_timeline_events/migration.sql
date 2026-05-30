-- AlterEnum
ALTER TYPE "RepairJobActivityType" ADD VALUE 'part_added';
ALTER TYPE "RepairJobActivityType" ADD VALUE 'part_removed';
ALTER TYPE "RepairJobActivityType" ADD VALUE 'repeat_scheduled';
ALTER TYPE "RepairJobActivityType" ADD VALUE 'repeat_created';

-- AlterTable
ALTER TABLE "RepairJobActivityLog" ADD COLUMN "metadata" JSONB;
