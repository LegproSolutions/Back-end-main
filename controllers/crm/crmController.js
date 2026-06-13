import prisma from "../../config/prisma.js";
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { getAllocatedClientIds } from "../../middleware/crmPermissionMiddleware.js";

// --- LOGGING UTILITY ---
const logActivity = async (action, entityType, entityId, userId, details) => {
  try {
    await prisma.activityLog.create({
      data: { action, entityType, entityId, userId, details }
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

// --- CANDIDATE CONTROLLERS ---

export const getCandidates = async (req, res) => {
  try {
    const { page = 1, limit = 100, status, client_id, jobId, assigned_recruiter, search, states, districts, education, trades, genders } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const clientIds = await getAllocatedClientIds(req);
    const where = { isDeleted: false };
    if (status) where.status = status;
    if (client_id) {
      if (clientIds !== null && !clientIds.includes(client_id)) {
        return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
      }
      where.client_id = client_id;
    } else if (clientIds !== null) {
      where.client_id = { in: clientIds };
    }

    if (jobId) {
      const applications = await prisma.jobApplication.findMany({
        where: { jobId },
        select: { userId: true }
      });
      const userIds = applications.map(a => a.userId);
      where.userId = { in: userIds };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (states) where.state = { in: states.split(',') };
    if (districts) where.district = { in: districts.split(',') };
    if (genders) where.gender = { in: genders.split(',') };

    if (education) {
      const eduList = education.split(',');
      where.OR = [
        ...(where.OR || []),
        ...eduList.map(edu => ({ education: { contains: edu, mode: 'insensitive' } }))
      ];
    }

    if (trades) {
      const tradeList = trades.split(',');
      where.OR = [
        ...(where.OR || []),
        ...tradeList.map(t => ({ trades: { contains: t, mode: 'insensitive' } }))
      ];
    }

    // Role-based access
    if (assigned_recruiter) {
      where.assigned_recruiter = assigned_recruiter;
    }

    const [total, data] = await Promise.all([
      prisma.cRMCandidate.count({ where }),
      prisma.cRMCandidate.findMany({
        where,
        skip,
        take,
        include: {
          client: true,
          pipelines: { include: { stage: true } },
          user: { include: { profile: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      data,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCandidateById = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    const candidate = await prisma.cRMCandidate.findFirst({
      where: { 
        id: req.params.id, 
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      },
      include: {
        client: true,
        pipelines: { include: { stage: true, client: true } },
        calls: true,
        aiScreening: true,
        user: { include: { profile: true } },
      },
    });
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found or access denied' });
    res.json({ success: true, candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCandidate = async (req, res) => {
  try {
    const data = req.body;
    const clientIds = await getAllocatedClientIds(req);
    if (data.client_id && clientIds !== null && !clientIds.includes(data.client_id)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    const candidate = await prisma.$transaction(async (tx) => {
      const newCandidate = await tx.cRMCandidate.create({
        data: {
          ...data,
          status: data.status || 'new_lead',
          createdBy: req.admin?.id || req.staff?.id,
        },
      });

      if (newCandidate.client_id) {
        let stage = await tx.pipelineStage.findUnique({ where: { stage_name: 'new_lead' } });
        if (!stage) stage = await tx.pipelineStage.create({ data: { stage_name: 'new_lead' } });

        await tx.candidatePipeline.create({
          data: {
            candidate_id: newCandidate.id,
            client_id: newCandidate.client_id,
            stage_id: stage.id,
          },
        });
      }
      return newCandidate;
    });

    await logActivity('CANDIDATE_CREATED', 'Candidate', candidate.id, req.admin?.id || req.staff?.id);
    res.status(201).json({ success: true, candidate });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateCandidate = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    const candidate = await prisma.cRMCandidate.findFirst({
      where: {
        id: req.params.id,
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      }
    });

    if (!candidate) {
      return res.status(403).json({ success: false, message: "Access forbidden or candidate not found" });
    }

    if (req.body.client_id && clientIds !== null && !clientIds.includes(req.body.client_id)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    const { alternatePhone, ...updateData } = req.body;

    const updated = await prisma.cRMCandidate.update({
      where: { id: req.params.id },
      data: { ...updateData, updatedBy: req.admin?.id || req.staff?.id },
    });

    if (alternatePhone !== undefined && candidate.userId) {
      await prisma.userProfile.updateMany({
        where: { userId: candidate.userId },
        data: { alternatePhone }
      });
    }

    await logActivity('CANDIDATE_UPDATED', 'Candidate', updated.id, req.admin?.id || req.staff?.id);
    res.json({ success: true, candidate: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteCandidate = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    const candidate = await prisma.cRMCandidate.findFirst({
      where: {
        id: req.params.id,
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      }
    });

    if (!candidate) {
      return res.status(403).json({ success: false, message: "Access forbidden or candidate not found" });
    }

    await prisma.cRMCandidate.update({
      where: { id: req.params.id },
      data: { isDeleted: true, deletedAt: new Date(), updatedBy: req.admin?.id || req.staff?.id },
    });
    await logActivity('CANDIDATE_DELETED', 'Candidate', req.params.id, req.admin?.id || req.staff?.id);
    res.json({ success: true, message: 'Candidate deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const bulkCandidateImport = async (req, res) => {
  try {
    let candidates = req.body;
    let recruiterId = req.query.recruiterId || req.body.recruiterId;
    let clientId = req.query.clientId || req.body.clientId;
    let jobId = req.query.jobId || req.body.jobId;

    if (!Array.isArray(candidates) && req.body.candidates) {
      candidates = req.body.candidates;
    }

    if (!Array.isArray(candidates)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    let count = 0;
    let skipped = 0;
    const assignedBy = req.admin?.id || req.staff?.id || "system";

    for (const data of candidates) {
      try {
        const phone = data.phone || data.Phone || data.mobile || data.Mobile || data['Mobile Number'] || data['mobile number'];
        if (!phone) {
          skipped++;
          continue;
        }

        const phoneStr = String(phone).replace(/[^0-9]/g, '');
        if (phoneStr.length < 10) {
          skipped++;
          continue;
        }

        const email = data.email || data.Email || data.EmailAddress || data['Email Address'] || null;

        const existing = await prisma.cRMCandidate.findFirst({
          where: {
            OR: [
              { phone: phoneStr },
              ...(email ? [{ email }] : [])
            ]
          }
        });

        if (existing) {
          skipped++;
          continue;
        }

        const newCandidate = await prisma.cRMCandidate.create({
          data: {
            name: data.name || data.Name || data.fullName || data.FullName || data.Fullname || data['Full Name'] || data['full name'] || data['Candidate Name'] || data['candidate name'] || data.fullname || 'Unknown',
            email: email,
            phone: phoneStr,
            state: data.state || data.State || data.Location || data.location || null,
            district: data.district || data.District || null,
            education: data.education || data.Education || null,
            trades: data.trades || data.Trades || data.Trade || null,
            experience: data.experience || data.Experience || null,
            gender: data.gender || data.Gender || null,
            dob: (() => {
              const val = data.dob || data.Dob;
              if (!val) return null;
              const num = Number(val);
              if (!isNaN(num) && num > 10000 && num < 60000) {
                const date = new Date(Math.round((num - 25569) * 86400 * 1000));
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
              }
              return String(val);
            })(),
            source: data.source || data.Source || 'Bulk Import',
            status: 'new_lead',
            createdBy: req.admin?.id || req.staff?.id,
            assigned_recruiter: recruiterId || null,
            client_id: clientId || null,
            resume_url: data.resumeLink || data.resume_url || data['Resume Link'] || null
          },
        });

        if (recruiterId) {
          // Log assignment history
          await prisma.assignmentHistory.create({
            data: {
              assignedBy,
              assignedTo: recruiterId,
              previousOwner: null,
              currentOwner: recruiterId,
              candidateId: newCandidate.id,
              clientId: clientId || null,
              jobId: jobId || null
            }
          });
        }

        if (clientId) {
          let stage = await prisma.pipelineStage.findUnique({ where: { stage_name: 'new_lead' } });
          if (!stage) stage = await prisma.pipelineStage.create({ data: { stage_name: 'new_lead' } });

          await prisma.candidatePipeline.create({
            data: {
              candidate_id: newCandidate.id,
              client_id: clientId,
              stage_id: stage.id,
            },
          });
        }

        count++;
      } catch (err) {
        console.error('Error importing candidate:', err);
        skipped++;
      }
    }

    res.json({ success: true, count, skipped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- CLIENT CONTROLLERS ---

export const getClients = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    const where = { isDeleted: false };
    if (clientIds !== null) {
      where.id = { in: clientIds };
    }

    const clients = await prisma.client.findMany({
      where,
      include: {
        _count: { select: { candidates: true, pipelines: true } },
      },
    });
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getClientById = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null && !clientIds.includes(req.params.id)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    const client = await prisma.client.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: {
        candidates: { where: { isDeleted: false } },
        pipelines: { include: { stage: true, candidate: true } },
      },
    });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, client });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createClient = async (req, res) => {
  try {
    const client = await prisma.client.create({
      data: { ...req.body, createdBy: req.admin?.id || req.staff?.id },
    });
    await logActivity('CLIENT_CREATED', 'Client', client.id, req.admin?.id || req.staff?.id);
    res.status(201).json({ success: true, client });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateClient = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null && !clientIds.includes(req.params.id)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    const updated = await prisma.client.update({
      where: { id: req.params.id },
      data: { ...req.body, updatedBy: req.admin?.id || req.staff?.id },
    });
    await logActivity('CLIENT_UPDATED', 'Client', updated.id, req.admin?.id || req.staff?.id);
    res.json({ success: true, client: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- PIPELINE CONTROLLERS ---

export const updatePipelineStage = async (req, res) => {
  try {
    const candidateId = req.params.candidateId || req.body.candidateId;
    const clientId = req.body.client_id || req.body.clientId;
    const stageName = req.body.stage_name || req.body.stageName;
    const notes = req.body.notes;

    if (!candidateId || !clientId || !stageName) {
      return res.status(400).json({ success: false, message: 'Missing candidateId, clientId, or stageName' });
    }

    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null && !clientIds.includes(clientId)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    let stage = await prisma.pipelineStage.findUnique({ where: { stage_name: stageName } });
    if (!stage) stage = await prisma.pipelineStage.create({ data: { stage_name: stageName } });

    const existingPipeline = await prisma.candidatePipeline.findFirst({
      where: { candidate_id: candidateId, client_id: clientId },
    });

    let pipeline;
    if (existingPipeline) {
      pipeline = await prisma.candidatePipeline.update({
        where: { id: existingPipeline.id },
        data: { stage_id: stage.id, notes },
      });
    } else {
      pipeline = await prisma.candidatePipeline.create({
        data: { candidate_id: candidateId, client_id: clientId, stage_id: stage.id, notes },
      });
    }

    await prisma.cRMCandidate.update({
      where: { id: candidateId },
      data: { status: stageName },
    });

    await logActivity('PIPELINE_UPDATED', 'Candidate', candidateId, req.admin?.id || req.staff?.id, `Moved to ${stageName}`);
    res.json({ success: true, pipeline });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// --- JOB CONTROLLERS ---

export const getCRMJobs = async (req, res) => {
  try {
    const { client_id, status } = req.query;
    const clientIds = await getAllocatedClientIds(req);
    const where = { isDeleted: false };
    
    if (client_id) {
      if (clientIds !== null && !clientIds.includes(client_id)) {
        return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
      }
      where.client_id = client_id;
    } else if (clientIds !== null) {
      where.client_id = { in: clientIds };
    }
    
    if (status) where.status = status;

    const jobs = await prisma.cRMJob.findMany({
      where,
      include: {
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // --- FETCH CANDIDATES FOR MATCHING ---
    const candidates = await prisma.cRMCandidate.findMany({
      where: { 
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      },
      select: { id: true, trades: true, state: true, district: true }
    });

    const jobsWithCount = jobs.map(job => {
      const jobWords = [
        ...(job.title?.toLowerCase().split(/\s+/) || []),
        ...(job.requirements?.toLowerCase().split(/[\s,]+/) || []),
        ...(job.location?.toLowerCase().split(/[\s,]+/) || [])
      ].filter(w => w && w.length > 2);

      const eligibleCount = candidates.filter(can => {
        const canTrades = (can.trades || "").toLowerCase();
        const canLoc = `${can.state || ""} ${can.district || ""}`.toLowerCase();
        return jobWords.some(word => canTrades.includes(word) || canLoc.includes(word));
      }).length;

      return { ...job, eligibleCount: eligibleCount || 0 };
    });

    res.json({ success: true, data: jobsWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- PIPELINE CONTROLLERS ---

export const getPipelineByClient = async (req, res) => {
  try {
    const { id } = req.params;
    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null && !clientIds.includes(id)) {
      return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
    }

    const pipeline = await prisma.candidatePipeline.findMany({
      where: { 
        client_id: id,
        candidate: {
          isDeleted: false
        }
      },
      include: {
        stage: true,
        candidate: true
      },
      orderBy: { updatedAt: 'desc' }
    });
    // Filter out null candidates (if any were filtered out by the relation)
    const filteredPipeline = pipeline.filter(p => p.candidate !== null);
    res.json({ success: true, data: filteredPipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- ANALYTICS/STATS ---

export const getCRMStats = async (req, res) => {
  try {
    const clientIds = await getAllocatedClientIds(req);
    const where = { isDeleted: false };
    const clientWhere = { isDeleted: false };
    const jobWhere = { isDeleted: false };

    if (clientIds !== null) {
      where.client_id = { in: clientIds };
      clientWhere.id = { in: clientIds };
      jobWhere.client_id = { in: clientIds };
    }



    const [candidates, clients, jobs] = await Promise.all([
      prisma.cRMCandidate.count({ where }),
      prisma.client.count({ where: clientWhere }),
      prisma.cRMJob.count({ where: jobWhere }),
    ]);

    const educationStats = await prisma.cRMCandidate.groupBy({
      by: ['education'],
      where,
      _count: { education: true },
    });

    const stateStats = await prisma.cRMCandidate.groupBy({
      by: ['state'],
      where,
      _count: { state: true },
    });

    // Added: Pipeline Stats for Funnel
    const pipelineStages = await prisma.cRMCandidate.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const pipelineStats = pipelineStages.map(s => ({
      stage: s.status,
      count: s._count.status
    }));

    // Added: Conversion Rate Calculations
    const joinedCandidates = await prisma.cRMCandidate.count({
      where: { ...where, status: 'joined' }
    });

    const conversionRate = candidates > 0 ? Math.round((joinedCandidates / candidates) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalCandidates: candidates,
        totalClients: clients,
        totalJobs: jobs,
        joinedCandidates,
        conversionRate,
        pipelineStats,
        education: educationStats.map(s => ({ name: s.education || 'Others', count: s._count.education })),
        states: stateStats.map(s => ({ name: s.state || 'Unknown', count: s._count.state })),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
