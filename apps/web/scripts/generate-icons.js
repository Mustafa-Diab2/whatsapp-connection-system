/**
 * Generate simple PWA icons as PNG files
 * Uses pure Node.js - no external dependencies needed
 */
const fs = require('fs');
const path = require('path');

// Minimal valid PNG generator (creates a solid colored square)
function createPNG(size, r, g, b) {
    // PNG file structure
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);  // width
    ihdrData.writeUInt32BE(size, 4);  // height
    ihdrData.writeUInt8(8, 8);        // bit depth
    ihdrData.writeUInt8(2, 9);        // color type (RGB)
    ihdrData.writeUInt8(0, 10);       // compression
    ihdrData.writeUInt8(0, 11);       // filter
    ihdrData.writeUInt8(0, 12);       // interlace
    const ihdr = createChunk('IHDR', ihdrData);
    
    // IDAT chunk - image data
    const rawData = [];
    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter byte (none)
        for (let x = 0; x < size; x++) {
            // Create a simple gradient circle icon
            const cx = size / 2;
            const cy = size / 2;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = size * 0.4;
            
            if (dist < radius) {
                // Inside circle - gradient from light to dark
                const factor = 1 - (dist / radius) * 0.3;
                rawData.push(Math.round(r * factor));
                rawData.push(Math.round(g * factor));
                rawData.push(Math.round(b * factor));
            } else if (dist < radius + 2) {
                // Border
                rawData.push(Math.round(r * 0.6));
                rawData.push(Math.round(g * 0.6));
                rawData.push(Math.round(b * 0.6));
            } else {
                // Outside - white background
                rawData.push(255);
                rawData.push(255);
                rawData.push(255);
            }
        }
    }
    
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const idat = createChunk('IDAT', compressed);
    
    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));
    
    return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    
    return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 implementation
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = [];
    
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// WhatsApp green-blue color (matching the brand)
const R = 59, G = 130, B = 246; // Blue-600

sizes.forEach(size => {
    const png = createPNG(size, R, G, B);
    const filePath = path.join(iconsDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`✅ Created: icon-${size}x${size}.png`);
});

// Create favicon (16x16)
const favicon = createPNG(16, R, G, B);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'), favicon);
console.log('✅ Created: favicon.ico');

console.log('\n🎉 All icons generated successfully!');
