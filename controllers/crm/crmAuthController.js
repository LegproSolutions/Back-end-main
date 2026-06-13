import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../../config/prisma.js";

// Handle Company Staff (HR, Recruiter, Manager) Login
export const loginCompanyStaff = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    let staff = await prisma.companyStaff.findUnique({
      where: { email },
      include: { company: true }
    });

    if (staff && !staff.isActive) {
      return res.status(401).json({ success: false, message: "Your account has been deactivated. Please contact the Administrator." });
    }

    if (!staff) {
      // Check if it's a portal Admin (CRM Super Admin)
      const admin = await prisma.admin.findUnique({ where: { email } });
      if (admin) {
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
          return res.status(401).json({ success: false, message: "Invalid CRM Login ID or Password." });
        }
        
        // Sign JWT
        const token = jwt.sign(
          { id: admin.id, role: admin.role },
          process.env.JWT_SECRET,
          { expiresIn: "1d" }
        );

        // Set cookie
        res.cookie("company_staff_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        return res.json({
          success: true,
          token,
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            companyId: null,
            companyName: "Jobmela Platform",
            permissions: ["*"]
          },
          message: "Login successful"
        });
      }

      return res.status(401).json({ success: false, message: "Invalid CRM Login ID or Password." });
    }

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid CRM Login ID or Password." });
    }

    // Sign JWT
    const token = jwt.sign(
      { staffId: staff.id, companyId: staff.companyId, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Set cookie
    res.cookie("company_staff_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({
      success: true,
      token,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        companyId: staff.companyId,
        companyName: staff.company.name,
        permissions: staff.permissions
      },
      message: "Login successful"
    });
  } catch (error) {
    console.error("CRM Staff Login Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current session data (unified for Company / CompanyStaff / Admin)
export const getCRMMe = async (req, res) => {
  try {
    if (req.staff) {
      return res.json({
        success: true,
        token: req.token,
        type: "staff",
        role: req.userRole,
        user: {
          id: req.staff.id,
          name: req.staff.name,
          email: req.staff.email,
          role: req.staff.role,
          companyId: req.companyId,
          permissions: req.staff.permissions
        }
      });
    }


    if (req.admin) {
      return res.json({
        success: true,
        token: req.token,
        type: "admin",
        role: req.admin.role,
        user: {
          id: req.admin.id,
          name: req.admin.name,
          email: req.admin.email,
          role: req.admin.role,
          companyId: req.companyId || null,
          permissions: ["*"]
        }
      });
    }

    res.status(401).json({ success: false, message: "Unauthorized" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Logout handler
export const logoutCRM = async (req, res) => {
  try {
    res.clearCookie("company_staff_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    });
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
