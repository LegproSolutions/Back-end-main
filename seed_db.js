import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const companySchema = new mongoose.Schema({
    name: String,
    email: String,
    image: String,
    isVerified: Boolean
});

const jobSchema = new mongoose.Schema({
    title: String,
    description: String,
    location: String,
    category: String,
    deadline: Date,
    level: String,
    experience: Number,
    salary: Number,
    openings: Number,
    date: Date,
    visible: { type: Boolean, default: true },
    employmentType: String,
    companyId: mongoose.Schema.Types.ObjectId,
    companyDetails: Object,
    isVerified: Boolean
});

const Company = mongoose.model('Company', companySchema);
const Job = mongoose.model('Job', jobSchema);

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Clear existing (optional, but good for clean seed)
        await Company.deleteMany({});
        await Job.deleteMany({});

        const company = await Company.create({
            name: "JobMela Technolgies",
            email: "contact@jobmela.com",
            image: "https://jobmela.co.in/logo.png",
            isVerified: true
        });

        console.log("Created Company:", company._id);

        const job = await Job.create({
            title: "Full Stack Developer",
            description: "<p>We are looking for a skilled developer to join our team. You should be proficient in React and Node.js.</p>",
            location: "Bangalore, India",
            category: "Programming",
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            level: "Intermediate",
            experience: 2,
            salary: 800000,
            openings: 5,
            date: new Date(),
            visible: true,
            employmentType: "full-time",
            companyId: company._id,
            companyDetails: {
                name: "JobMela Technolgies",
                shortDescription: "Leading the future of job portals.",
                city: "Bangalore",
                state: "Karnataka",
                country: "India"
            },
            isVerified: true
        });

        console.log("Created Job:", job._id);
        
        process.exit(0);
    } catch (error) {
        console.error("Seed Error:", error);
        process.exit(1);
    }
};

seedData();
