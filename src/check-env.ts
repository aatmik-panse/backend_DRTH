import dotenv from 'dotenv';
import path from 'path';

// Load env directly
dotenv.config({ path: path.join(__dirname, '../.env') });

const validSecret = process.env.SUPABASE_JWT_SECRET;
const legacySecret = process.env.JWT_SECRET;

console.log('--- ENV CHECK ---');
if (validSecret) {
    console.log(`SUPABASE_JWT_SECRET is present.`);
    console.log(`Length: ${validSecret.length}`);
    console.log(`Starts with: ${validSecret.substring(0, 5)}...`);

    if (validSecret.startsWith('eyJ')) {
        console.warn('WARNING: SUPABASE_JWT_SECRET appears to be a JWT (starts with eyJ). It should be the raw 40-character random string from Supabase Settings -> API -> JWT Secret.');
    }
} else {
    console.log('SUPABASE_JWT_SECRET is NOT present.');
}

if (legacySecret) {
    console.log(`JWT_SECRET is present.`);
    console.log(`Length: ${legacySecret.length}`);
}
console.log('--- END ENV CHECK ---');
