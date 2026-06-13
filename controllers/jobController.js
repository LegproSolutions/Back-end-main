import prisma from "../config/prisma.js";

// Get All Jobs with Pagination
export const getJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 9,
      title,
      location,
      category,
      salaryMin,
      salaryMax,
      experience,
      states,
      qualification,
      accommodationAvailable,
      pgAvailable,
      roomSupport,
      uniformProvided,
      safetyShoesProvided,
      safetyKitProvided,
      experienceOption,
      jobType,
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 31);

    const andConditions = [
      { visible: true },
      { isVerified: true },
      { deadline: { gte: cutoffDate } }
    ];

    if (title && title !== "") {
      // Check if title matches a Job ID pattern (e.g., "0028", "28", "#0028")
      const jobIdMatch = title.trim().match(/^#?(\d+)$/);
      if (jobIdMatch) {
        const searchedJobId = parseInt(jobIdMatch[1]);
        andConditions.push({
          OR: [
            { title: { contains: title, mode: 'insensitive' } },
            { jobId: searchedJobId }
          ]
        });
      } else {
        andConditions.push({ title: { contains: title, mode: 'insensitive' } });
      }
    }

    if (location && location !== "") {
      andConditions.push({
        OR: [
          { location: { contains: location, mode: 'insensitive' } },
          { companyDetails: { path: ['state'], equals: location } },
          { companyDetails: { path: ['city'], equals: location } },
        ]
      });
    }

    if (category && category !== "") {
      andConditions.push({ category });
    }

    if (states && (Array.isArray(states) || typeof states === "string")) {
      const stateList = Array.isArray(states) ? states : [states];
      const stateConditions = [];
      
      stateList.forEach(st => {
        stateConditions.push({
          location: { contains: st, mode: 'insensitive' }
        });
        stateConditions.push({
          companyDetails: {
            path: ['state'],
            equals: st
          }
        });
        stateConditions.push({
          companyDetails: {
            path: ['state'],
            equals: st.toLowerCase()
          }
        });
        stateConditions.push({
          companyDetails: {
            path: ['state'],
            equals: st.toUpperCase()
          }
        });

        // Add special handling for Uttar Pradesh abbreviations (UP, up)
        if (st === "Uttar Pradesh") {
          stateConditions.push({
            location: { contains: "UP", mode: 'insensitive' }
          });
          stateConditions.push({
            companyDetails: {
              path: ['state'],
              equals: "UP"
            }
          });
          stateConditions.push({
            companyDetails: {
              path: ['state'],
              equals: "up"
            }
          });
        }
      });

      andConditions.push({ OR: stateConditions });
    }

    if (salaryMin || salaryMax) {
      const salaryCond = {};
      if (salaryMin) salaryCond.gte = parseInt(salaryMin);
      if (salaryMax) salaryCond.lte = parseInt(salaryMax);
      andConditions.push({ salary: salaryCond });
    }

    if (experience && experience !== "") {
      andConditions.push({ experience: { gte: parseInt(experience) } });
    }

    if (qualification && qualification !== "") {
      andConditions.push({ qualification: { contains: qualification, mode: 'insensitive' } });
    }

    if (experienceOption && experienceOption !== "") {
      andConditions.push({ experienceOption: { equals: experienceOption } });
    }

    if (jobType && jobType !== "") {
      andConditions.push({ jobType: { equals: jobType } });
    }

    if (accommodationAvailable === "true") {
      andConditions.push({
        benefits: {
          path: ['accommodation'],
          array_contains: 'Company Accommodation'
        }
      });
    }
    if (pgAvailable === "true") {
      andConditions.push({
        benefits: {
          path: ['accommodation'],
          array_contains: 'PG Facility'
        }
      });
    }
    if (roomSupport === "true") {
      andConditions.push({
        benefits: {
          path: ['accommodation'],
          array_contains: 'Company Support to Find Room (Paid by Candidate)'
        }
      });
    }
    if (uniformProvided === "true") {
      andConditions.push({
        benefits: {
          path: ['uniform'],
          array_contains: 'Company Uniform'
        }
      });
    }
    if (safetyShoesProvided === "true") {
      andConditions.push({
        benefits: {
          path: ['uniform'],
          array_contains: 'Safety Shoes'
        }
      });
    }
    if (safetyKitProvided === "true") {
      andConditions.push({
        benefits: {
          path: ['uniform'],
          array_contains: 'Safety Kit'
        }
      });
    }

    const where = { AND: andConditions };

    const [jobs, totalJobs] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              image: true,
              isVerified: true,
              havePremiumAccess: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.job.count({ where }),
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalJobs / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    const normalizedJobs = jobs.map(job => ({
      ...job,
      _id: job.id,
      companyId: job.company ? { ...job.company, _id: job.company.id } : null
    }));

    const result = {
      jobs: normalizedJobs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalJobs,
        hasNextPage,
        hasPrevPage,
        limit: limitNum,
      },
    };

    return res.json({ success: true, ...result });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Get Single Job Using JobID
export const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    let job;
    if (/^\d+$/.test(id)) {
      job = await prisma.job.findUnique({
        where: { jobId: parseInt(id) },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              image: true,
              isVerified: true,
              havePremiumAccess: true
            }
          }
        }
      });
    } else {
      job = await prisma.job.findUnique({
        where: { id },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              image: true,
              isVerified: true,
              havePremiumAccess: true
            }
          }
        }
      });
    }

    if (!job) {
      return res.json({
        success: false,
        message: "Job not found",
      });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 31);
    if (new Date(job.deadline) < cutoffDate) {
      return res.json({
        success: false,
        message: "Job not found",
      });
    }

    const normalizedJob = {
      ...job,
      _id: job.id,
      companyId: job.company ? { ...job.company, _id: job.company.id } : null
    };

    res.json({
      success: true,
      job: normalizedJob,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get companies with their jobs
export const getCompaniesWithJobs = async (req, res) => {
  try {
    const companiesWithJobs = await prisma.company.findMany({
      include: {
        jobs: true
      }
    });

    res.json({
      success: true,
      jobs: companiesWithJobs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching companies and jobs",
      error: error.message,
    });
  }
};

