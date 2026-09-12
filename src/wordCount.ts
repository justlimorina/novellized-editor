export function countWords(text: string): number {
    const clean = text.trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
}

export function extractSceneTitle(content: string, fallback: string): string {
    const lines = content.split('\n');

    // 1. Prioritize H3 headings (standard scene heading in Novellized: ### Scene 1: ...)
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
            const title = trimmed.replace(/^###\s*/, '').trim();
            if (title.length > 0) {
                return title;
            }
        }
    }

    // 2. Fallback: Check for any heading that is NOT a Part or Chapter heading
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            const title = trimmed.replace(/^#+\s*/, '').trim();
            // Ignore Part and Chapter headers
            if (!/^(?:part|chapter|chương|hồi|volume|tập)\b/i.test(title) && title.length > 0) {
                return title;
            }
        }
    }

    // 3. Fallback to clean filename: scene_01.md -> Scene 1
    const cleanFallback = fallback.replace(/\.md$/i, '').replace(/^scene[-_]/i, 'Scene ').replace(/[-_]/g, ' ');
    return cleanFallback;
}

