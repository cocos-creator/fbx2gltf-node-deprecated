import URI from 'urijs';
import nodeUrl from 'url';

export function encodeArrayBufferToBase64(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64');
}

export function relativeUriBetweenPath(from: string, to: string) {
    const fromUri = new URI(nodeUrl.pathToFileURL(from).href);
    const toUri = new URI(nodeUrl.pathToFileURL(to).href);
    return toUri.relativeTo(fromUri.href()).href();
}