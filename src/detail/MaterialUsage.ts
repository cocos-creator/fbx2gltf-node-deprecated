
export interface MaterialUsage {
    hasTransparentVertex: boolean;
}

export type MaterialUsageKey = string;

export function generateMaterialUsageKey(usage: MaterialUsage): MaterialUsageKey {
    return `hasTransparentVertex: ${usage.hasTransparentVertex ? 1 : 0}`;
}

