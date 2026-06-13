import prisma from "../../config/prisma.js";

// POST /api/crm/calls/log
export const logCall = async (req, res) => {
  try {
    const { candidateId, disposition1, disposition2, remarks, followUpDate, followUpTime } = req.body;
    const recruiterId = req.staff?.id || req.admin?.id;
    const recruiterName = req.staff?.name || req.admin?.name || "Recruiter";

    if (!candidateId || !disposition1) {
      return res.status(400).json({ success: false, message: "Missing candidateId or disposition1" });
    }

    const candidate = await prisma.cRMCandidate.findUnique({
      where: { id: candidateId }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    // Save Call Record
    const callRecord = await prisma.call.create({
      data: {
        candidate_id: candidateId,
        recruiter_id: recruiterId,
        status: disposition1, // Level 1 disposition
        disposition2: disposition2 || null, // Level 2 disposition
        remarks: remarks || "",
        followUpDate: followUpDate || null,
        followUpTime: followUpTime || null,
        candidateName: candidate.name,
        recruiterName,
        mobileNumber: candidate.phone,
        duration: 0
      }
    });

    // Update candidate's follow-up details and status
    const updateData = {
      followUpDate: followUpDate || null,
      followUpTime: followUpTime || null,
      followUpNotes: remarks || null
    };

    if (disposition2) {
      updateData.status = disposition2; // E.g., Shortlisted, Selected, Joined
    }

    await prisma.cRMCandidate.update({
      where: { id: candidateId },
      data: updateData
    });

    // Sync status to candidate pipeline if client exists
    if (disposition2 && candidate.client_id) {
      let stage = await prisma.pipelineStage.findUnique({
        where: { stage_name: disposition2 }
      });
      if (!stage) {
        stage = await prisma.pipelineStage.create({
          data: { stage_name: disposition2 }
        });
      }

      const existingPipeline = await prisma.candidatePipeline.findFirst({
        where: { candidate_id: candidateId, client_id: candidate.client_id }
      });

      if (existingPipeline) {
        await prisma.candidatePipeline.update({
          where: { id: existingPipeline.id },
          data: { stage_id: stage.id, notes: remarks }
        });
      } else {
        await prisma.candidatePipeline.create({
          data: {
            candidate_id: candidateId,
            client_id: candidate.client_id,
            stage_id: stage.id,
            notes: remarks
          }
        });
      }
    }

    res.json({
      success: true,
      message: "Call activity logged successfully",
      data: callRecord
    });
  } catch (error) {
    console.error("Log Call Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/crm/calls/followups
export const getFollowupsDueToday = async (req, res) => {
  try {
    const recruiterId = req.staff?.id || req.admin?.id;
    // Format date as YYYY-MM-DD
    const todayStr = new Date().toISOString().split("T")[0];

    const candidates = await prisma.cRMCandidate.findMany({
      where: {
        assigned_recruiter: recruiterId,
        followUpDate: todayStr,
        isDeleted: false
      },
      include: {
        client: true
      }
    });

    res.json({ success: true, data: candidates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
