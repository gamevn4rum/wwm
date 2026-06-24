import fs from 'fs';
import crypto from 'crypto';

const KEY_HEX = process.env.DATA_ENCRYPTION_KEY;

if (!KEY_HEX || KEY_HEX.length !== 64) {
  console.error('DATA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).');
  console.error('Generate one with:  openssl rand -hex 32');
  process.exit(1);
}

const key = Buffer.from(KEY_HEX, 'hex');

// Only files behind an auth guard should be listed here.
const FILES = ['footages.json'];

for (const filename of FILES) {
  const inPath  = `./data/${filename}`;
  const outPath = `./data/${filename.replace('.json', '.enc')}`;

  if (!fs.existsSync(inPath)) {
    console.warn(`⚠ ${inPath} not found, skipping`);
    continue;
  }

  const plaintext  = fs.readFileSync(inPath, 'utf8');
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  // Ciphertext layout: [encrypted_data | 16-byte GCM auth tag]
  // Web Crypto's AES-GCM decrypt expects the tag appended at the end.
  const payload = {
    iv:         iv.toString('base64'),
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
  };

  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf8');
  console.log(`✓ ${filename} → ${filename.replace('.json', '.enc')}`);
}
