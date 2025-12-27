export const encodeId = (id: string): string => {
    if (!id) return "";
    try {
        // Base64 encode and make URL safe
        return btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
        return id;
    }
};

export const decodeId = (encoded: string): string => {
    if (!encoded) return "";
    try {
        // Re-add padding and decode
        let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return atob(base64);
    } catch (e) {
        return encoded;
    }
};
