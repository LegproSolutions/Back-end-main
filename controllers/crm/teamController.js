import bcrypt from "bcrypt";
import prisma from "../../config/prisma.js";

// Create a new team member
export const createTeamMember = async (req, res) => {
  try {
    const { companyId } = req;
    const { name, email, phone, password, role, permissions } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "Please provide name, email, password, and role" });
    }

    // Check if email already exists (anywhere in staff or company)
    const existingStaff = await prisma.companyStaff.findUnique({ where: { email } });
    const existingCompany = await prisma.company.findFirst({ where: { email } });
    if (existingStaff || existingCompany) {
      return res.status(400).json({ success: false, message: "A user with this email already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create staff member
    const newStaff = await prisma.companyStaff.create({
      data: {
        companyId,
        name,
        email,
        phone,
        password: hashedPassword,
        role, // recruiter, hr, manager, or custom roles
        permissions: permissions || ["view"]
      }
    });

    // Assign clients if clientIds array is provided
    if (Array.isArray(req.body.clientIds) && req.body.clientIds.length > 0) {
      await prisma.clientAllocation.createMany({
        data: req.body.clientIds.map(clientId => ({
          clientId,
          staffId: newStaff.id
        }))
      });
    }

    // Log action
    await prisma.auditLog.create({
      data: {
        companyId,
        action: "TEAM_MEMBER_CREATED",
        details: `Created team member ${name} (${role})`
      }
    });

    const { password: passwordHash, ...sanitizedStaff } = newStaff;
    const staffResponse = { ...sanitizedStaff, clientIds: req.body.clientIds || [] };
    if (req.admin) {
      staffResponse.password = passwordHash;
      staffResponse.plainPassword = password;
    }
    res.status(201).json({ success: true, staff: staffResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// List all team members for the logged-in company
export const getTeamMembers = async (req, res) => {
  try {
    const { companyId } = req;

    const team = await prisma.companyStaff.findMany({
      where: { companyId },
      include: {
        allocations: {
          select: { clientId: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const sanitizedTeam = team.map(({ password, allocations, ...rest }) => {
      const member = {
        ...rest,
        clientIds: allocations.map(a => a.clientId)
      };
      if (req.admin) {
        member.password = password;
      }
      return member;
    });
    res.json({ success: true, data: sanitizedTeam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update team member role/permissions
export const updateTeamMember = async (req, res) => {
  try {
    const { companyId } = req;
    const { id } = req.params;
    const { name, phone, role, permissions, isActive, newPassword } = req.body;

    const staff = await prisma.companyStaff.findFirst({
      where: { id, companyId }
    });

    if (!staff) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    let updateData = {
      name: name || staff.name,
      phone: phone !== undefined ? phone : staff.phone,
      role: role || staff.role,
      permissions: permissions || staff.permissions,
      isActive: isActive !== undefined ? isActive : staff.isActive
    };

    if (newPassword) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }

    const updated = await prisma.companyStaff.update({
      where: { id },
      data: updateData
    });

    // Update client allocations if clientIds array is provided
    if (Array.isArray(req.body.clientIds)) {
      // Delete existing
      await prisma.clientAllocation.deleteMany({
        where: { staffId: id }
      });
      // Add new ones
      if (req.body.clientIds.length > 0) {
        await prisma.clientAllocation.createMany({
          data: req.body.clientIds.map(clientId => ({
            clientId,
            staffId: id
          }))
        });
      }
    }

    // Log action
    await prisma.auditLog.create({
      data: {
        companyId,
        action: "TEAM_MEMBER_UPDATED",
        details: `Updated team member ${updated.name}`
      }
    });

    const { password: passwordHash, ...sanitized } = updated;
    const staffResponse = { ...sanitized, clientIds: req.body.clientIds || [] };
    if (req.admin) {
      staffResponse.password = passwordHash;
      if (newPassword) staffResponse.plainPassword = newPassword;
    }
    res.json({ success: true, staff: staffResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Remove a team member
export const deleteTeamMember = async (req, res) => {
  try {
    const { companyId } = req;
    const { id } = req.params;

    const staff = await prisma.companyStaff.findFirst({
      where: { id, companyId }
    });

    if (!staff) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    await prisma.companyStaff.delete({ where: { id } });

    // Log action
    await prisma.auditLog.create({
      data: {
        companyId,
        action: "TEAM_MEMBER_DELETED",
        details: `Deleted team member ${staff.name}`
      }
    });

    res.json({ success: true, message: "Team member deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
