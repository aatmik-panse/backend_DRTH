import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
console.log('Secret loaded:', secret ? `Has length ${secret.length}` : 'MISSING');

if (!secret) {
    console.error('ERROR: No secret found in .env');
    process.exit(1);
}

// Read token from command line argument
const token = process.argv[2];

if (!token) {
    console.log('Usage: npx ts-node src/test-token.ts <paste_your_token_here>');
    process.exit(0);
}

console.log('\n--- TOKEN DEBUGGER ---');
console.log('Analyzing provided token...');

try {
    const decoded: any = jwt.decode(token, { complete: true });
    if (!decoded) {
        console.error('FAILED to decode token. Is it a valid JWT?');
    } else {
        console.log('Header:', JSON.stringify(decoded.header, null, 2));
        console.log('Payload:', JSON.stringify(decoded.payload, null, 2));

        console.log('\n--- VERIFICATION ATTEMPT ---');
        console.log(`Verifying with algorithm: ${decoded.header.alg}`);
        console.log('Using Secret from .env...');

        try {
            jwt.verify(token, secret);
            console.log('✅ VERIFICATION SUCCESSFUL! The token is valid and the secret is correct.');
        } catch (verErr: any) {
            console.error('❌ VERIFICATION FAILED:', verErr.message);
            if (verErr.message.includes('invalid algorithm')) {
                console.error('\nEXPLANATION: "invalid algorithm" usually means the token is signed with an Asymmetric key (RS256) but you provided a symmetric secret string (HS256), or vice versa.');
                console.error(`Token Algorithm: ${decoded.header.alg}`);
                console.error(`Secret provided is string? ${typeof secret === 'string'}`);
                if (decoded.header.alg === 'RS256') {
                    console.error('-> You need a PUBLIC KEY (PEM format) to verify this token, not a simple string secret.');
                }
            } else if (verErr.message.includes('invalid signature')) {
                console.error('\nEXPLANATION: "invalid signature" means the token is likely HS256, but the secret in your .env is WRONG.');
                console.error('-> Go to Supabase -> Project Settings -> API -> JWT Settings -> JWT Secret and copy the correct secret.');
            }
        }
    }
} catch (err: any) {
    console.error('Error analyzing token:', err.message);
}
console.log('--- END DEBUGGER ---\n');
