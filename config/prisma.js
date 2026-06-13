import { PrismaClient } from "@prisma/client";

const prismaClient = new PrismaClient();

// ==========================================
// TWO-WAY SYNCHRONIZATION HELPERS (BYPASS HOOKS)
// ==========================================

async function syncUserToCrm(userId) {
  try {
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
    if (!user) return;

    const name = user.name;
    const email = user.email;
    const phone = user.phone || `temp_${user.id.substring(0, 8)}`;
    const resume_url = user.resume;
    const dob = user.profile?.dateOfBirth ? new Date(user.profile.dateOfBirth).toISOString().split('T')[0] : null;
    const gender = user.profile?.gender;

    let education = null;
    let trades = null;
    if (user.profile?.education) {
      if (typeof user.profile.education === 'string') {
        education = user.profile.education;
      } else if (typeof user.profile.education === 'object') {
        let eduList = [];
        if (Array.isArray(user.profile.education)) {
          eduList = user.profile.education;
        } else {
          eduList = Object.values(user.profile.education);
        }
        const getRank = (qual) => {
          const q = (qual || "").toLowerCase().trim();
          if (!q) return 0;
          if (q.includes("m.tech") || q.includes("mba") || q.includes("m.sc") || q.includes("m.com") || q.includes("ma") || q.includes("master") || q.includes("post graduate") || q.includes("post graduation") || q.includes("pg")) return 5;
          if (q.includes("b.tech") || q.includes("be") || q.includes("b.sc") || q.includes("b.com") || q.includes("ba") || q.includes("bca") || q.includes("bba") || q.includes("graduate") || q.includes("graduation")) return 4;
          if (q.includes("diploma") || q.includes("iti") || q.includes("polytechnic")) return 3;
          if (q.includes("12th") || q.includes("intermediate") || q.includes("inter") || q.includes("hsc") || q.includes("xii")) return 2;
          if (q.includes("10th") || q.includes("matriculation") || q.includes("matric") || q.includes("ssc") || q.includes("high school") || q.includes("x")) return 1;
          return 0;
        };
        if (eduList.length > 0) {
          const sorted = [...eduList].sort((a, b) => getRank(b.qualification || b.instituteType) - getRank(a.qualification || a.instituteType));
          const highest = sorted[0];
          education = highest.qualification || highest.instituteType || null;
          const fields = highest.instituteFields || {};
          trades = highest.specialization || highest.trade || highest.stream || fields.specialization || fields.trade || fields.stream || null;
        }
      }
    }

    const addr = user.profile?.address || {};
    const state = addr.state || null;
    const district = addr.district || null;
    const city = addr.city || null;

    let crmCandidate = await prismaClient.cRMCandidate.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { phone },
          ...(email ? [{ email }] : [])
        ]
      }
    });

    if (crmCandidate) {
      if (
        crmCandidate.name !== name ||
        crmCandidate.email !== email ||
        crmCandidate.phone !== phone ||
        crmCandidate.resume_url !== resume_url ||
        crmCandidate.dob !== dob ||
        crmCandidate.gender !== gender ||
        crmCandidate.education !== education ||
        crmCandidate.trades !== trades ||
        crmCandidate.state !== state ||
        crmCandidate.district !== district ||
        crmCandidate.city !== city ||
        crmCandidate.userId !== user.id
      ) {
        await prismaClient.cRMCandidate.update({
          where: { id: crmCandidate.id },
          data: { name, email, phone, resume_url, dob, gender, education, trades, state, district, city, userId: user.id }
        });
      }
    } else {
      await prismaClient.cRMCandidate.create({
        data: { name, email, phone, resume_url, dob, gender, education, trades, state, district, city, userId: user.id, status: "Applied", source: "Portal" }
      });
    }
  } catch (error) {
    console.error("syncUserToCrm Error:", error);
  }
}

async function syncCrmToUser(crmCandidateId) {
  try {
    const crm = await prismaClient.cRMCandidate.findUnique({
      where: { id: crmCandidateId }
    });
    if (!crm) return;

    const name = crm.name;
    const email = crm.email || `${crm.phone}@jobmela.com`;
    const phone = crm.phone;
    const resume = crm.resume_url;
    const dateOfBirth = crm.dob ? new Date(crm.dob) : null;
    const gender = crm.gender;
    const education = crm.education;
    const state = crm.state;
    const district = crm.district;
    const city = crm.city;

    let user = await prismaClient.user.findFirst({
      where: {
        OR: [
          ...(crm.userId ? [{ id: crm.userId }] : []),
          { phone },
          ...(crm.email ? [{ email: crm.email }] : [])
        ]
      },
      include: { profile: true }
    });

    let targetUserId = crm.userId;

    if (user) {
      targetUserId = user.id;
      if (user.name !== name || user.email !== email || user.phone !== phone || user.resume !== resume) {
        await prismaClient.user.update({
          where: { id: user.id },
          data: { name, email, phone, resume }
        });
      }

      if (user.profile) {
        const addr = typeof user.profile.address === 'object' ? user.profile.address : {};
        if (
          user.profile.gender !== gender ||
          user.profile.education !== education ||
          user.profile.dateOfBirth?.toISOString().split('T')[0] !== crm.dob ||
          addr.state !== state ||
          addr.district !== district ||
          addr.city !== city
        ) {
          const newAddr = { ...addr, state, district, city };
          await prismaClient.userProfile.update({
            where: { id: user.profile.id },
            data: { gender, education, dateOfBirth, address: newAddr }
          });
        }
      } else {
        await prismaClient.userProfile.create({
          data: {
            userId: user.id,
            email,
            firstName: name.split(' ')[0],
            lastName: name.split(' ').slice(1).join(' ') || "",
            phone,
            gender,
            education,
            dateOfBirth,
            address: { state, district, city }
          }
        });
      }
    } else {
      const newUser = await prismaClient.user.create({
        data: {
          name,
          email,
          phone,
          resume,
          password: "$2b$10$tVmJfruNVV3M9IgRhDEJB.Nb7jvNQDBzsX6WycAZEsibUyBCHn4CO"
        }
      });
      targetUserId = newUser.id;

      await prismaClient.userProfile.create({
        data: {
          userId: newUser.id,
          email,
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' ') || "",
          phone,
          gender,
          education,
          dateOfBirth,
          address: { state, district, city }
        }
      });
    }

    if (crm.userId !== targetUserId) {
      await prismaClient.cRMCandidate.update({
        where: { id: crm.id },
        data: { userId: targetUserId }
      });
    }
  } catch (error) {
    console.error("syncCrmToUser Error:", error);
  }
}

async function syncJobToCrm(jobId) {
  try {
    const job = await prismaClient.job.findUnique({
      where: { id: jobId }
    });
    if (!job) return;

    const title = job.title;
    const location = job.location;
    const minSalary = job.salary ? String(job.salary) : null;
    const maxSalary = job.salary ? String(job.salary) : null;
    const openPositions = job.openings;
    const status = job.visible ? "open" : "closed";
    const requirements = job.description;
    const education = job.qualification;

    let client = await prismaClient.client.findFirst({
      where: { companyId: job.companyId }
    });

    if (!client) {
      const company = await prismaClient.company.findUnique({
        where: { id: job.companyId }
      });
      client = await prismaClient.client.create({
        data: {
          company_name: company?.name || "Company",
          industry: job.category || "General",
          contact_person: "HR Manager",
          email: company?.email,
          phone: company?.phone,
          companyId: job.companyId
        }
      });
    }

    let crmJob = await prismaClient.cRMJob.findFirst({
      where: { jobId }
    });

    if (crmJob) {
      if (
        crmJob.title !== title ||
        crmJob.location !== location ||
        crmJob.minSalary !== minSalary ||
        crmJob.maxSalary !== maxSalary ||
        crmJob.openPositions !== openPositions ||
        crmJob.status !== status ||
        crmJob.requirements !== requirements ||
        crmJob.education !== education ||
        crmJob.client_id !== client.id
      ) {
        await prismaClient.cRMJob.update({
          where: { id: crmJob.id },
          data: { title, location, minSalary, maxSalary, openPositions, status, requirements, education, client_id: client.id }
        });
      }
    } else {
      await prismaClient.cRMJob.create({
        data: { title, location, minSalary, maxSalary, openPositions, status, requirements, education, client_id: client.id, jobId }
      });
    }
  } catch (error) {
    console.error("syncJobToCrm Error:", error);
  }
}

async function syncCrmToJob(crmJobId) {
  try {
    const crmJob = await prismaClient.cRMJob.findUnique({
      where: { id: crmJobId },
      include: { client: true }
    });
    if (!crmJob || !crmJob.jobId) return;

    const job = await prismaClient.job.findUnique({
      where: { id: crmJob.jobId }
    });
    if (!job) return;

    const title = crmJob.title;
    const location = crmJob.location || "General";
    const salary = crmJob.minSalary ? Number(crmJob.minSalary) || 0 : 0;
    const openings = crmJob.openPositions;
    const visible = crmJob.status === "open";
    const status = crmJob.status === "open" ? "Active" : "Closed";
    const description = crmJob.requirements || "";
    const qualification = crmJob.education || "";

    if (
      job.title !== title ||
      job.location !== location ||
      job.salary !== salary ||
      job.openings !== openings ||
      job.visible !== visible ||
      job.status !== status ||
      job.description !== description ||
      job.qualification !== qualification
    ) {
      await prismaClient.job.update({
        where: { id: job.id },
        data: { title, location, salary, openings, visible, status, description, qualification }
      });
    }
  } catch (error) {
    console.error("syncCrmToJob Error:", error);
  }
}

async function syncApplicationToCrm(jobApplicationId) {
  try {
    const app = await prismaClient.jobApplication.findUnique({
      where: { id: jobApplicationId },
      include: { job: true, user: true }
    });
    if (!app) return;

    await syncUserToCrm(app.userId);
    const candidate = await prismaClient.cRMCandidate.findFirst({
      where: { userId: app.userId }
    });

    await syncJobToCrm(app.jobId);
    const crmJob = await prismaClient.cRMJob.findFirst({
      where: { jobId: app.jobId }
    });

    if (!candidate || !crmJob) return;

    const stageName = app.status;
    let stage = await prismaClient.pipelineStage.findUnique({
      where: { stage_name: stageName }
    });
    if (!stage) {
      stage = await prismaClient.pipelineStage.create({
        data: { stage_name: stageName }
      });
    }

    let pipeline = await prismaClient.candidatePipeline.findFirst({
      where: { candidate_id: candidate.id, client_id: crmJob.client_id }
    });

    if (pipeline) {
      if (pipeline.stage_id !== stage.id) {
        await prismaClient.candidatePipeline.update({
          where: { id: pipeline.id },
          data: { stage_id: stage.id }
        });
      }
    } else {
      await prismaClient.candidatePipeline.create({
        data: { candidate_id: candidate.id, client_id: crmJob.client_id, stage_id: stage.id }
      });
    }

    if (candidate.status !== stageName) {
      await prismaClient.cRMCandidate.update({
        where: { id: candidate.id },
        data: { status: stageName }
      });
    }
  } catch (error) {
    console.error("syncApplicationToCrm Error:", error);
  }
}

async function syncCrmPipelineToApplication(pipelineId) {
  try {
    const pipeline = await prismaClient.candidatePipeline.findUnique({
      where: { id: pipelineId },
      include: { stage: true, candidate: true, client: true }
    });
    if (!pipeline || !pipeline.candidate.userId) return;

    const stageName = pipeline.stage.stage_name;

    const applications = await prismaClient.jobApplication.findMany({
      where: {
        userId: pipeline.candidate.userId,
        job: { companyId: pipeline.client.companyId }
      }
    });

    for (const app of applications) {
      if (app.status !== stageName) {
        await prismaClient.jobApplication.update({
          where: { id: app.id },
          data: { status: stageName }
        });
      }
    }
  } catch (error) {
    console.error("syncCrmPipelineToApplication Error:", error);
  }
}

// ==========================================
// PRISMA CLIENT EXTENSIONS & HOOKS
// ==========================================

const prisma = prismaClient.$extends({
  result: {
    user: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    admin: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    company: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    job: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    jobApplication: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    userProfile: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
    candidate: {
      _id: { needs: { id: true }, compute(model) { return model.id; } },
    },
  },
  query: {
    user: {
      async create({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.id);
        return result;
      }
    },
    userProfile: {
      async create({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.userId);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.userId);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncUserToCrm(result.userId);
        return result;
      }
    },
    cRMCandidate: {
      async create({ args, query }) {
        const result = await query(args);
        await syncCrmToUser(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncCrmToUser(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncCrmToUser(result.id);
        return result;
      }
    },
    job: {
      async create({ args, query }) {
        const result = await query(args);
        await syncJobToCrm(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncJobToCrm(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncJobToCrm(result.id);
        return result;
      }
    },
    cRMJob: {
      async create({ args, query }) {
        const result = await query(args);
        await syncCrmToJob(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncCrmToJob(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncCrmToJob(result.id);
        return result;
      }
    },
    jobApplication: {
      async create({ args, query }) {
        const result = await query(args);
        await syncApplicationToCrm(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncApplicationToCrm(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncApplicationToCrm(result.id);
        return result;
      }
    },
    candidatePipeline: {
      async create({ args, query }) {
        const result = await query(args);
        await syncCrmPipelineToApplication(result.id);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await syncCrmPipelineToApplication(result.id);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await syncCrmPipelineToApplication(result.id);
        return result;
      }
    }
  }
});

export default prisma;
