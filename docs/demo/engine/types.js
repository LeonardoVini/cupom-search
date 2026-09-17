/** Tipos centrais do domínio. */
export function evidenceKey(storeId, code) {
    return `${storeId}:${code.trim().toUpperCase()}`;
}
export function emptyEvidence(key) {
    return {
        key,
        reports: { worked: 0, failed: 0 },
        checkout: { success: 0, failure: 0 },
        lastSuccessAt: null,
        lastAttemptAt: null,
        discountSamples: [],
    };
}
