/**
 * Safe date parsing utility designed to prevent invalid date errors (NaN) in Safari.
 * Safari is extremely strict with date formats, especially with dashes (-) and spaces instead of 'T'.
 */
export const safeParseDate = (val: any): Date => {
    if (val === null || val === undefined || val === '') {
        return new Date();
    }
    if (val instanceof Date) {
        return val;
    }
    if (typeof val === 'number') {
        return new Date(val);
    }
    if (typeof val === 'string') {
        let cleaned = val.trim();
        
        // Check if the string is just a numeric timestamp
        if (/^\d+$/.test(cleaned)) {
            return new Date(parseInt(cleaned, 10));
        }
        
        // For format: YYYY-MM-DD HH:mm:ss
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?/.test(cleaned)) {
            cleaned = cleaned.replace(/\s+/, 'T');
        } 
        // For format: YYYY-MM-DD
        else if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
            cleaned = cleaned.replace(/-/g, '/');
        }

        let d = new Date(cleaned);
        if (!isNaN(d.getTime())) {
            return d;
        }

        // Try replacing dashes with slashes (highly compatible with Safari)
        const withSlashes = cleaned.replace(/-/g, '/');
        d = new Date(withSlashes);
        if (!isNaN(d.getTime())) {
            return d;
        }
    }

    const fallback = new Date(val);
    return isNaN(fallback.getTime()) ? new Date() : fallback;
};

/**
 * Safe replacement for new Date().toISOString() or matching date parsing for formatted local outputs.
 */
export const safeGetTime = (val: any): number => {
    return safeParseDate(val).getTime();
};
