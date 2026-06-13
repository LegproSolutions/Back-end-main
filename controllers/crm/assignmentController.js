import prisma from "../../config/prisma.js";

// POST /api/crm/assignment/assign
export const assignCandidates = async (req, res) => {
  try {
    const { candidateIds, recruiterIds, clientId, jobId } = req.body;
    const assignedBy = req.admin?.id || req.staff?.id || "system";

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: "Please provide candidateIds array" });
    }

    if (!recruiterIds || !Array.isArray(recruiterIds) || recruiterIds.length === 0) {
      return res.status(400).json({ success: false, message: "Please provide recruiterIds array" });
    }

    const assignedRecords = [];
    
    // Assign candidates to recruiters round-robin if multiple recruiters are selected
    for (let i = 0; i < candidateIds.length; i++) {
      const candidateId = candidateIds[i];
      const assignedTo = recruiterIds[i % recruiterIds.length];

      const candidate = await prisma.cRMCandidate.findUnique({
        where: { id: candidateId }
      });

      if (!candidate) continue;

      const previousOwner = candidate.assigned_recruiter;

      const updatedCandidate = await prisma.cRMCandidate.update({
        where: { id: candidateId },
        data: {
          assigned_recruiter: assignedTo,
          client_id: clientId || candidate.client_id
        }
      });

      // Log assignment history
      const history = await prisma.assignmentHistory.create({
        data: {
          assignedBy,
          assignedTo,
          previousOwner,
          currentOwner: assignedTo,
          candidateId,
          clientId: clientId || candidate.client_id,
          jobId: jobId || null
        }
      });

      // Create an audit log too
      await prisma.auditLog.create({
        data: {
          companyId: req.companyId || null,
          action: "CANDIDATE_ASSIGNED",
          details: `Candidate ${candidate.name} assigned to recruiter ${assignedTo} by ${assignedBy}`
        }
      });

      assignedRecords.push(updatedCandidate);
    }

    res.json({
      success: true,
      message: `Successfully assigned ${assignedRecords.length} candidates to ${recruiterIds.length} recruiters`,
      data: assignedRecords
    });
  } catch (error) {
    console.error("Assign Candidates Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/crm/assignment/history
export const getAssignmentHistory = async (req, res) => {
  try {
    const history = await prisma.assignmentHistory.findMany({
      orderBy: { assignmentDate: "desc" },
      take: 100
    });

    const populatedHistory = [];
    for (const h of history) {
      const candidate = await prisma.cRMCandidate.findUnique({
        where: { id: h.candidateId },
        select: { name: true, phone: true }
      });

      let recruiterName = "Unknown Recruiter";
      if (h.assignedTo) {
        const staff = await prisma.companyStaff.findUnique({
          where: { id: h.assignedTo },
          select: { name: true }
        });
        if (staff) recruiterName = staff.name;
      }

      let assignerName = "System";
      if (h.assignedBy) {
        const staff = await prisma.companyStaff.findUnique({
          where: { id: h.assignedBy },
          select: { name: true }
        });
        if (staff) {
          assignerName = staff.name;
        } else {
          const admin = await prisma.admin.findUnique({
            where: { id: h.assignedBy },
            select: { name: true }
          });
          if (admin) assignerName = admin.name;
        }
      }

      let clientName = null;
      if (h.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: h.clientId },
          select: { company_name: true }
        });
        if (client) clientName = client.company_name;
      }

      let jobTitle = null;
      if (h.jobId) {
        const job = await prisma.cRMJob.findUnique({
          where: { id: h.jobId },
          select: { title: true }
        });
        if (job) jobTitle = job.title;
      }

      populatedHistory.push({
        ...h,
        candidateName: candidate?.name || "Deleted Candidate",
        candidatePhone: candidate?.phone || "",
        recruiterName,
        assignerName,
        clientName,
        jobTitle
      });
    }

    res.json({ success: true, data: populatedHistory });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
