import prisma from "../../config/prisma.js";
import { getAllocatedClientIds } from "../../middleware/crmPermissionMiddleware.js";

// Fetch structured reports for analytics
export const getCRMReportsSummary = async (req, res) => {
  try {
    const { companyId } = req;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company profile required" });
    }

    const allocatedClientIds = await getAllocatedClientIds(req);
    let { clientId } = req.query;

    let clientWhereClause = {};

    if (clientId && clientId !== "all") {
      if (allocatedClientIds !== null && !allocatedClientIds.includes(clientId)) {
        return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
      }
      clientWhereClause = { client_id: clientId };
    } else {
      if (allocatedClientIds !== null) {
        clientWhereClause = { client_id: { in: allocatedClientIds } };
      } else {
        const companyClients = await prisma.client.findMany({
          where: { companyId, isDeleted: false },
          select: { id: true }
        });
        const companyClientIds = companyClients.map(c => c.id);
        clientWhereClause = { client_id: { in: companyClientIds } };
      }
    }

    // 1. Source Performance
    const sourceGroups = await prisma.cRMCandidate.groupBy({
      by: ["source"],
      where: { ...clientWhereClause, isDeleted: false },
      _count: { id: true }
    });
    const sourcePerformance = sourceGroups.map(g => ({
      source: g.source || "Direct",
      count: g._count.id
    }));

    // 2. Recruiter Performance Leaderboard
    const recruiterGroups = await prisma.cRMCandidate.groupBy({
      by: ["assigned_recruiter"],
      where: { ...clientWhereClause, isDeleted: false },
      _count: { id: true }
    });

    const recruiterPerformance = [];
    for (const group of recruiterGroups) {
      if (!group.assigned_recruiter) continue;
      
      // Try to find staff details
      const staff = await prisma.companyStaff.findUnique({
        where: { id: group.assigned_recruiter },
        select: { name: true, role: true }
      });

      // Get count of joined candidates assigned to this recruiter
      const joinedCount = await prisma.cRMCandidate.count({
        where: {
          ...clientWhereClause,
          assigned_recruiter: group.assigned_recruiter,
          status: "Joined",
          isDeleted: false
        }
      });

      recruiterPerformance.push({
        recruiterId: group.assigned_recruiter,
        name: staff?.name || "System Admin",
        screened: group._count.id,
        joined: joinedCount
      });
    }

    // 3. Location Wise Hiring
    const locationGroups = await prisma.cRMCandidate.groupBy({
      by: ["state", "district"],
      where: { ...clientWhereClause, isDeleted: false },
      _count: { id: true }
    });
    const locationWise = locationGroups.map(g => ({
      state: g.state || "Unknown",
      district: g.district || "Unknown",
      count: g._count.id
    }));

    // 4. General statistics
    const [total, joined, rejected, dropout] = await Promise.all([
      prisma.cRMCandidate.count({ where: { ...clientWhereClause, isDeleted: false } }),
      prisma.cRMCandidate.count({ where: { ...clientWhereClause, status: "Joined", isDeleted: false } }),
      prisma.cRMCandidate.count({ where: { ...clientWhereClause, status: "Rejected", isDeleted: false } }),
      prisma.cRMCandidate.count({ where: { ...clientWhereClause, status: "Dropout", isDeleted: false } })
    ]);

    const selectionRatio = total > 0 ? Math.round(((joined + rejected) / total) * 100) : 0;
    const joiningRatio = (joined + dropout) > 0 ? Math.round((joined / (joined + dropout)) * 100) : 0;
    const dropoutRatio = (joined + dropout) > 0 ? Math.round((dropout / (joined + dropout)) * 100) : 0;

    res.json({
      success: true,
      reports: {
        sourcePerformance,
        recruiterPerformance,
        locationWise,
        statistics: {
          totalApplications: total,
          joined,
          rejected,
          dropout,
          selectionRatio,
          joiningRatio,
          dropoutRatio
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export candidate applications as CSV
export const exportCRMReportCSV = async (req, res) => {
  try {
    const { companyId } = req;
    let { clientId } = req.query;

    const allocatedClientIds = await getAllocatedClientIds(req);
    let clientWhereClause = {};

    if (clientId && clientId !== "all") {
      if (allocatedClientIds !== null && !allocatedClientIds.includes(clientId)) {
        return res.status(403).send("Access forbidden: client not allocated to you");
      }
      clientWhereClause = { client_id: clientId };
    } else {
      if (allocatedClientIds !== null) {
        clientWhereClause = { client_id: { in: allocatedClientIds } };
      } else {
        const companyClients = await prisma.client.findMany({
          where: { companyId, isDeleted: false },
          select: { id: true }
        });
        const companyClientIds = companyClients.map(c => c.id);
        clientWhereClause = { client_id: { in: companyClientIds } };
      }
    }

    const candidates = await prisma.cRMCandidate.findMany({
      where: { ...clientWhereClause, isDeleted: false },
      orderBy: { createdAt: "desc" }
    });

    // Generate CSV contents
    let csvContent = "ID,Name,Phone,Email,Education,Experience,State,District,Trades,Status,Source,DateCreated\n";
    candidates.forEach(c => {
      const row = [
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        c.phone,
        c.email || "",
        `"${(c.education || "").replace(/"/g, '""')}"`,
        `"${(c.experience || "").replace(/"/g, '""')}"`,
        `"${(c.state || "").replace(/"/g, '""')}"`,
        `"${(c.district || "").replace(/"/g, '""')}"`,
        `"${(c.trades || "").replace(/"/g, '""')}"`,
        c.status,
        c.source,
        new Date(c.createdAt).toISOString().split('T')[0]
      ].join(",");
      csvContent += row + "\n";
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="hiring_report_${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).send(error.message);
  }
};
