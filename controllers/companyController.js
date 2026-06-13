import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import { sendEmail } from "../utils/sendEmail.js";

// Register a new company
export const registerCompany = async (req, res) => {
  try {
    let { name, email, phone, password } = req.body;
    name = name?.trim();
    email = email?.trim();
    phone = phone?.trim();
    const imageFile = req.file;

    // 1. Company Name Validation
    const nameRegex = /^[A-Za-z\s&.\-]+$/;
    const hasLetter = /[A-Za-z]/.test(name || "");
    if (!name || name.length < 3 || !nameRegex.test(name) || !hasLetter) {
      return res.status(400).json({ success: false, message: "Please enter a valid company name" });
    }

    // 2. Email Validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

    // 3. Phone Number Validation
    if (!phone) {
      return res.status(400).json({ success: false, message: "Please enter a valid Indian mobile number" });
    }
    let cleanPhone = phone.replace(/\s+/g, '');
    if (cleanPhone.startsWith("+91")) {
      cleanPhone = cleanPhone.slice(3);
    } else if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2);
    }
    const phoneRegex = /^[6-9]\d{9}$/;
    if (cleanPhone.length !== 10 || !phoneRegex.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid Indian mobile number" });
    }

    // 4. Password Validation
    const hasUpper = /[A-Z]/.test(password || "");
    const hasLower = /[a-z]/.test(password || "");
    const hasDigit = /\d/.test(password || "");
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password || "");
    if (!password || password.length < 8 || !hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      return res.status(400).json({ success: false, message: "Password must contain uppercase, lowercase, number and special character" });
    }

    // 5. Company Logo Validation
    if (!imageFile) {
      return res.status(400).json({ success: false, message: "Please upload a company logo" });
    }
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({ success: false, message: "Only JPG, JPEG, PNG, and WEBP files are allowed" });
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "Logo size must be less than 5MB" });
    }

    // Check if company already exists
    const existingCompany = await prisma.company.findFirst({
      where: {
        OR: [
          { email: email },
          { name: name }
        ]
      }
    });

    if (existingCompany) {
      return res.status(400).json({ success: false, message: "Company already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Upload image to cloudinary
    let imageUrl = "https://cdn.iconscout.com/icon/premium/png-256-thumb/building-icon-svg-download-png-1208046.png?f=webp&w=128";
    
    if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key") {
        try {
            const streamUpload = (buffer) => {
                return new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: "companies" },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(buffer).pipe(stream);
                });
            };
            const uploadResult = await streamUpload(imageFile.buffer);
            imageUrl = uploadResult.secure_url;
        } catch (error) {
            console.error("Cloudinary upload failed, using default image:", error.message);
        }
    } else {
        console.warn("Cloudinary not configured or using placeholder keys. Using default company image.");
    }

    const company = await prisma.company.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        image: imageUrl,
        isVerified: true // Set to true for immediate login as per user request
      }
    });

    // --- SYNC TO CRM CLIENT (Partner Directory) ---
    try {
      // Check if client already exists in CRM
      let existingClient = await prisma.client.findFirst({
        where: {
          OR: [
            { company_name: { equals: name, mode: 'insensitive' } },
            { email: { equals: email, mode: 'insensitive' } }
          ]
        }
      });

      if (existingClient) {
        await prisma.client.update({
          where: { id: existingClient.id },
          data: {
            companyId: company.id,
            company_name: name,
            email: email,
            phone: phone,
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.client.create({
          data: {
            companyId: company.id,
            company_name: name,
            email: email,
            phone: phone,
            contact_person: name,
            industry: "Other",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }
    } catch (crmError) {
      console.error("Failed to sync company to CRM Client during registration:", crmError.message);
      // Non-blocking error: don't fail registration if CRM sync fails
    }

    // Create token
    const token = jwt.sign({ id: company.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.cookie("company_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        image: company.image
      },
      message: "Company registered successfully. Please wait for admin verification."
    });

  } catch (error) {
    console.error("Register Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login company
export const loginCompany = async (req, res) => {
  try {
    const { email, password } = req.body;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }

    const company = await prisma.company.findFirst({ where: { email } });

    if (!company) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, company.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (company.isTempPassword) {
      return res.json({
        success: true,
        requirePasswordChange: true,
        companyId: company.id,
      });
    }

    if (!company.isVerified) {
        return res.status(403).json({ success: false, message: "Your company account is not yet verified by the admin team." });
    }

    const token = jwt.sign({ id: company.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.cookie("company_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        image: company.image
      },
      message: "Login successful"
    });

  } catch (error) {
    console.error("Login Company Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get company data
export const getCompanyData = async (req, res) => {
  try {
    const company = req.company;
    res.json({ success: true, company });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Post a new job
export const postJob = async (req, res) => {
  try {
    const { 
      title, description, location, category, level, experience, salary, 
      openings, deadline, requirements, employmentType, qualification, jobType,
      companyDetails,
      educationRequirements, benefits, hrContact, shiftDetails, salaryBreakdown,
      workLocationDetails, genderPreference, minAge, maxAge, experienceOption,
      minExperience, maxExperience, languages, requiredDocuments,
      immediateJoining, joiningWithin, vacancies, interviewProcess, screeningQuestions
    } = req.body;
    const companyId = req.company.id;

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,
        category,
        level,
        jobType,
        experience: parseInt(experience),
        salary: parseInt(salary),
        openings: parseInt(openings),
        deadline: new Date(deadline),
        date: new Date(),
        requirements: requirements,
        employmentType,
        qualification,
        companyId,
        companyDetails: {
          name: companyDetails?.name || req.company.name,
          shortDescription: companyDetails?.shortDescription || req.company.description || "",
          city: companyDetails?.city || req.company.city || "",
          state: companyDetails?.state || req.company.state || "",
          country: companyDetails?.country || req.company.country || "",
          hrName: companyDetails?.hrName || req.company.name,
          hrEmail: companyDetails?.hrEmail || req.company.email,
          hrPhone: companyDetails?.hrPhone || req.company.phone
        },
        visible: false, 
        isVerified: false,
        status: "Pending Admin Verification",
        
        // Advanced fields
        educationRequirements,
        benefits,
        hrContact,
        shiftDetails,
        salaryBreakdown,
        workLocationDetails,
        genderPreference,
        minAge: minAge ? parseInt(minAge) : null,
        maxAge: maxAge ? parseInt(maxAge) : null,
        experienceOption,
        minExperience: minExperience ? parseInt(minExperience) : null,
        maxExperience: maxExperience ? parseInt(maxExperience) : null,
        languages,
        requiredDocuments,
        immediateJoining: immediateJoining === true || immediateJoining === 'true',
        joiningWithin,
        vacancies: vacancies ? parseInt(vacancies) : null,
        interviewProcess,
        screeningQuestions
      }
    });

    res.status(201).json({ success: true, message: "Job posted successfully. It will be visible once approved by the admin team.", job });
  } catch (error) {
    console.error("Post Job Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// List jobs posted by company
export const listCompanyJobs = async (req, res) => {
  try {
    const companyId = req.company.id;
    const jobs = await prisma.job.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { applications: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    const normalizedJobs = jobs.map(job => {
      let calculatedStatus = job.status;
      if (job.isVerified) {
        const now = new Date();
        const deadlineDate = new Date(job.deadline);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 31);
        
        if (deadlineDate < cutoffDate) {
          calculatedStatus = "Hidden";
        } else if (deadlineDate < now) {
          calculatedStatus = "Expired";
        } else {
          calculatedStatus = "Active";
        }
      }
      
      return {
        ...job,
        _id: job.id,
        status: calculatedStatus,
        applicants: job._count?.applications || 0
      };
    });

    res.json({ success: true, jobs: normalizedJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get applicants for a job
export const getCompanyJobApplicants = async (req, res) => {
  try {
    const { jobId } = req.params;
    const companyId = req.company.id;

    const jobData = await prisma.job.findUnique({
      where: { id: jobId }
    });

    const applications = await prisma.jobApplication.findMany({
      where: { jobId, companyId },
      include: {
        user: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            phone: true, 
            image: true, 
            resume: true,
            profile: true
          }
        },
        job: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

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

    const normalizedApplications = applications.map(app => {
      const matchScore = scoreCandidate(app, jobData);
      return {
        ...app,
        _id: app.id,
        date: app.date ? Number(app.date) : null,
        userId: app.user ? { ...app.user, _id: app.user.id } : null,
        jobId: app.job ? { ...app.job, _id: app.job.id } : null,
        matchScore
      };
    });

    // Sort by matchScore descending
    normalizedApplications.sort((a, b) => b.matchScore - a.matchScore);

    res.json({ success: true, applications: normalizedApplications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Change application status
export const changeJobApplicationStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const companyId = req.company.id;

    const application = await prisma.jobApplication.update({
      where: { id, companyId },
      data: { status }
    });

    res.json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Change interview status
export const changeInterviewStatus = async (req, res) => {
    try {
      const { id, interviewStatus } = req.body;
      const companyId = req.company.id;
  
      await prisma.jobApplication.update({
        where: { id, companyId },
        data: { interview: interviewStatus }
      });
  
      res.json({ success: true, message: "Interview status updated successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // Change onboarding status
  export const changeOnboardingStatus = async (req, res) => {
    try {
      const { id, onboardingStatus } = req.body;
      const companyId = req.company.id;
  
      await prisma.jobApplication.update({
        where: { id, companyId },
        data: { onboarding: onboardingStatus }
      });
  
      res.json({ success: true, message: "Onboarding status updated successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

// Edit a job
export const editJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const companyId = req.company.id;
    const body = req.body || {};

    const allowedFields = [
      "title", "description", "location", "category", "deadline", "level", "jobType",
      "experience", "salary", "openings", "requirements", "employmentType", "qualification",
      "companyDetails", "educationRequirements", "benefits", "hrContact", "shiftDetails", 
      "salaryBreakdown", "workLocationDetails", "genderPreference", "minAge", "maxAge", 
      "experienceOption", "minExperience", "maxExperience", "languages", "requiredDocuments",
      "immediateJoining", "joiningWithin", "vacancies", "interviewProcess", "screeningQuestions"
    ];

    const updateData = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    if (updateData.experience !== undefined) updateData.experience = parseInt(updateData.experience);
    if (updateData.salary !== undefined) updateData.salary = parseInt(updateData.salary);
    if (updateData.openings !== undefined) updateData.openings = parseInt(updateData.openings);
    if (updateData.minAge !== undefined) updateData.minAge = updateData.minAge ? parseInt(updateData.minAge) : null;
    if (updateData.maxAge !== undefined) updateData.maxAge = updateData.maxAge ? parseInt(updateData.maxAge) : null;
    if (updateData.minExperience !== undefined) updateData.minExperience = updateData.minExperience ? parseInt(updateData.minExperience) : null;
    if (updateData.maxExperience !== undefined) updateData.maxExperience = updateData.maxExperience ? parseInt(updateData.maxExperience) : null;
    if (updateData.vacancies !== undefined) updateData.vacancies = updateData.vacancies ? parseInt(updateData.vacancies) : null;
    if (updateData.immediateJoining !== undefined) {
      updateData.immediateJoining = updateData.immediateJoining === true || updateData.immediateJoining === 'true';
    }
    if (updateData.deadline) updateData.deadline = new Date(updateData.deadline);

    const job = await prisma.job.update({
      where: { id: jobId, companyId },
      data: {
        ...updateData,
        status: "Pending Admin Verification",
        isVerified: false,
        visible: false,
        isEdited: true
      }
    });

    res.json({ success: true, message: "Job updated successfully", job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a job
export const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const companyId = req.company.id;

    await prisma.job.delete({
      where: { id: jobId, companyId }
    });

    res.json({ success: true, message: "Job deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Logout
export const logoutCompany = async (req, res) => {
  try {
    res.clearCookie("company_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Forgot Password Controller
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const company = await prisma.company.findFirst({ where: { email } });
    if (!company) {
      return res.json({ success: false, message: "Company not found with this email" });
    }
    
    // Generate random 8-character password
    const tempPassword = Math.random().toString(36).slice(-8) + "!";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    await prisma.company.update({
      where: { id: company.id },
      data: {
        password: hashedPassword,
        isTempPassword: true,
      },
    });

    const emailSent = await sendEmail({
      to: email,
      subject: "Password Reset - Job Mela",
      text: `Your temporary password is: ${tempPassword}\nPlease login and update your password immediately.`,
      html: `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please login and update your password immediately.</p>`
    });

    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send email. Please try again later." });
    }

    return res.json({ success: true, message: "A temporary password has been sent to your email!" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

// Update Password Controller
export const updatePassword = async (req, res) => {
  try {
    const { companyId, newPassword } = req.body;
    if (!companyId || !newPassword) {
      return res.status(400).json({ success: false, message: "Please provide companyId and new password" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        password: hashedPassword,
        isTempPassword: false,
      },
    });

    const token = jwt.sign({ id: company.id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.cookie("company_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        image: company.image
      },
      message: "Password updated successfully"
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update company profile details
export const updateCompanyProfile = async (req, res) => {
  try {
    const companyId = req.company.id;
    let { name, email, phone, description, city, state, country, website, industry } = req.body;
    const imageFile = req.file;

    // Optional field trimming
    name = name?.trim();
    email = email?.trim();
    phone = phone?.trim();

    // Check if name is taken by another company (only if different from current)
    if (name && name !== req.company.name) {
      const nameConflict = await prisma.company.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          id: { not: companyId }
        }
      });
      if (nameConflict) {
        return res.status(400).json({ success: false, message: "Company name is already taken by another entity" });
      }
    }

    // Check if email is taken by another company (only if different from current)
    if (email && email !== req.company.email) {
      const emailConflict = await prisma.company.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          id: { not: companyId }
        }
      });
      if (emailConflict) {
        return res.status(400).json({ success: false, message: "Email is already in use by another company" });
      }
    }

    const updateData = {};
    let pendingMsg = [];
    if (name && name !== req.company.name) {
      updateData.pendingNameChange = name;
      pendingMsg.push("Company Name");
    }
    if (email && email !== req.company.email) {
      updateData.pendingEmailChange = email;
      pendingMsg.push("Email ID");
    }
    if (phone) updateData.phone = phone;
    if (description !== undefined) updateData.description = description;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (country !== undefined) updateData.country = country;
    if (website !== undefined) updateData.website = website;
    if (industry !== undefined) updateData.industry = industry;

    // Optional logo upload
    if (imageFile) {
      let imageUrl = null;
      if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key") {
        try {
          const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                { folder: "companies" },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              streamifier.createReadStream(buffer).pipe(stream);
            });
          };
          const uploadResult = await streamUpload(imageFile.buffer);
          imageUrl = uploadResult.secure_url;
        } catch (error) {
          console.error("Cloudinary upload failed during profile update:", error.message);
        }
      }
      if (imageUrl) {
        updateData.image = imageUrl;
      }
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData
    });

    // --- SYNC TO CRM CLIENT (Partner Directory) ---
    try {
      const clientLocation = [updatedCompany.city, updatedCompany.state].filter(Boolean).join(", ") || updatedCompany.country;
      
      let client = await prisma.client.findFirst({
        where: { companyId }
      });

      if (client) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            company_name: updatedCompany.name,
            email: updatedCompany.email,
            phone: updatedCompany.phone,
            location: clientLocation || client.location,
            contact_person: updatedCompany.name,
            industry: updatedCompany.industry || client.industry || "Other",
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.client.create({
          data: {
            companyId,
            company_name: updatedCompany.name,
            email: updatedCompany.email,
            phone: updatedCompany.phone,
            location: clientLocation,
            contact_person: updatedCompany.name,
            industry: updatedCompany.industry || "Other",
            status: "active"
          }
        });
      }
    } catch (crmError) {
      console.error("Failed to sync updated company to CRM client:", crmError.message);
    }

    let successMessage = "Company profile updated successfully";
    if (pendingMsg.length > 0) {
      successMessage += `. Note: Changes to ${pendingMsg.join(" and ")} require Admin approval.`;
    }

    res.json({
      success: true,
      message: successMessage,
      company: {
        id: updatedCompany.id,
        name: updatedCompany.name,
        email: updatedCompany.email,
        phone: updatedCompany.phone,
        image: updatedCompany.image,
        description: updatedCompany.description,
        city: updatedCompany.city,
        state: updatedCompany.state,
        country: updatedCompany.country,
        website: updatedCompany.website,
        industry: updatedCompany.industry,
        pendingNameChange: updatedCompany.pendingNameChange,
        pendingEmailChange: updatedCompany.pendingEmailChange
      }
    });
  } catch (error) {
    console.error("Update Company Profile Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

