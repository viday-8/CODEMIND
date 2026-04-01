-- CreateEnum
CREATE TYPE "FddStatus" AS ENUM ('UPLOADING', 'PARSING', 'EXTRACTING', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RequirementClassification" AS ENUM ('GAP', 'UPDATE', 'EXISTING');

-- CreateTable
CREATE TABLE "FunctionalDoc" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" "FddStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    "bullJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionalDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FddRequirement" (
    "id" TEXT NOT NULL,
    "fddId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classification" "RequirementClassification",
    "rationale" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FddRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FunctionalDoc_repositoryId_idx" ON "FunctionalDoc"("repositoryId");

-- CreateIndex
CREATE INDEX "FddRequirement_fddId_idx" ON "FddRequirement"("fddId");

-- CreateIndex
CREATE UNIQUE INDEX "FddRequirement_taskId_key" ON "FddRequirement"("taskId");

-- AddForeignKey
ALTER TABLE "FunctionalDoc" ADD CONSTRAINT "FunctionalDoc_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionalDoc" ADD CONSTRAINT "FunctionalDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FddRequirement" ADD CONSTRAINT "FddRequirement_fddId_fkey" FOREIGN KEY ("fddId") REFERENCES "FunctionalDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FddRequirement" ADD CONSTRAINT "FddRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
