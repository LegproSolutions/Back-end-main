import prisma from "../config/prisma.js";

export const getStats = async (req, res) => {
    try {
        const [userCount, crmCandidateCount, companies, jobs] = await Promise.all([
            prisma.userProfile.count(),
            prisma.cRMCandidate.count({ 
                where: { 
                    isDeleted: false,
                    source: { not: "JobMela Portal" }
                } 
            }),
            prisma.company.count(),
            prisma.job.count({ where: { visible: true } })
        ]);

        const jobseekers = userCount + crmCandidateCount;

        res.json({
            success: true,
            stats: {
                jobseekers,
                companies,
                jobs
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

