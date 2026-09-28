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
    const { page = 1, limit = 100, status, client_id, jobId, assigned_recruiter, search, states, districts, education, trades, genders, sources } = req.query;
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
    if (sources) where.source = { in: sources.split(',') };

    if (education) {
      const eduList = education.split(',');
      where.AND = [
        ...(where.AND || []),
        {
          OR: eduList.map(edu => ({ education: { contains: edu, mode: 'insensitive' } }))
        }
      ];
    }

    if (trades) {
      const tradeList = trades.split(',');
      where.AND = [
        ...(where.AND || []),
        {
          OR: tradeList.map(t => ({ trades: { contains: t, mode: 'insensitive' } }))
        }
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

    // Fetch new_lead stage once if clientId is provided
    let stageId = null;
    if (clientId) {
      let stage = await prisma.pipelineStage.findUnique({ where: { stage_name: 'new_lead' } });
      if (!stage) stage = await prisma.pipelineStage.create({ data: { stage_name: 'new_lead' } });
      stageId = stage.id;
    }

    // Keep track of imported phone numbers and emails to avoid duplicates in the same import session
    const importedPhones = new Set();
    const importedEmails = new Set();

    const chunkSize = 1000;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);

      // Pre-process chunk to filter out bad rows and self-duplicates
      const processedChunk = [];
      const chunkPhones = [];
      const chunkEmails = [];

      for (const data of chunk) {
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

        if (importedPhones.has(phoneStr) || (email && importedEmails.has(email))) {
          skipped++;
          continue;
        }

        processedChunk.push({ data, phoneStr, email });
        chunkPhones.push(phoneStr);
        if (email) chunkEmails.push(email);
      }

      if (processedChunk.length === 0) continue;

      // Query database for existing candidates matching this chunk's phones/emails
      const existingInDb = await prisma.cRMCandidate.findMany({
        where: {
          OR: [
            { phone: { in: chunkPhones } },
            { email: { in: chunkEmails } }
          ]
        },
        select: { phone: true, email: true }
      });

      const existingDbPhones = new Set(existingInDb.map(c => c.phone));
      const existingDbEmails = new Set(existingInDb.map(c => c.email).filter(Boolean));

      // Filter chunk to only candidates not in database
      const candidatesToInsert = [];
      for (const item of processedChunk) {
        if (existingDbPhones.has(item.phoneStr) || (item.email && existingDbEmails.has(item.email))) {
          skipped++;
          continue;
        }
        candidatesToInsert.push(item);
        importedPhones.add(item.phoneStr);
        if (item.email) importedEmails.add(item.email);
      }

      // Process insertions in parallel sub-batches to be fast without exhausting connections
      const subChunkSize = 30;
      for (let j = 0; j < candidatesToInsert.length; j += subChunkSize) {
        const subChunk = candidatesToInsert.slice(j, j + subChunkSize);

        await Promise.all(subChunk.map(async (item) => {
          const { data, phoneStr, email } = item;
          try {
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

            if (clientId && stageId) {
              await prisma.candidatePipeline.create({
                data: {
                  candidate_id: newCandidate.id,
                  client_id: clientId,
                  stage_id: stageId,
                },
              });
            }

            count++;
          } catch (err) {
            console.error('Error importing candidate:', err);
            skipped++;
          }
        }));
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
        _count: { select: { pipelines: true } },
      },
    });

    const clientsWithCounts = [];
    for (const client of clients) {
      const [candidatesCount, hiresCount] = await Promise.all([
        prisma.cRMCandidate.count({
          where: {
            client_id: client.id,
            isDeleted: false
          }
        }),
        prisma.cRMCandidate.count({
          where: {
            client_id: client.id,
            status: "Joined",
            isDeleted: false
          }
        })
      ]);
      clientsWithCounts.push({
        ...client,
        _count: {
          ...client._count,
          candidates: candidatesCount,
          hires: hiresCount
        }
      });
    }

    res.json({ success: true, data: clientsWithCounts });
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

    const normalizeEducation = (edu) => {
      if (!edu) return "Others";
      const clean = edu.trim();
      const lower = clean.toLowerCase().replace(/[\.\s]/g, "");
      
      if (lower === "10th" || lower === "matric" || lower === "matriculation" || lower === "ssc" || lower === "secondary") {
        return "10th";
      }
      if (lower === "12th" || lower === "hsc" || lower === "intermediate" || lower === "highersecondary") {
        return "12th";
      }
      if (lower === "iti") {
        return "ITI";
      }
      if (lower === "diploma" || lower === "polytechnic" || lower === "polytechnicdiploma") {
        return "Diploma";
      }
      if (
        lower === "graduate" || 
        lower === "graduation" || 
        lower === "gradute" || 
        lower === "ba" || 
        lower === "bsc" || 
        lower === "bcom" || 
        lower === "btech" || 
        lower === "bba" || 
        lower === "bca"
      ) {
        return "Graduation";
      }
      if (
        lower === "postgraduation" || 
        lower === "postgraduate" || 
        lower === "ma" || 
        lower === "msc" || 
        lower === "mcom" || 
        lower === "mtech" || 
        lower === "mba" || 
        lower === "mca" || 
        lower === "pg"
      ) {
        return "Post Graduation";
      }
      return clean;
    };

    const educationOrder = [
      "10th",
      "12th",
      "ITI",
      "Diploma",
      "Graduation",
      "Post Graduation",
      "Others"
    ];

    const eduMap = {};
    educationStats.forEach(s => {
      const norm = normalizeEducation(s.education);
      eduMap[norm] = (eduMap[norm] || 0) + s._count.education;
    });

    const formattedEducation = [];
    educationOrder.forEach(name => {
      if (eduMap[name] !== undefined) {
        formattedEducation.push({ name, count: eduMap[name] });
        delete eduMap[name];
      }
    });
    Object.keys(eduMap).forEach(name => {
      formattedEducation.push({ name, count: eduMap[name] });
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
      where: { ...where, status: 'Joined' }
    });

    const conversionRate = candidates > 0 ? Math.round((joinedCandidates / candidates) * 100) : 0;

    // Calculate weekly trends (last 7 days from the latest candidate's date or today)
    let referenceDate = new Date();
    const maxCandidate = await prisma.cRMCandidate.findFirst({
      where,
      orderBy: { createdAt: "desc" }
    });
    if (maxCandidate) {
      referenceDate = new Date(maxCandidate.createdAt);
    }

    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const last7Days = [];
    const weeklyDataMap = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - i);
      const dayName = daysOfWeek[d.getDay()];
      const dateString = d.toDateString();
      last7Days.push({ key: dateString, day: dayName });
      weeklyDataMap[dateString] = { day: dayName, applications: 0, hires: 0 };
    }

    const sevenDaysAgo = new Date(referenceDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const candidatesLast7Days = await prisma.cRMCandidate.findMany({
      where: {
        ...where,
        createdAt: { 
          gte: sevenDaysAgo,
          lte: new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      select: { createdAt: true, status: true }
    });

    candidatesLast7Days.forEach(c => {
      const dateStr = new Date(c.createdAt).toDateString();
      if (weeklyDataMap[dateStr]) {
        weeklyDataMap[dateStr].applications += 1;
        if (c.status === "Joined") {
          weeklyDataMap[dateStr].hires += 1;
        }
      }
    });

    const weeklyTrend = last7Days.map(item => weeklyDataMap[item.key]);

    const recentActivities = await prisma.auditLog.findMany({
      where: { 
        companyId: req.companyId,
        NOT: {
          action: {
            in: ["TEAM_MEMBER_CREATED", "TEAM_MEMBER_UPDATED"]
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    res.json({
      success: true,
      data: {
        totalCandidates: candidates,
        totalClients: clients,
        totalJobs: jobs,
        joinedCandidates,
        conversionRate,
        pipelineStats,
        weeklyTrend,
        recentActivities,
        education: formattedEducation,
        states: stateStats.map(s => ({ name: s.state || 'Unknown', count: s._count.state })),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCandidateRegistrationTrend = async (req, res) => {
  try {
    const { view = "weekly" } = req.query;
    const clientIds = await getAllocatedClientIds(req);
    const where = { isDeleted: false };
    if (clientIds !== null) {
      where.client_id = { in: clientIds };
    }

    const now = new Date();
    let trendData = [];

    if (view === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: {
            gte: todayStart,
            lte: todayEnd
          }
        },
        select: { createdAt: true }
      });

      const hourlyBlocks = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
      const hourlyMap = {};
      hourlyBlocks.forEach(b => hourlyMap[b] = 0);

      candidates.forEach(c => {
        const hour = new Date(c.createdAt).getHours();
        const blockHour = Math.floor(hour / 2) * 2;
        const blockStr = `${blockHour.toString().padStart(2, "0")}:00`;
        if (hourlyMap[blockStr] !== undefined) {
          hourlyMap[blockStr]++;
        }
      });

      trendData = hourlyBlocks.map(b => ({
        label: b,
        count: hourlyMap[b]
      }));

    } else if (view === "custom") {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: "startDate and endDate are required for custom view" });
      }
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: {
            gte: start,
            lte: end
          }
        },
        select: { createdAt: true }
      });

      if (diffDays <= 1) {
        const hourlyBlocks = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];
        const hourlyMap = {};
        hourlyBlocks.forEach(b => hourlyMap[b] = 0);

        candidates.forEach(c => {
          const hour = new Date(c.createdAt).getHours();
          const blockHour = Math.floor(hour / 2) * 2;
          const blockStr = `${blockHour.toString().padStart(2, "0")}:00`;
          if (hourlyMap[blockStr] !== undefined) {
            hourlyMap[blockStr]++;
          }
        });

        trendData = hourlyBlocks.map(b => ({
          label: b,
          count: hourlyMap[b]
        }));
      } else {
        const dailyMap = {};
        const dates = [];
        
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateString = d.toDateString();
          const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          dates.push({ key: dateString, label });
          dailyMap[dateString] = 0;
        }

        candidates.forEach(c => {
          const dateStr = new Date(c.createdAt).toDateString();
          if (dailyMap[dateStr] !== undefined) {
            dailyMap[dateStr]++;
          }
        });

        trendData = dates.map(d => ({
          label: d.label,
          count: dailyMap[d.key]
        }));
      }

    } else if (view === "weekly") {
      // Last 7 days
      const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dailyMap = {};
      const dates = [];
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateString = d.toDateString();
        const dayLabel = daysOfWeek[d.getDay()];
        dates.push({ key: dateString, label: dayLabel });
        dailyMap[dateString] = 0;
      }

      const since = new Date(now);
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);

      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: { gte: since }
        },
        select: { createdAt: true }
      });

      candidates.forEach(c => {
        const dateStr = new Date(c.createdAt).toDateString();
        if (dailyMap[dateStr] !== undefined) {
          dailyMap[dateStr]++;
        }
      });

      trendData = dates.map(d => ({
        label: d.label,
        count: dailyMap[d.key]
      }));

    } else if (view === "monthly") {
      // Last 4 weeks (30 days)
      const weeklyMap = { "Week 4": 0, "Week 3": 0, "Week 2": 0, "Week 1": 0 };
      
      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
        },
        select: { createdAt: true }
      });

      candidates.forEach(c => {
        const diffMs = now.getTime() - new Date(c.createdAt).getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        if (diffDays < 7) {
          weeklyMap["Week 1"]++;
        } else if (diffDays < 14) {
          weeklyMap["Week 2"]++;
        } else if (diffDays < 21) {
          weeklyMap["Week 3"]++;
        } else if (diffDays < 30) {
          weeklyMap["Week 4"]++;
        }
      });

      trendData = [
        { label: "Week 4", count: weeklyMap["Week 4"] },
        { label: "Week 3", count: weeklyMap["Week 3"] },
        { label: "Week 2", count: weeklyMap["Week 2"] },
        { label: "Week 1", count: weeklyMap["Week 1"] }
      ];

    } else if (view === "quarterly") {
      // Last 3 months (quarterly)
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyMap = {};
      const labels = [];

      for (let i = 2; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
        labels.push({ key, label });
        monthlyMap[key] = 0;
      }

      const since = new Date(now);
      since.setMonth(since.getMonth() - 2);
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: { gte: since }
        },
        select: { createdAt: true }
      });

      candidates.forEach(c => {
        const dateObj = new Date(c.createdAt);
        const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
        if (monthlyMap[key] !== undefined) {
          monthlyMap[key]++;
        }
      });

      trendData = labels.map(l => ({
        label: l.label,
        count: monthlyMap[l.key]
      }));

    } else if (view === "yearly") {
      // Last 12 months
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyMap = {};
      const labels = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
        labels.push({ key, label });
        monthlyMap[key] = 0;
      }

      const since = new Date(now);
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const candidates = await prisma.cRMCandidate.findMany({
        where: {
          ...where,
          createdAt: { gte: since }
        },
        select: { createdAt: true }
      });

      candidates.forEach(c => {
        const dateObj = new Date(c.createdAt);
        const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
        if (monthlyMap[key] !== undefined) {
          monthlyMap[key]++;
        }
      });

      trendData = labels.map(l => ({
        label: l.label,
        count: monthlyMap[l.key]
      }));
    }

    res.json({
      success: true,
      data: trendData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
