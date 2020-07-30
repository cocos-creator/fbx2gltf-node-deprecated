import { GLTFBuilder } from './GLTFBuilder';
import fs from 'fs-extra';
import ps from 'path';
import { encodeArrayBufferToBase64, relativeUriBetweenPath } from './Util';

export async function write(
    glTF: ReturnType<GLTFBuilder['build']>,
    options: {
        outFile: string;
        embeddedBuffers: boolean;
        embeddedImageOperation: EmbeddedImageOperation;
        externalImageOperation: ExternalImageOperation;
    },
) {
    const {
        outFile,
        embeddedBuffers,
        embeddedImageOperation,
        externalImageOperation,
    } = options;

    const outDir = ps.dirname(outFile);

    if (glTF.json.images) {
        for (let iImage = 0; iImage < glTF.json.images.length; ++iImage) {
            const image = glTF.images[iImage];
            if (!image) {
                continue;
            }
            const glTFImage = glTF.json.images[iImage];

            const embed = (data: Uint8Array, mimeType: string) => {
                const dataUri = `data:${mimeType};base64,${encodeArrayBufferToBase64(data)}`
                glTFImage.uri = dataUri;
            };

            const copyAndReference = async (): Promise<string> => {
                let imageFileName: string;
                if (typeof image === 'string') {
                    imageFileName = ps.basename(image);
                } else {
                    const imageBaseName = glTFImage.name ?? `image-${iImage}`;
                    const imageExtName = getExtensionFromMimeType(image.mimeType);
                    imageFileName = `${imageBaseName}${imageExtName}`;
                    glTFImage.mimeType = image.mimeType;
                }
                const imageOutFile: string = ps.join(outDir, imageFileName);

                const imageUri = relativeUriBetweenPath(outFile, imageOutFile);
                glTFImage.uri = imageUri;

                await fs.ensureDir(ps.dirname(imageOutFile));
                return imageOutFile;
            };

            if (typeof image === 'string') {
                // external image
                switch (externalImageOperation) {
                    case ExternalImageOperation.embed:
                        {
                            let data: Uint8Array | null = null;
                            let mimeType: string;
                            try {
                                data = await fs.readFile(image);
                            } catch (err) {
                                console.warn(err);
                            }
                            if (data) {
                                mimeType = getMimeTypeFromExtension(ps.extname(image).toLowerCase());
                                embed(data, mimeType);
                            }
                        }
                        break;
                    case ExternalImageOperation.copyAndReference:
                        {
                            const imageOutFile = await copyAndReference();
                            try {
                                await fs.copyFile(image, imageOutFile);
                            } catch (err) {
                                console.warn(err);
                            }
                        }
                        break;
                    case ExternalImageOperation.reference:
                    default:
                        {
                            const imageUri = relativeUriBetweenPath(outFile, image);
                            glTFImage.uri = imageUri;
                        }
                        break;
                }
            } else {
                // embedded image
                switch (embeddedImageOperation) {
                    case EmbeddedImageOperation.embed:
                        {
                            embed(image.data, image.mimeType);
                        }
                        break;
                    case EmbeddedImageOperation.copyAndReference:
                    default:
                        {
                            const imageOutFile = await copyAndReference();
                            await fs.writeFile(imageOutFile, image.data);
                        }
                }
            }
        }
    }

    if (glTF.json.buffers) {
        const nBuffers = glTF.json.buffers.length;
        if (embeddedBuffers) {
            for (let iBuffer = 0; iBuffer < nBuffers; ++iBuffer) {
                const dataUri = `data:application/octet-stream;base64,${encodeArrayBufferToBase64(glTF.buffers[iBuffer])}`;
                glTF.json.buffers[iBuffer].uri = dataUri;
            }
        } else {
            const glTFOutBaseName = ps.basename(outFile, ps.extname(outFile));
            const multiBuffer = glTF.json.buffers.length > 1;
            await Promise.all(glTF.json.buffers.map(async (glTFBuffer, bufferIndex) => {
                const bufferOutPath = ps.join(
                    ps.dirname(outFile), 
                    multiBuffer ? `${glTFOutBaseName}-${bufferIndex}.bin` : `${glTFOutBaseName}.bin`,
                    );
                const bufferUri = relativeUriBetweenPath(outFile, bufferOutPath);
                glTFBuffer.uri = bufferUri;
                await fs.ensureDir(ps.dirname(bufferOutPath));
                await fs.writeFile(bufferOutPath, glTF.buffers[bufferIndex]);
            }));
        }
    }

    await fs.ensureDir(ps.dirname(outFile));
    await fs.writeJson(outFile, glTF.json, {spaces: 2});
}

export enum EmbeddedImageOperation {
    /**
     * Embed that image file.
     */
    embed,

    /**
     * Copy that image file and reference.
     */
    copyAndReference,
}

export enum ExternalImageOperation {
    /**
     * Embed that image file.
     */
    embed,

    /**
     * Directly reference that image file.
     */
    reference,

    /**
     * Copy that image file and reference.
     */
    copyAndReference,
}

function getMimeTypeFromExtension(extName: string) {
    let mimeType: string;
    switch (extName) {
        case 'jpg':
        case 'jpeg':
            mimeType = 'image/jpeg';
            break;
        case 'png':
            mimeType = 'image/png';
            break;
        default:
            mimeType = extName.startsWith('.') ? `image/${extName.substr(1)}`: extName;
            break;
    }
    return mimeType;
}

function getExtensionFromMimeType(mimeType: string) {
    switch (mimeType) {
        case 'image/jpeg': return '.jpg';
        default: {
            const prefix = 'image/';
            const extNameNoDot = mimeType.startsWith(prefix) ? mimeType.substr(prefix.length) : mimeType;
            return `.${extNameNoDot}`;
        }
    }
}