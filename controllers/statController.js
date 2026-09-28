import prisma from "../config/prisma.js";

export const getStats = async (req, res) => {
    try {
        const [crmCandidateCount, companies, visibleJobs] = await Promise.all([
            prisma.cRMCandidate.count({ 
                where: { 
                    isDeleted: false
                } 
            }),
            prisma.company.count(),
            prisma.job.findMany({
                where: { visible: true },
                select: { openings: true, vacancies: true }
            })
        ]);

        const totalVacancies = visibleJobs.reduce((sum, job) => sum + (job.vacancies ?? job.openings ?? 0), 0);

        res.json({
            success: true,
            stats: {
                jobseekers: crmCandidateCount,
                companies,
                jobs: totalVacancies
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

