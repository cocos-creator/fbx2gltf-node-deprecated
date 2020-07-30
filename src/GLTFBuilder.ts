import * as glTFLib from './libglTF';

export class GLTFBuilder {
    private _bufferKeeps: Array<Array<{
        index: number;
        data: ArrayBuffer;
        align: number;
    }>> = [];

    public glTFRoot: {
        accessors: NonNullable<glTFLib.GlTf['accessors']>;
        animations: NonNullable<glTFLib.GlTf['animations']>;
        bufferViews: NonNullable<glTFLib.GlTf['bufferViews']>;
        images: NonNullable<glTFLib.GlTf['images']>;
        materials: NonNullable<glTFLib.GlTf['materials']>;
        meshes: NonNullable<glTFLib.GlTf['meshes']>;
        nodes: NonNullable<glTFLib.GlTf['nodes']>;
        samplers: NonNullable<glTFLib.GlTf['samplers']>;
        scenes: NonNullable<glTFLib.GlTf['scenes']>;
        skins: NonNullable<glTFLib.GlTf['skins']>;
        textures: NonNullable<glTFLib.GlTf['textures']>;
        extensionsUsed: NonNullable<glTFLib.GlTf['extensionsUsed']>;
    };

    /**
     * `undefined` means no image data attach.
     * String represents path.
     */
    public images: Array<undefined | string | {
        mimeType: string;
        data: Uint8Array;
    }> = [];

    constructor() {
        this.glTFRoot = {
            accessors: [],
            animations: [],
            bufferViews: [],
            images: [],
            materials: [],
            meshes: [],
            nodes: [],
            samplers: [],
            scenes: [],
            skins: [],
            textures: [],
            extensionsUsed: [],
        }
        this._bufferKeeps = [[]];
    }

    public useExtension(extensionName: string) {
        if (!this.glTFRoot.extensionsUsed.includes(extensionName)) {
            this.glTFRoot.extensionsUsed.push(extensionName);
        }
    }
    
    public createBufferView(byteLength: number, align: number, buffer: number) {
        const bufferView: glTFLib.BufferView = {
            buffer,
            byteLength,
        }
        const index = this.glTFRoot.bufferViews.length;
        this.glTFRoot.bufferViews.push(bufferView);
        const bufferViewData = new ArrayBuffer(byteLength);
        this._bufferKeeps[buffer].push({ data: bufferViewData, align, index });
        return {
            data: bufferViewData,
            bufferView,
            index,
        };
    }

    public addAccessor(glTFAccessor: glTFLib.Accessor) {
        const index = this.glTFRoot.accessors.length;
        this.glTFRoot.accessors.push(glTFAccessor);
        return index;
    }

    public addAnimation(glTFAnimation: glTFLib.Animation) {
        const index = this.glTFRoot.animations.length;
        this.glTFRoot.animations.push(glTFAnimation);
        return index;
    }

    public addImage(glTFImage: glTFLib.Image) {
        const index = this.glTFRoot.images.length;
        this.glTFRoot.images.push(glTFImage);
        return index;
    }

    public addMaterial(glTFMaterial: glTFLib.Material) {
        const index = this.glTFRoot.materials.length;
        this.glTFRoot.materials.push(glTFMaterial);
        return index;
    }

    public addMesh(glTFMesh: glTFLib.Mesh) {
        const index = this.glTFRoot.meshes.length;
        this.glTFRoot.meshes.push(glTFMesh);
        return index;
    }

    public addSkin(glTFSkin: glTFLib.Skin) {
        const index = this.glTFRoot.skins.length;
        this.glTFRoot.skins.push(glTFSkin);
        return index;
    }

    public addNode(glTFNode: glTFLib.Node) {
        const index = this.glTFRoot.nodes.length;
        this.glTFRoot.nodes.push(glTFNode);
        return index;
    }

    public addSampler(glTFSampler: glTFLib.Sampler) {
        const index = this.glTFRoot.samplers.length;
        this.glTFRoot.samplers.push(glTFSampler);
        return index;
    }

    public addScene(glTFScene: glTFLib.Scene) {
        const index = this.glTFRoot.scenes.length;
        this.glTFRoot.scenes.push(glTFScene);
        return index;
    }

    public addTexture(glTFTexture: glTFLib.Scene) {
        const index = this.glTFRoot.textures.length;
        this.glTFRoot.textures.push(glTFTexture);
        return index;
    }

    public build(options: {
        copyright?: string;
        generator?: string;
    }) {
        const document: glTFLib.GlTf = {
            asset: {
                version: '2.0',
                generator: options.generator,
                copyright: options.copyright,
            },
        };
        Object.assign(document, this.glTFRoot);
        // Clear empty root objects
        for (const key of Object.keys(document)) {
            const value = document[key];
            if (Array.isArray(value) && value.length === 0) {
                delete document[key];
            }
        }
        
        const nBuffers = this._bufferKeeps.length;
        document.buffers = new Array(nBuffers);
        const bufferStorages = new Array<Uint8Array>(nBuffers);
        for (let iBuffer = 0; iBuffer < nBuffers; ++iBuffer) {
            const bufferKeep = this._bufferKeeps[iBuffer];
            let bufferByteLength = 0;
            for (const bufferViewKeep of bufferKeep) {
                bufferByteLength += bufferViewKeep.data.byteLength;
            }
            const bufferStorage = new Uint8Array(bufferByteLength);
            let bufferOffset = 0;
            for (const bufferViewKeep of bufferKeep) {
                const bufferView = this.glTFRoot.bufferViews[bufferViewKeep.index];
                bufferView.byteOffset = bufferOffset;
                bufferView.buffer = iBuffer;
                bufferStorage.set(new Uint8Array(bufferViewKeep.data), bufferOffset);
                bufferOffset += bufferViewKeep.data.byteLength;
            }
            bufferStorages[iBuffer] = bufferStorage;
            const glTFBuffer: glTFLib.Buffer = {
                byteLength: bufferStorage.byteLength,
            };
            document.buffers[iBuffer] = glTFBuffer;

            // writeFileSync('out.bin', bufferData);
            // const bufferUri = './out.bin';
        }

        return {
            json: document,
            buffers: bufferStorages,
            images: this.images,
        };
    }
}
