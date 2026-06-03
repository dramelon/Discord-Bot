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
    // Dynamically scale multiplier to keep frame delay >= 20ms and prevent GIF slowdown bug
    let multiplier = 3;
    if (speed > 1.0) {
        multiplier = 2;
    }
    if (speed > 1.5) {
        multiplier = 1;
    }

    const framesCount = 5;
    const baseDelay = 60; // ms
    const delay = Math.max(20, Math.floor((baseDelay / speed) / multiplier));

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
    const totalFrames = framesCount * multiplier;
    const offset = multiplier; // Delay the avatar squeeze by 1 asset frame

    for (let f = 0; f < totalFrames; f++) {
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        const indexH = Math.floor(f / multiplier);
        
        // Calculate the shifted frame index for the avatar squeeze
        const avatarFrame = (f - offset + totalFrames) % totalFrames;
        const indexA = Math.floor(avatarFrame / multiplier);
        const indexB = (indexA + 1) % framesCount;
        const t = (avatarFrame % multiplier) / multiplier;

        const origA = originalTransforms[indexA];
        const origB = originalTransforms[indexB];
        
        // Linearly interpolate the transform values
        const xA = base[0] + (origA[0] - base[0]) * squeeze;
        const yA = base[1] + (origA[1] - base[1]) * squeeze;
        const wA = base[2] + (origA[2] - base[2]) * squeeze;
        const hA = base[3] + (origA[3] - base[3]) * squeeze;

        const xB = base[0] + (origB[0] - base[0]) * squeeze;
        const yB = base[1] + (origB[1] - base[1]) * squeeze;
        const wB = base[2] + (origB[2] - base[2]) * squeeze;
        const hB = base[3] + (origB[3] - base[3]) * squeeze;

        const x = ((1 - t) * xA + t * xB) * scale;
        const y = ((1 - t) * yA + t * yB) * scale;
        const w = ((1 - t) * wA + t * wB) * scale;
        const h = ((1 - t) * hA + t * hB) * scale;

        // Draw avatar (square)
        ctx.drawImage(avatar, x, y, Math.max(1, w), Math.max(1, h));

        // Draw hand scaled to canvasSize
        ctx.drawImage(hands[indexH], 0, 0, canvasSize, canvasSize);

        encoder.addFrame(ctx);
    }

    encoder.finish();
    return encoder.out.getData();
}

module.exports = { generatePetPet };
