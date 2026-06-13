import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from 'cloudinary';
import { getAllocatedClientIds } from "../middleware/crmPermissionMiddleware.js";

// Direct admin credentials constant
const DIRECT_ADMIN = {
  name: "Admin Abhisek",
  email: "AdminAbhisek@JobMela.com",
  password: "Pass1125@"
};

// Function to add the direct admin
export const addDirectAdmin = async () => {
  try {
    const existingAdmin = await prisma.admin.findUnique({ where: { email: DIRECT_ADMIN.email } });
    if (existingAdmin) {
      return { success: false, message: "Admin already exists" };
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(DIRECT_ADMIN.password, salt);

    const admin = await prisma.admin.create({
      data: {
        name: DIRECT_ADMIN.name,
        email: DIRECT_ADMIN.email,
        password: hashPassword,
      },
    });

    return { success: true, message: "Direct admin created successfully", admin };
  } catch (error) {
    console.error("Error creating direct admin:", error);
    return { success: false, message: error.message };
  }
};

// Register an admin
export const registerAdmin = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "Missing Details" });
  }

  try {
    const AdminExists = await prisma.admin.findUnique({ where: { email } });
    if (AdminExists) {
      return res.json({
        success: false,
        message: "Admin already registered",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const admin = await prisma.admin.create({
      data: {
        name,
        email,
        password: hashPassword,
      },
    });

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
      message: "Admin registered successfully",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const loginAdmin = async (req, res) => {
  const { email, password, passKey } = req.body;
  try {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid email or password" });
    }
    
    if (passKey !== "NAVGAP2025BJ") {
      return res.json({ success: false, message: "Access Denied !!" });
    }

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
      message: "Admin Login successful",
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Logout Admin
export const logoutAdmin = async (req, res) => {
  try {
    res.clearCookie("admin_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.json({
      success: true,
      message: "Admin Logout successful",
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get admin data
export const getAdminData = async (req, res) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
    });
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });
    }
    const { password, ...adminWithoutPassword } = admin;
    res.json({ success: true, admin: adminWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// AllUser 
export const allUser = async (req, res) => {
  try {
    const [userProfiles, crmCandidates] = await Promise.all([
      prisma.userProfile.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      }),
      prisma.cRMCandidate.findMany({
        where: { isDeleted: false }
      })
    ]);

    // Normalize UserProfiles
    const normalizedUsers = userProfiles.map(u => ({
      id: u.userId,
      _id: u.userId,
      name: u.user?.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "N/A",
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      createdAt: u.createdAt,
      type: "Portal User",
      source: "Portal",
      ...u // include other fields for detail view
    }));

    // Normalize CRMCandidates
    const normalizedCandidates = crmCandidates.map(c => ({
      id: c.id,
      _id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
      type: "CRM Candidate",
      source: c.source || "CRM",
      education: c.education,
      experience: c.experience,
      state: c.state,
      district: c.district
    }));

    // Filter out CRM Candidates that are already in the Portal User list (prevent duplicates)
    const portalUserPhones = new Set(normalizedUsers.map(u => u.phone).filter(Boolean));
    const uniqueCrmCandidates = normalizedCandidates.filter(c => !portalUserPhones.has(c.phone));

    // Combine and sort by date
    const allUsers = [...normalizedUsers, ...uniqueCrmCandidates].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.status(200).json({ success: true, users: allUsers });
  } catch (error) {
    console.error("Error in allUser:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

//Get User Profile  
export const getUserProfileById = async (req, res) => {
  try {
    const userId = req.params.userId;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create Job Post by Admin
export const createJobByAdmin = async (req, res) => {
  try {
    const body = req.body || {};
    const file = req.file;

    const title = body.title;
    const description = body.description || body.jobDescription;
    const location = body.location;
    const category = body.category;
    const deadline = body.deadline;
    const level = body.level;
    const experience = parseInt(body.experience || 0);
    const salary = parseInt(body.salary || 0);
    const openings = parseInt(body.openings || 1);
    const employmentType = body.employmentType;
    const qualification = body.qualification;
    const requirements = body.requirements ? (Array.isArray(body.requirements) ? body.requirements : [body.requirements]) : [];

    // Company details
    const companyId = body.companyId;
    const companyName = body.companyName;
    const shortDescription = body.companyDescription || body.shortDescription;
    const city = body.companyCity || body.city;
    const state = body.companyState || body.state;
    const country = body.companyCountry || body.country;
    const hrName = body.hrName;
    const hrEmail = body.hrEmail || body.companyEmail;
    const hrPhone = body.hrPhone || body.companyPhone;
    const companyEmail = body.companyEmail;
    const companyPhone = body.companyPhone;
    const companyPassword = body.companyPassword;

    let finalCompanyId;
    let finalCompanyDetails;

    if (companyId) {
      const existingCompany = await prisma.company.findUnique({ where: { id: companyId } });
      if (!existingCompany) {
        return res.status(404).json({
          success: false,
          message: "Selected company not found"
        });
      }
      finalCompanyId = companyId;
      finalCompanyDetails = {
        name: existingCompany.name,
        shortDescription: shortDescription || `${existingCompany.name} is a leading company`,
        city,
        state,
        country,
        hrName: hrName || existingCompany.name,
        hrEmail: hrEmail || existingCompany.email,
        hrPhone: hrPhone || existingCompany.phone
      };
    } else {
      let existingCompany = await prisma.company.findFirst({
        where: {
          name: { equals: companyName, mode: 'insensitive' },
          email: { equals: companyEmail, mode: 'insensitive' }
        }
      });

      if (existingCompany) {
        // Update existing company with missing details if provided
        existingCompany = await prisma.company.update({
          where: { id: existingCompany.id },
          data: {
            description: shortDescription || existingCompany.description,
            city: city || existingCompany.city,
            state: state || existingCompany.state,
            country: country || existingCompany.country,
            website: body.companyWebsite || existingCompany.website,
          }
        });

        finalCompanyId = existingCompany.id;
        finalCompanyDetails = {
          name: existingCompany.name,
          shortDescription: shortDescription || existingCompany.description || `${existingCompany.name} is a leading company`,
          city: city || existingCompany.city || "",
          state: state || existingCompany.state || "",
          country: country || existingCompany.country || "",
          hrName: hrName || existingCompany.name,
          hrEmail: hrEmail || existingCompany.email,
          hrPhone: hrPhone || existingCompany.phone
        };
      } else {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(companyPassword || 'DefaultPass123!', salt);

        let imageUrl = 'https://cdn.iconscout.com/icon/premium/png-256-thumb/building-icon-svg-download-png-1208046.png?f=webp&w=128';
        if (file && file.buffer) {
          try {
            const uploadResult = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream({ folder: 'companies', resource_type: 'image' }, (err, result) => {
                if (err) return reject(err);
                resolve(result);
              });
              stream.end(file.buffer);
            });
            imageUrl = uploadResult?.secure_url || imageUrl;
          } catch (cloudinaryError) {
            console.error("Cloudinary upload failed, using default image:", cloudinaryError.message);
          }
        }

        const newCompany = await prisma.company.create({
          data: {
            name: companyName,
            email: companyEmail,
            phone: companyPhone,
            image: imageUrl,
            password: hashedPassword,
            description: shortDescription,
            city: city,
            state: state,
            country: country,
            website: body.companyWebsite,
            isVerified: true
          }
        });

        finalCompanyId = newCompany.id;
        finalCompanyDetails = {
          name: companyName,
          shortDescription: shortDescription || `${companyName} is a leading company`,
          city,
          state,
          country,
          hrName: hrName || companyName,
          hrEmail: hrEmail || companyEmail,
          hrPhone: hrPhone || companyPhone
        };
      }
    }

    // --- SYNC TO CRM CLIENT (Partner Directory) ---
    try {
      const clientName = finalCompanyDetails.name?.trim();
      const clientEmail = (finalCompanyDetails.hrEmail || finalCompanyDetails.email)?.trim();
      const clientPhone = (finalCompanyDetails.hrPhone || finalCompanyDetails.phone)?.trim();
      const clientLocation = [finalCompanyDetails.city, finalCompanyDetails.state].filter(Boolean).join(", ") || finalCompanyDetails.country;
      const clientIndustry = category || "Other";
      const contactPerson = (finalCompanyDetails.hrName || clientName)?.trim();

      // Check if client already exists in CRM
      let existingClient = await prisma.client.findFirst({
        where: {
          OR: [
            { company_name: { equals: clientName, mode: 'insensitive' } },
            { email: { equals: clientEmail, mode: 'insensitive' } }
          ]
        }
      });

      if (existingClient) {
        await prisma.client.update({
          where: { id: existingClient.id },
          data: {
            companyId: finalCompanyId,
            company_name: clientName,
            email: clientEmail,
            phone: clientPhone,
            location: clientLocation,
            industry: clientIndustry,
            contact_person: contactPerson,
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.client.create({
          data: {
            companyId: finalCompanyId,
            company_name: clientName,
            email: clientEmail,
            phone: clientPhone,
            location: clientLocation,
            industry: clientIndustry,
            contact_person: contactPerson,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }
    } catch (crmError) {
      console.error("Failed to sync company to CRM Client:", crmError.message);
      // Non-blocking error: don't fail job creation if CRM sync fails
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,
        category,
        deadline: new Date(deadline),
        level,
        experience,
        salary,
        openings,
        date: new Date(),
        requirements: requirements,
        employmentType,
        qualification,
        companyId: finalCompanyId,
        companyDetails: finalCompanyDetails,
        createdBy: req.admin?.id,
        visible: false,
        isVerified: false,
        status: "Pending Admin Verification",
        isViewApplicant: false
      },
      include: {
        company: {
          select: { name: true, email: true, phone: true, image: true, isVerified: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: "Job created successfully by admin",
      job
    });

  } catch (error) {
    console.error("Error creating job by admin:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all companies for dropdown selection
export const getAllCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, email: true, phone: true, image: true, isVerified: true, createdAt: true, pendingNameChange: true, pendingEmailChange: true },
      orderBy: { name: 'asc' }
    });

    const normalizedCompanies = companies.map(c => ({
      ...c,
      _id: c.id
    }));

    res.json({
      success: true,
      companies: normalizedCompanies
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Approve pending Company profile changes (Name / Email)
export const approveCompanyChange = async (req, res) => {
  const { companyId } = req.params;
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    const updateData = {};
    if (company.pendingNameChange) {
      updateData.name = company.pendingNameChange;
      updateData.pendingNameChange = null;
    }
    if (company.pendingEmailChange) {
      updateData.email = company.pendingEmailChange;
      updateData.pendingEmailChange = null;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData
    });

    // Sync to CRM Client
    try {
      const client = await prisma.client.findFirst({
        where: { companyId }
      });
      if (client) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            company_name: updatedCompany.name,
            email: updatedCompany.email,
            contact_person: updatedCompany.name,
            updatedAt: new Date()
          }
        });
      }
    } catch (crmError) {
      console.error("CRM sync failure in approveCompanyChange:", crmError.message);
    }

    res.json({
      success: true,
      message: "Company changes approved and applied successfully",
      company: updatedCompany
    });
  } catch (error) {
    console.error("Error approving company change:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reject and discard pending Company profile changes (Name / Email)
export const rejectCompanyChange = async (req, res) => {
  const { companyId } = req.params;
  try {
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        pendingNameChange: null,
        pendingEmailChange: null
      }
    });

    res.json({
      success: true,
      message: "Company changes rejected and cleared",
      company: updatedCompany
    });
  } catch (error) {
    console.error("Error rejecting company change:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get jobs for admin dashboard
export const getAdminJobs = async (req, res) => {
  try {
    const admin = req.admin;
    const where = {};

    if (admin && admin.role === 'sub-admin') {
      where.createdBy = admin.id;
    }

    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null) {
      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds }, isDeleted: false },
        select: { companyId: true }
      });
      const companyIds = clients.map(c => c.companyId).filter(Boolean);
      where.companyId = { in: companyIds };
    }

    const jobs = await prisma.job.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, email: true, phone: true, image: true, isVerified: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    // --- FETCH CANDIDATES FOR MATCHING ---
    const candidates = await prisma.cRMCandidate.findMany({
      where: { 
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      },
      select: { id: true, trades: true, state: true, district: true }
    });

    const normalizedJobs = jobs.map(job => {
      // Basic matching logic for eligibility count
      const jobWords = [
        ...(job.title?.toLowerCase().split(/\s+/) || []),
        ...(job.category?.toLowerCase().split(/\s+/) || []),
        ...(job.location?.toLowerCase().split(/[\s,]+/) || [])
      ].filter(w => w.length > 2);

      const eligibleCount = candidates.filter(can => {
        const canTrades = (can.trades || "").toLowerCase();
        const canLoc = `${can.state || ""} ${can.district || ""}`.toLowerCase();
        
        // Match if any significant job word appears in candidate trades or location
        return jobWords.some(word => canTrades.includes(word) || canLoc.includes(word));
      }).length;

      return {
        ...job,
        _id: job.id,
        companyId: job.company ? { ...job.company, _id: job.company.id } : null,
        eligibleCount: eligibleCount || 0
      };
    });

    return res.json({ success: true, jobs: normalizedJobs });
  } catch (error) {
    console.error('Error fetching admin jobs:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// NEW: Controller to raise an objection for a job post
export const raiseJobObjection = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Objection message is required." });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found." });
    }

    const newObjection = { message, timestamp: new Date() };
    const objections = Array.isArray(job.objections) ? [...job.objections, newObjection] : [newObjection];
    const objectionsTrack = Array.isArray(job.objectionsTrack) ? [...job.objectionsTrack, newObjection] : [newObjection];

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        isEdited: false,
        objections,
        objectionsTrack
      }
    });

    res.status(200).json({
      success: true,
      message: "Objection raised successfully!",
      job: updatedJob
    });
  } catch (error) {
    console.error("Error raising job objection:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error while raising objection.",
    });
  }
};

// NEW: Controller to get eligible CRM candidates for a job
export const getEligibleCandidates = async (req, res) => {
  try {
    const { jobId } = req.params;

    // Try finding in Portal Job first
    let job = await prisma.job.findUnique({ where: { id: jobId } });
    let isCRMJob = false;

    if (!job) {
      // Try finding in CRMJob
      job = await prisma.cRMJob.findUnique({ where: { id: jobId } });
      isCRMJob = true;
    }

    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null) {
      if (isCRMJob) {
        if (!clientIds.includes(job.client_id)) {
          return res.status(403).json({ success: false, message: "Access forbidden: job not allocated to your clients" });
        }
      } else {
        const clients = await prisma.client.findMany({
          where: { id: { in: clientIds }, isDeleted: false },
          select: { companyId: true }
        });
        const companyIds = clients.map(c => c.companyId).filter(Boolean);
        if (!companyIds.includes(job.companyId)) {
          return res.status(403).json({ success: false, message: "Access forbidden: job not allocated to your clients" });
        }
      }
    }

    // Get all candidates
    const candidates = await prisma.cRMCandidate.findMany({
      where: { 
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      },
      include: { client: true }
    });

    // Same matching logic as count
    const jobWords = [
      ...(job.title?.toLowerCase().split(/\s+/) || []),
      ...( (isCRMJob ? job.requirements : job.category)?.toLowerCase().split(/\s+/) || []),
      ...(job.location?.toLowerCase().split(/[\s,]+/) || [])
    ].filter(w => w.length > 2);

    const eligibleCandidates = candidates.filter(can => {
      const canTrades = (can.trades || "").toLowerCase();
      const canLoc = `${can.state || ""} ${can.district || ""}`.toLowerCase();
      return jobWords.some(word => canTrades.includes(word) || canLoc.includes(word));
    });

    res.json({ success: true, candidates: eligibleCandidates });
  } catch (error) {
    console.error("Error fetching eligible candidates:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Controller function to get job applications for a specific user
export const getUserJobApplications = async (req, res) => {
  try {
    const userId = req.params.userId;
    const applications = await prisma.jobApplication.findMany({
      where: { userId },
      include: {
        company: { select: { name: true, email: true, image: true } },
        job: { select: { title: true, description: true, location: true, category: true, level: true, salary: true } }
      }
    });

    if (!applications || applications.length === 0) {
      return res.json({
        success: false,
        message: "No job applications found for this user.",
      });
    }

    const normalizedApplications = applications.map(app => ({
      ...app,
      date: app.date ? Number(app.date) : null
    }));

    return res.json({ success: true, applications: normalizedApplications });
  } catch (error) {
    console.error("Error in getUserJobApplications:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Controller to get all job posts by a specific company (recruiter)
export const getCompanyPostedJobs = async (req, res) => {
  try {
    const companyId = req.params.companyId;

    const jobs = await prisma.job.findMany({
      where: { companyId },
      include: {
        company: true,
        _count: {
          select: { applications: true }
        }
      }
    });

    // Map to match the expected structure (applicants field)
    const jobsData = jobs.map(job => ({
      ...job,
      applicants: job._count.applications
    }));

    res.json({ success: true, jobs: jobsData });
  } catch (error) {
    console.error("Error in getCompanyPostedJobs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Controller to get applicants for a specific job
export const getCompanyJobApplicants = async (req, res) => {
  try {
    const { jobId } = req.params;

    const jobData = await prisma.job.findUnique({
      where: { id: jobId }
    });

    if (!jobData) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const clientIds = await getAllocatedClientIds(req);
    if (clientIds !== null) {
      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds }, isDeleted: false },
        select: { companyId: true }
      });
      const companyIds = clients.map(c => c.companyId).filter(Boolean);
      if (!companyIds.includes(jobData.companyId)) {
        return res.status(403).json({ success: false, message: "Access forbidden: job not allocated to your clients" });
      }
    }

    const applications = await prisma.jobApplication.findMany({
      where: { jobId },
      include: {
        user: { select: { id: true, name: true, image: true, resume: true, email: true, phone: true, profile: true } },
        job: { select: { title: true, location: true, category: true, level: true, salary: true } },
        admin: { select: { name: true, email: true } }
      }
    });

    if (!applications || applications.length === 0) {
      return res.json({
        success: false,
        message: "No applicants found for this job.",
      });
    }

    const scoreCandidate = (app, job) => {
      const user = app.user;
      if (!user || !user.profile || !job) return 0;
      const profile = user.profile;

      let score = 0;
      let totalWeight = 0;

      // 1. Qualification & Specialization Matching (Weight: 25)
      if (job.educationRequirements && Array.isArray(job.educationRequirements) && job.educationRequirements.length > 0) {
        totalWeight += 25;
        let isEducatedMatched = false;
        
        let candidateEdu = [];
        try {
          if (profile.education) {
            candidateEdu = typeof profile.education === 'string' 
              ? JSON.parse(profile.education) 
              : profile.education;
          }
        } catch (e) {}
        if (!Array.isArray(candidateEdu)) {
          candidateEdu = [candidateEdu].filter(Boolean);
        }

        for (const reqBlock of job.educationRequirements) {
          const matchedEdu = candidateEdu.find(edu => 
            edu.qualification?.toLowerCase() === reqBlock.qualification?.toLowerCase()
          );
          if (matchedEdu) {
            if (reqBlock.specializations && Array.isArray(reqBlock.specializations) && reqBlock.specializations.length > 0) {
              const specMatched = reqBlock.specializations.some(spec => 
                (matchedEdu.specialization || matchedEdu.trade || matchedEdu.stream || "")
                  .toLowerCase().includes(spec.toLowerCase())
              );
              if (specMatched) {
                isEducatedMatched = true;
                break;
              }
            } else {
              isEducatedMatched = true;
              break;
            }
          }
        }
        if (isEducatedMatched) score += 25;
      }

      // 2. Experience Matching (Weight: 15)
      if (job.experienceOption) {
        totalWeight += 15;
        let isExperienceMatched = false;
        let candidateExpYears = 0;
        if (profile.experience) {
          let parsedExp = [];
          try {
            parsedExp = typeof profile.experience === 'string'
              ? JSON.parse(profile.experience)
              : profile.experience;
          } catch (e) {}
          if (Array.isArray(parsedExp)) {
            candidateExpYears = parsedExp.reduce((sum, exp) => {
              const years = parseInt(exp.years || exp.experience || 0);
              return sum + (isNaN(years) ? 0 : years);
            }, 0);
          } else if (typeof parsedExp === 'object' && parsedExp !== null) {
            candidateExpYears = parseInt(parsedExp.years || parsedExp.experience || 0);
          } else if (typeof parsedExp === 'number') {
            candidateExpYears = parsedExp;
          }
        }

        if (job.experienceOption === "Fresher") {
          if (candidateExpYears === 0) isExperienceMatched = true;
        } else if (job.experienceOption === "Experienced") {
          const minExp = job.minExperience !== null ? job.minExperience : 0;
          const maxExp = job.maxExperience !== null ? job.maxExperience : 99;
          if (candidateExpYears >= minExp && candidateExpYears <= maxExp) {
            isExperienceMatched = true;
          }
        } else if (job.experienceOption === "Both") {
          isExperienceMatched = true;
        }

        if (isExperienceMatched) score += 15;
      }

      // 3. Age Eligibility (Weight: 15)
      if (job.minAge !== null || job.maxAge !== null) {
        totalWeight += 15;
        if (profile.dateOfBirth) {
          const dob = new Date(profile.dateOfBirth);
          const ageDiffMs = Date.now() - dob.getTime();
          const ageDate = new Date(ageDiffMs);
          const age = Math.abs(ageDate.getUTCFullYear() - 1970);
          
          const minAge = job.minAge !== null ? job.minAge : 0;
          const maxAge = job.maxAge !== null ? job.maxAge : 99;
          if (age >= minAge && age <= maxAge) score += 15;
        }
      }

      // 4. Language Requirements (Weight: 15)
      if (job.languages && Array.isArray(job.languages) && job.languages.length > 0) {
        totalWeight += 15;
        let candLanguages = [];
        try {
          if (profile.languages) {
            candLanguages = typeof profile.languages === 'string'
              ? JSON.parse(profile.languages)
              : profile.languages;
          }
        } catch (e) {}
        if (Array.isArray(candLanguages)) {
          const matches = job.languages.filter(lang => 
            candLanguages.some(candLang => candLang?.toLowerCase() === lang?.toLowerCase())
          );
          if (matches.length > 0) {
            score += (matches.length / job.languages.length) * 15;
          }
        }
      }

      // 5. Screening Questions (Weight: 30)
      if (job.screeningQuestions && Array.isArray(job.screeningQuestions) && job.screeningQuestions.length > 0) {
        totalWeight += 30;
        let appData = {};
        try {
          appData = typeof app.applicationData === 'string'
            ? JSON.parse(app.applicationData)
            : app.applicationData || {};
        } catch (e) {}
        
        const screeningAnswers = appData.screeningAnswers || {};
        let correctAnswers = 0;
        for (const q of job.screeningQuestions) {
          const candAns = screeningAnswers[q.id];
          if (candAns !== undefined && String(candAns).toLowerCase() === String(q.preferredAnswer || q.correctAnswer || "").toLowerCase()) {
            correctAnswers++;
          }
        }
        score += (correctAnswers / job.screeningQuestions.length) * 30;
      }

      return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 100;
    };

    // Map to match the expected format (userId -> user, jobId -> job, etc.)
    const normalizedApplications = applications.map((app) => {
      const matchScore = scoreCandidate(app, jobData);
      return {
        ...app,
        userId: app.user,
        jobId: app.job,
        reviewedBy: app.admin,
        date: app.date ? Number(app.date) : null,
        status: app.status ? app.status.toLowerCase() : 'pending',
        matchScore
      };
    });

    // Sort by matchScore descending
    normalizedApplications.sort((a, b) => b.matchScore - a.matchScore);

    return res.json({ success: true, applications: normalizedApplications });
  } catch (error) {
    console.error("Error in getCompanyJobApplicants:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Update Job by Admin
export const updateJobByAdmin = async (req, res) => {
  try {
    const { jobId } = req.params;
    const body = req.body || {};

    const allowedFields = [
      "title", "description", "location", "category", "deadline", "level", "jobType",
      "experience", "salary", "openings", "requirements", "employmentType", "qualification",
      "companyDetails", "educationRequirements", "benefits", "hrContact", "shiftDetails", 
      "salaryBreakdown", "workLocationDetails", "genderPreference", "minAge", "maxAge", 
      "experienceOption", "minExperience", "maxExperience", "languages", "requiredDocuments",
      "immediateJoining", "joiningWithin", "vacancies", "interviewProcess", "screeningQuestions", "visible", "companyId"
    ];

    const data = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    if (data.deadline) data.deadline = new Date(data.deadline);
    if (data.experience !== undefined) data.experience = parseInt(data.experience) || 0;
    if (data.salary !== undefined) data.salary = parseInt(data.salary) || 0;
    if (data.openings !== undefined) data.openings = parseInt(data.openings) || 1;
    if (data.minAge !== undefined) data.minAge = data.minAge ? parseInt(data.minAge) : null;
    if (data.maxAge !== undefined) data.maxAge = data.maxAge ? parseInt(data.maxAge) : null;
    if (data.minExperience !== undefined) data.minExperience = data.minExperience ? parseInt(data.minExperience) : null;
    if (data.maxExperience !== undefined) data.maxExperience = data.maxExperience ? parseInt(data.maxExperience) : null;
    if (data.vacancies !== undefined) data.vacancies = data.vacancies ? parseInt(data.vacancies) : null;
    if (data.immediateJoining !== undefined) {
      data.immediateJoining = data.immediateJoining === true || data.immediateJoining === 'true';
    }

    const existingJob = await prisma.job.findUnique({ where: { id: jobId } });
    if (!existingJob) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    let companyDetails = existingJob.companyDetails;

    if (body.companyId) {
      const companyDoc = await prisma.company.findUnique({ where: { id: body.companyId } });
      if (!companyDoc) {
        return res.status(404).json({ success: false, message: "Selected company not found" });
      }

      companyDetails = {
        name: companyDoc.name,
        shortDescription: body.shortDescription || companyDoc.shortDescription || `${companyDoc.name} is a leading company`,
        city: body.companyCity || companyDoc.city || "",
        state: body.companyState || companyDoc.state || "",
        country: body.companyCountry || companyDoc.country || "",
        hrName: body.hrName || companyDoc.name,
        hrEmail: body.hrEmail || companyDoc.email,
        hrPhone: body.hrPhone || companyDoc.phone,
      };
    } else {
      // Merge overrides into existing details
      companyDetails = {
        ...companyDetails,
        shortDescription: body.shortDescription || companyDetails.shortDescription,
        city: body.companyCity || companyDetails.city,
        state: body.companyState || companyDetails.state,
        country: body.companyCountry || companyDetails.country,
        hrName: body.hrName || companyDetails.hrName,
        hrEmail: body.hrEmail || companyDetails.hrEmail,
        hrPhone: body.hrPhone || companyDetails.hrPhone,
      };
    }

    data.companyDetails = companyDetails;

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data,
      include: {
        company: { select: { name: true, email: true, phone: true, image: true, isVerified: true } }
      }
    });

    return res.json({ success: true, message: "Job updated successfully", job: updatedJob });
  } catch (error) {
    console.error("Error updating job by admin:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Accept job application
export const changeApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;

    const application = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: {
        status: status,
        reviewedBy: req.admin.id,
        reviewedAt: new Date()
      },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        job: { select: { title: true, companyId: true } }
      }
    });

    return res.json({
      success: true,
      message: "Application status updated successfully",
      application
    });

  } catch (error) {
    console.error("Error changing application status:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};


// Get application status statistics for a job (optional utility function)
export const getJobApplicationStats = async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate jobId
    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid job ID" 
      });
    }

    // Get application statistics
    const stats = await JobApplication.aggregate([
      { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Format the results
    const formattedStats = {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      formattedStats.total += stat.count;
      formattedStats[stat._id || 'pending'] = stat.count;
    });

    return res.json({
      success: true,
      stats: formattedStats
    });

  } catch (error) {
    console.error("Error getting application stats:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

export const createSubAdmin = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "Missing Details" });
  }

  try {
    // Check if Admin already exists
    const AdminExists = await Admin.findOne({ email }).lean();
    if (AdminExists) {
      return res.json({
        success: false,
        message: "Admin already registered",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    // Create Admin
    const admin = await Admin.create({
      name,
      email,
      password: hashPassword,
      role: 'sub-admin'
    });

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      },
      message: "Sub-Admin created successfully",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getAllSubAdmins = async (req, res) => {
  try {
    const subAdmins = await prisma.admin.findMany({
      where: { role: 'sub-admin' },
    });
    // Remove password
    const sanitizedSubAdmins = subAdmins.map(({ password, ...rest }) => rest);
    res.status(200).json({ success: true, subAdmins: sanitizedSubAdmins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSubAdmin = async (req, res) => {
  try {
    const { subAdminId } = req.params;

    const deletedSubAdmin = await prisma.admin.delete({
      where: { id: subAdminId, role: 'sub-admin' }
    });

    res.json({
      success: true,
      message: "Sub-Admin deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Sub-Admin:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Vercel safe (important)
// Note: Keeping multer in memory storage as before
// const storage = multer.memoryStorage();
// export const upload = multer({ storage });

// Upload CSV and save to PostgreSQL
export const uploadCandidatesCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV file required" });
    }

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csv())
      .on("data", (data) => {
        results.push({
          name: data.name,
          email: data.email,
          phone: data.phone,
        });
      })
      .on("end", async () => {
        // Save all records to PostgreSQL using createMany
        await prisma.candidate.createMany({
          data: results,
          skipDuplicates: true
        });

        res.json({
          message: "Data uploaded & saved to PostgreSQL",
          totalInserted: results.length,
        });
      });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk upload Users
export const uploadUsersCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "CSV file required" });
    }

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
      .pipe(csv())
      .on("data", (data) => {
        if (data && Object.keys(data).length > 0) {
          results.push(data);
        }
      })
      .on("error", (err) => {
        console.error("CSV Parsing error:", err);
        return res.status(500).json({ success: false, message: "Error parsing CSV file" });
      })
      .on("end", async () => {
        let insertedCount = 0;
        let skippedCount = 0;

        for (const row of results) {
          try {
            const email = (row.email || row.Email || row.EMAIL || "").trim().toLowerCase();
            if (!email) {
              skippedCount++;
              continue;
            }

            const [existingUser, existingProfile] = await Promise.all([
              prisma.user.findUnique({ where: { email } }),
              prisma.userProfile.findUnique({ where: { email } })
            ]);

            if (existingUser || existingProfile) {
              skippedCount++;
              continue;
            }

            const firstName = (row.firstName || row.FirstName || row.first_name || row["First Name"] || "").trim();
            const lastName = (row.lastName || row.LastName || row.last_name || row["Last Name"] || "").trim();
            const name = (firstName + " " + lastName).trim() || row.name || row.Name || row.NAME || "User";
            const phone = (row.phone || row.Phone || row.PHONE || "").trim();

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash("JobMela@123", salt);

            await prisma.$transaction(async (tx) => {
              const user = await tx.user.create({
                data: {
                  name,
                  email,
                  phone,
                  password: hashedPassword
                }
              });

              await tx.userProfile.create({
                data: {
                  userId: user.id,
                  firstName,
                  lastName,
                  email,
                  phone,
                  createdAt: new Date()
                }
              });
            });

            insertedCount++;
          } catch (err) {
            console.error("Bulk upload processing error for row:", row, err);
            skippedCount++;
          }
        }

        res.json({
          success: true,
          message: `Upload complete. ${insertedCount} users successfully added. ${skippedCount > 0 ? skippedCount + " rows skipped (duplicate email or invalid data)." : ""}`,
          insertedCount,
          skippedCount
        });
      });

  } catch (error) {
    console.error("Upload Users CSV error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Controller to verify (Approve/Reject) a job post
export const verifyJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.body; // "Approved" or "Rejected"

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status. Use 'Approved' or 'Rejected'." });
    }

    const isApproved = status === "Approved";

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        isVerified: isApproved,
        visible: isApproved,
        isEdited: false,
        objections: isApproved ? [] : undefined
      }
    });

    res.json({
      success: true,
      message: `Job ${status.toLowerCase()} successfully`,
      job
    });
  } catch (error) {
    console.error("Error verifying job:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
