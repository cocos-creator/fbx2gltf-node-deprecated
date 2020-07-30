
export function encodeArrayBufferToBase64(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64');
}