export function countWords(text: string): number {
    const clean = text.trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
}

export function extractSceneTitle(content: string, fallback: string): string {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            const title = trimmed.replace(/^#+\s*/, '').trim();
            if (title.length > 0) {
                return title;
            }
        }
    }
    return fallback;
}
