
export const glTFExtensionFbxSdkTextureInfoName = 'COCOS_FBX_SDK_texture_info';

export interface GLTFExtensionFbxSdkTextureInfo {
    fileName: string;
    relativeFileName: string;
}

export const glTFExtensionFbxSdkSkinName = 'COCOS_FBX_SDK_skin';

export interface GLTFExtensionFbxSdkSkin {
    /**
     * Decides which method will be used to do the skinning. See `FBXSkin.EType`.
     * If not present, means `FBXSkin.eLinear`.
     */
    type?: 'rigid' | 'dual_quaternion' | 'blend';
}
