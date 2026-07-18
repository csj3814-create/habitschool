export function scoreVideoFramePixels(pixelData) {
    if (!pixelData || pixelData.length < 16) return 0;

    let count = 0;
    let sum = 0;
    let sumSquares = 0;
    let min = 255;
    let max = 0;
    let visiblePixels = 0;

    for (let index = 0; index + 3 < pixelData.length; index += 4) {
        const alpha = Number(pixelData[index + 3] || 0);
        if (alpha < 16) continue;
        const red = Number(pixelData[index] || 0);
        const green = Number(pixelData[index + 1] || 0);
        const blue = Number(pixelData[index + 2] || 0);
        const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
        count += 1;
        sum += luminance;
        sumSquares += luminance * luminance;
        min = Math.min(min, luminance);
        max = Math.max(max, luminance);
        if (luminance >= 18) visiblePixels += 1;
    }

    if (!count) return 0;
    const mean = sum / count;
    const variance = Math.max(0, (sumSquares / count) - (mean * mean));
    const deviation = Math.sqrt(variance);
    const visibleRatio = visiblePixels / count;
    const range = max - min;

    // Android/Samsung decoders can briefly expose an almost-uniform black frame
    // even though loadeddata/seeked has fired. Never persist that frame as a poster.
    if (max < 24 || mean < 5 || visibleRatio < 0.025 || (deviation < 2.5 && range < 14)) {
        return 0;
    }

    return Math.round((visibleRatio * 1000) + (deviation * 10) + range + mean);
}

export function isRenderableVideoFramePixels(pixelData) {
    return scoreVideoFramePixels(pixelData) > 0;
}
