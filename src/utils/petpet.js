const { createCanvas, loadImage } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');

/**
 * Generates a petpet GIF from a source image.
 * @param {string | Buffer} source - The source image URL or Buffer.
 * @param {number} speed - Speed multiplier (standard is 1).
 * @param {number} squeeze - Squeeze intensity (standard is 1).
 * @param {number} canvasSize - Size of the generated GIF (default 112).
 * @returns {Promise<Buffer>} - The generated GIF as a Buffer.
 */
async function generatePetPet(source, speed = 1, squeeze = 1, canvasSize = 112) {
    const framesCount = 5;
    const baseDelay = 60; // ms
    const delay = Math.max(10, Math.floor(baseDelay / speed));

    const canvas = createCanvas(canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');

    const encoder = new GIFEncoder(canvasSize, canvasSize);
    encoder.start();
    encoder.setRepeat(0); // loop
    encoder.setDelay(delay);
    encoder.setTransparent(0x000000);

    const avatar = await loadImage(source);
    
    // Hand frames: fire mode if speed is 4, otherwise normal
    const isFire = speed >= 4.0;
    const framePrefix = isFire ? 'fire' : '';
    
    const hands = [];
    for (let i = 0; i < framesCount; i++) {
        const framePath = path.join(process.cwd(), 'assets', 'petpet', `${framePrefix}${i}.png`);
        try {
            hands.push(await loadImage(framePath));
        } catch (err) {
            console.error(`Failed to load frame ${framePath}, falling back to default.`);
            hands.push(await loadImage(path.join(process.cwd(), 'assets', 'petpet', `${i}.png`)));
        }
    }

    // Original Avatar transforms at 112x112 with squeeze=1
    const originalTransforms = [
        [14, 20, 98, 98],
        [12, 33, 101, 85],
        [8, 40, 110, 76],
        [10, 33, 102, 84],
        [12, 20, 98, 98]
    ];

    const base = originalTransforms[0];
    const scale = canvasSize / 112;

    for (let i = 0; i < framesCount; i++) {
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        const orig = originalTransforms[i];
        
        // Calculate dimensions relative to the target canvas size
        const x = (base[0] + (orig[0] - base[0]) * squeeze) * scale;
        const y = (base[1] + (orig[1] - base[1]) * squeeze) * scale;
        const w = (base[2] + (orig[2] - base[2]) * squeeze) * scale;
        const h = (base[3] + (orig[3] - base[3]) * squeeze) * scale;

        // Draw avatar (square)
        ctx.drawImage(avatar, x, y, Math.max(1, w), Math.max(1, h));

        // Draw hand scaled to canvasSize
        ctx.drawImage(hands[i], 0, 0, canvasSize, canvasSize);

        encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
}

module.exports = { generatePetPet };
