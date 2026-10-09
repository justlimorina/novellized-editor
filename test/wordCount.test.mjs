import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, estimateReadingMinutes, extractSceneTitle } from '../src/wordCount.ts';

test('countWords: accurately counts Latin words', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   '), 0);
    assert.equal(countWords('The quick brown fox jumps over the lazy dog.'), 9);
});

test('countWords: accurately counts Vietnamese words with accents', () => {
    const text = 'Mặt trời đã lặn xuống sau rặng tre đầu làng, bóng tối dần bao phủ.';
    assert.equal(countWords(text), 15);
});

test('countWords: accurately counts CJK characters (Chinese, Japanese, Korean)', () => {
    const mixed = '東京 晴れ beautiful day';
    assert.equal(countWords(mixed), 6);

    const chinese = '天地玄黄宇宙洪荒';
    assert.equal(countWords(chinese), 8);
});

test('countWords: strips YAML frontmatter and HTML comments before counting', () => {
    const raw = `---
title: My Chapter
author: Jane Doe
tags: [fiction, fantasy]
---

<!-- Remember to revise this paragraph later -->
This is the real prose.
`;
    assert.equal(countWords(raw), 5);
});

test('estimateReadingMinutes: calculates correct reading duration', () => {
    assert.equal(estimateReadingMinutes(0), 0);
    assert.equal(estimateReadingMinutes(100), 1);
    assert.equal(estimateReadingMinutes(200), 1);
    assert.equal(estimateReadingMinutes(450), 3);
});

test('extractSceneTitle: extracts title from H3 heading', () => {
    const markdown = `# Chapter 1\n\n### The Midnight Heist\n\nIt was a dark night.`;
    assert.equal(extractSceneTitle(markdown, 'scene_01.md'), 'The Midnight Heist');
});

test('extractSceneTitle: falls back to formatted filename when no scene heading', () => {
    const markdown = `Just some paragraph without headings.`;
    assert.equal(extractSceneTitle(markdown, 'scene_03.md'), 'Scene 3');
});
