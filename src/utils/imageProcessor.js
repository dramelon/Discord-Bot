const { loadImage, createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { request } = require('undici');
const { filetypemime } = require('magic-bytes.js');

/**
 * Downloads and processes an image based on user requirements.
 * - Max 10MB
 * - Resize to 320x320 max (preserve aspect ratio)
 * - Static -> PNG
 * - Animated -> GIF (currently saving as-is if resizing is not possible)
 */
async function processImage(url, outputDir, namePrefix) {
    try {
        // Fetch the file
        const { body, headers } = await request(url);
        const contentLength = parseInt(headers['content-length'] || '0');

        if (contentLength > 10 * 1024 * 1024) {
            throw new Error('File size exceeds 10MB limit.');
        }

        const buffer = Buffer.from(await body.arrayBuffer());

        if (buffer.length > 10 * 1024 * 1024) {
             throw new Error('File size exceeds 10MB limit.');
        }

        // Detect file type
        const mimes = filetypemime(buffer);
        const mime = mimes.length > 0 ? mimes[0] : null;

        if (!mime || !mime.startsWith('image/')) {
            throw new Error('Invalid file type. Only images are allowed.');
        }

        const isGif = mime === 'image/gif';
        const extension = isGif ? 'gif' : 'png';
        const timestamp = Math.floor(Date.now() / 1000) - 1767225600;
        const filename = `${timestamp}.${extension}`;
        const outputPath = path.join(outputDir, filename);

        if (isGif) {
            // Currently saving GIFs as-is since we lack a pure-JS resizer in node_modules
            // and sharp/ffmpeg are missing.
            fs.writeFileSync(outputPath, buffer);
        } else {
            // Process static image with canvas
            const image = await loadImage(buffer);
            let width = image.width;
            let height = image.height;

            // Resize maintaining aspect ratio
            if (width > 320 || height > 320) {
                const ratio = Math.min(320 / width, 320 / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
            }

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, width, height);

            const pngBuffer = await canvas.encode('png');
            fs.writeFileSync(outputPath, pngBuffer);
        }

        return { filename, outputPath, mime };
    } catch (error) {
        console.error('Image Processing Error:', error);
        throw error;
    }
}

module.exports = { processImage };
