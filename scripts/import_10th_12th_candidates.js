import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default path or pass as first argument
const defaultFilePath = 'C:/Users/RITS/Desktop/JobMela_Pro/JobMela_Pro/10th-12th Candiate data_All.csv';
const filePath = process.argv[2] || defaultFilePath;

async function runImporter() {
  if (!fs.existsSync(filePath)) {
    console.error(`[Error] CSV file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log('====================================================');
  console.log('       JOBMELA PRO - CANDIDATE DATA IMPORTER        ');
  console.log('====================================================');
  console.log(`Source File: ${filePath}`);
  console.log(`Start Time : ${new Date().toLocaleString()}`);

  const initialDbCount = await prisma.cRMCandidate.count();
  console.log(`Current candidates in Database: ${initialDbCount.toLocaleString()}`);
  console.log('----------------------------------------------------');
  console.log('Beginning streaming and batch insertion...');
  console.time('Total Import Time');

  const BATCH_SIZE = 2000;
  let buffer = [];
  let totalRowsRead = 0;
  let totalInserted = 0;
  let totalDbDuplicates = 0;
  let totalFileDuplicates = 0;
  let totalInvalid = 0;
  let batchIndex = 0;

  const seenPhones = new Set();

  const processBatch = async (batch) => {
    if (batch.length === 0) return;
    batchIndex++;

    try {
      const res = await prisma.cRMCandidate.createMany({
        data: batch,
        skipDuplicates: true
      });

      const inserted = res.count;
      const dbDuplicates = batch.length - inserted;
      totalInserted += inserted;
      totalDbDuplicates += dbDuplicates;

      const pct = ((totalRowsRead / 224574) * 100).toFixed(1);
      console.log(
        `[Batch #${String(batchIndex).padStart(3, ' ')}] ` +
        `Read: ${String(totalRowsRead).padStart(7, ' ')} (${pct}%) | ` +
        `Inserted: ${String(totalInserted).padStart(7, ' ')} | ` +
        `Duplicates: ${String(totalFileDuplicates + totalDbDuplicates).padStart(6, ' ')} | ` +
        `Invalid: ${totalInvalid}`
      );
    } catch (err) {
      console.error(`[Batch Error] Batch #${batchIndex} failed:`, err.message);
      // If batch failed, fallback to inserting individually to avoid losing the whole chunk
      for (const item of batch) {
        try {
          await prisma.cRMCandidate.create({ data: item });
          totalInserted++;
        } catch {
          totalDbDuplicates++;
        }
      }
    }
  };

  const stream = fs.createReadStream(filePath).pipe(
    csvParser({
      mapHeaders: ({ header }) => header?.trim()
    })
  );

  for await (const row of stream) {
    totalRowsRead++;

    // Extract fields regardless of capitalization
    const rawName = row.Name || row.name || row.FullName || row.fullname || row['Candidate Name'];
    const rawPhone = row.Phone || row.phone || row.Mobile || row.mobile || row['Mobile Number'];
    const rawEmail = row.Email || row.email || row.EmailAddress || row['Email Address'];
    const rawEdu = row.Education || row.education;
    const rawTrade = row.Trade || row.trade || row.Trades || row.trades;
    const rawState = row.State || row.state || row.Location || row.location;
    const rawDistrict = row.District || row.district;
    const rawSource = row.Source || row.source;
    const rawGender = row.Gender || row.gender;
    const rawDob = row.Dob || row.dob || row.DOB;

    // Validate and clean Phone number
    let phoneDigits = String(rawPhone || '').replace(/[^0-9]/g, '');
    if (phoneDigits.length === 12 && phoneDigits.startsWith('91')) {
      phoneDigits = phoneDigits.slice(2);
    }

    if (phoneDigits.length !== 10) {
      totalInvalid++;
      continue;
    }

    // Check intra-file duplicates
    if (seenPhones.has(phoneDigits)) {
      totalFileDuplicates++;
      continue;
    }
    seenPhones.add(phoneDigits);

    // Clean and normalize strings
    const name = (rawName && String(rawName).trim()) || 'Candidate';
    let email = (rawEmail && String(rawEmail).trim()) || null;
    if (email) {
      const emailLower = email.toLowerCase();
      if (emailLower === 'null' || emailLower === 'undefined' || !emailLower.includes('@')) {
        email = null;
      }
    }

    let education = (rawEdu && String(rawEdu).trim()) || null;
    if (education) {
      if (education.toLowerCase() === '10th') education = '10th';
      else if (education.toLowerCase() === '12th') education = '12th';
    }

    let gender = (rawGender && String(rawGender).trim()) || null;
    if (gender) {
      const gLower = gender.toLowerCase();
      if (gLower === 'male' || gLower === 'm') gender = 'Male';
      else if (gLower === 'female' || gLower === 'f') gender = 'Female';
    }

    const trades = (rawTrade && String(rawTrade).trim()) || null;
    const state = (rawState && String(rawState).trim()) || null;
    const district = (rawDistrict && String(rawDistrict).trim()) || null;
    const source = (rawSource && String(rawSource).trim()) || 'CRM';
    const dob = (rawDob && String(rawDob).trim()) || null;

    buffer.push({
      id: randomUUID(),
      name,
      phone: phoneDigits,
      email,
      education,
      trades,
      state,
      district,
      source,
      gender,
      dob,
      status: 'new_lead',
      isDeleted: false
    });

    if (buffer.length >= BATCH_SIZE) {
      const chunkToProcess = buffer;
      buffer = [];
      await processBatch(chunkToProcess);
    }
  }

  // Process remaining buffer
  if (buffer.length > 0) {
    await processBatch(buffer);
    buffer = [];
  }

  console.log('----------------------------------------------------');
  console.log('Import completed. Fetching final database stats...');
  const finalDbCount = await prisma.cRMCandidate.count();

  console.log('====================================================');
  console.log('             IMPORT SUMMARY REPORT                  ');
  console.log('====================================================');
  console.log(`Total CSV Rows Read      : ${totalRowsRead.toLocaleString()}`);
  console.log(`Unique Candidates in File : ${seenPhones.size.toLocaleString()}`);
  console.log(`Successfully Inserted    : ${totalInserted.toLocaleString()}`);
  console.log(`File Duplicates Skipped  : ${totalFileDuplicates.toLocaleString()}`);
  console.log(`DB Existing Duplicates   : ${totalDbDuplicates.toLocaleString()}`);
  console.log(`Invalid Phone Numbers    : ${totalInvalid.toLocaleString()}`);
  console.log('----------------------------------------------------');
  console.log(`Previous DB Total Count  : ${initialDbCount.toLocaleString()}`);
  console.log(`Current DB Total Count   : ${finalDbCount.toLocaleString()}`);
  console.log(`Net Database Growth      : +${(finalDbCount - initialDbCount).toLocaleString()}`);
  console.timeEnd('Total Import Time');
  console.log('====================================================');
}

runImporter()
  .catch((err) => {
    console.error('Fatal importer error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
