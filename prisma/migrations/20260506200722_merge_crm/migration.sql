/*
  Warnings:

  - You are about to drop the `Candidate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Candidate";

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMCandidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "education" TEXT,
    "experience" TEXT,
    "state" TEXT,
    "district" TEXT,
    "trades" TEXT,
    "dob" TEXT,
    "gender" TEXT,
    "resume_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new_lead',
    "source" TEXT NOT NULL DEFAULT 'Direct',
    "assigned_recruiter" TEXT,
    "client_id" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidatePipeline" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatePipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "recruiter_id" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "recording_url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIScreening" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT,
    "skills" TEXT,
    "experience" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMJob" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "location" TEXT,
    "minSalary" TEXT,
    "maxSalary" TEXT,
    "minAge" INTEGER DEFAULT 18,
    "maxAge" INTEGER DEFAULT 45,
    "openPositions" INTEGER NOT NULL DEFAULT 1,
    "filledPositions" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requirements" TEXT,
    "education" TEXT,
    "specialization" TEXT,
    "minExperience" TEXT DEFAULT '0',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "userId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CRMCandidate_phone_key" ON "CRMCandidate"("phone");

-- CreateIndex
CREATE INDEX "CRMCandidate_email_idx" ON "CRMCandidate"("email");

-- CreateIndex
CREATE INDEX "CRMCandidate_phone_idx" ON "CRMCandidate"("phone");

-- CreateIndex
CREATE INDEX "CRMCandidate_assigned_recruiter_idx" ON "CRMCandidate"("assigned_recruiter");

-- CreateIndex
CREATE INDEX "CRMCandidate_client_id_idx" ON "CRMCandidate"("client_id");

-- CreateIndex
CREATE INDEX "CRMCandidate_status_idx" ON "CRMCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_stage_name_key" ON "PipelineStage"("stage_name");

-- CreateIndex
CREATE UNIQUE INDEX "CandidatePipeline_candidate_id_client_id_stage_id_key" ON "CandidatePipeline"("candidate_id", "client_id", "stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "AIScreening_candidate_id_key" ON "AIScreening"("candidate_id");

-- CreateIndex
CREATE INDEX "CRMJob_client_id_idx" ON "CRMJob"("client_id");

-- AddForeignKey
ALTER TABLE "CRMCandidate" ADD CONSTRAINT "CRMCandidate_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePipeline" ADD CONSTRAINT "CandidatePipeline_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "CRMCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePipeline" ADD CONSTRAINT "CandidatePipeline_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePipeline" ADD CONSTRAINT "CandidatePipeline_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "CRMCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScreening" ADD CONSTRAINT "AIScreening_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "CRMCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMJob" ADD CONSTRAINT "CRMJob_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
