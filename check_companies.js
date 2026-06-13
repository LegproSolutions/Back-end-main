import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const companySchema = new mongoose.Schema({
    name: String,
});

const Company = mongoose.model('Company', companySchema);

const checkCompanies = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const count = await Company.countDocuments();
        console.log(`Total companies: ${count}`);
        if (count > 0) {
            const companies = await Company.find({});
            console.log("Companies:", JSON.stringify(companies, null, 2));
        }
        process.exit(0);
    } catch (error) {
        process.exit(1);
    }
};

checkCompanies();
