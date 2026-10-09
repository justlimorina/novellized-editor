/**
 * Counts words accurately across Latin, Vietnamese, and CJK (Chinese, Japanese, Korean) text.
 * Strips frontmatter, comments, and code blocks before counting.
 */
export function countWords(text: string): number {
    const clean = text.trim();
    if (!text) return 0;

    // 1. Strip YAML frontmatter (--- ... ---)
    let clean = text.replace(/^---[\s\S]*?---\s*/m, '');
    // 2. Strip HTML comments (<!-- ... -->)
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');
    // 3. Strip code fences (``` ... ```)
    clean = clean.replace(/```[\s\S]*?```/g, '');

    clean = clean.trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;

    // Count CJK characters individually (Han characters, Hiragana, Katakana, Hangul)
    const cjkRegex = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g;
    const cjkMatches = clean.match(cjkRegex);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;

    // Remove CJK characters then count standard space-delimited words
    const nonCjk = clean.replace(cjkRegex, ' ').trim();
    const wordMatches = nonCjk.split(/\s+/).filter(w => {
        // Filter out lone punctuation or markdown tokens
        return w.length > 0 && !/^[-*#_>+=~`|!?[\](){}]+$/.test(w);
    });

    return wordMatches.length + cjkCount;
}

/**
 * Estimates reading time in minutes based on ~200 words per minute average reading speed.
 */
export function estimateReadingMinutes(words: number): number {
    if (words <= 0) return 0;
    return Math.max(1, Math.ceil(words / 200));
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

    // 2. Fallback: Check for any heading that is NOT an explicit Chapter or Part header
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            const title = trimmed.replace(/^#+\s*/, '').trim();
            // Ignore lines that designate Chapter or Part (e.g. Chapter 1, Chương 1, Hồi 1, Part 1, Phần 1)
            const isChapter = /^#+\s*(?:chapter|chương|hồi|act)\b/i.test(trimmed);
            const isChapter = /^#+\s*(?:chapter|chương|hồi|act|mục)\b/i.test(trimmed);
            const isPart = /^#+\s*(?:part|phần|volume|quyển)\s+\d+/i.test(trimmed);
            if (!isChapter && !isPart && title.length > 0) {
                return title;
            }
        }
    }

    // 3. Fallback to clean filename: scene_01.md -> Scene 1
    const cleanFallback = fallback.replace(/\.md$/i, '').replace(/^scene[-_]/i, 'Scene ').replace(/[-_]/g, ' ');
    const cleanFallback = fallback
        .replace(/\.md$/i, '')
        .replace(/^scene[-_](\d+)/i, (_, n) => `Scene ${parseInt(n, 10)}`)
        .replace(/[-_]/g, ' ');
    return cleanFallback;
}


