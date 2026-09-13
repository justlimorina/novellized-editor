import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import Focus from '@tiptap/extension-focus';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

let editor: Editor | null = null;
let isSettingContent = false;
let debounceTimer: any = null;

// UI Elements
const statsEl = document.getElementById('stats');
const btnToggleRaw = document.getElementById('btn-toggle-raw');
const btnToggleFocus = document.getElementById('btn-toggle-focus');
const btnToggleTypewriter = document.getElementById('btn-toggle-typewriter');
const btnToggleDialogue = document.getElementById('btn-toggle-dialogue');
const btnTakeSnapshot = document.getElementById('btn-take-snapshot');
const bubbleMenuEl = document.getElementById('bubble-menu');
const mentionDropdownEl = document.getElementById('mention-dropdown');
const entityTooltipEl = document.getElementById('entity-tooltip');

// Preferences & Entities State
const savedState = vscode.getState() || {};
let focusModeEnabled = savedState.focusModeEnabled !== undefined ? savedState.focusModeEnabled : true;
let typewriterEnabled = savedState.typewriterEnabled !== undefined ? savedState.typewriterEnabled : true;
let dialogueHighlightEnabled = savedState.dialogueHighlightEnabled !== undefined ? savedState.dialogueHighlightEnabled : false;

let knownCharacters: Array<{ name: string; summary?: string }> = [];
let knownWorldbuilding: Array<{ name: string; summary?: string }> = [];

function savePreferences() {
    vscode.setState({
        ...vscode.getState(),
        focusModeEnabled,
        typewriterEnabled,
        dialogueHighlightEnabled
    });
}

function applyFocusMode(enabled: boolean) {
    focusModeEnabled = enabled;
    if (focusModeEnabled) {
        document.body.classList.add('focus-mode-active');
        if (btnToggleFocus) {
            btnToggleFocus.classList.add('active');
            btnToggleFocus.textContent = '🎯 Focus: ON';
        }
    } else {
        document.body.classList.remove('focus-mode-active');
        if (btnToggleFocus) {
            btnToggleFocus.classList.remove('active');
            btnToggleFocus.textContent = '🎯 Focus: OFF';
        }
    }
    savePreferences();
}

function applyTypewriterMode(enabled: boolean) {
    typewriterEnabled = enabled;
    if (typewriterEnabled) {
        if (btnToggleTypewriter) {
            btnToggleTypewriter.classList.add('active');
            btnToggleTypewriter.textContent = '📜 Typewriter: ON';
        }
    } else {
        if (btnToggleTypewriter) {
            btnToggleTypewriter.classList.remove('active');
            btnToggleTypewriter.textContent = '📜 Typewriter: OFF';
        }
    }
    savePreferences();
}

function applyDialogueMode(enabled: boolean) {
    dialogueHighlightEnabled = enabled;
    if (dialogueHighlightEnabled) {
        document.body.classList.add('dialogue-mode-active');
        if (btnToggleDialogue) {
            btnToggleDialogue.classList.add('active');
            btnToggleDialogue.textContent = '💬 Dialogue: ON';
        }
    } else {
        document.body.classList.remove('dialogue-mode-active');
        if (btnToggleDialogue) {
            btnToggleDialogue.classList.remove('active');
            btnToggleDialogue.textContent = '💬 Dialogue: OFF';
        }
    }
    savePreferences();
    if (editor) {
        editor.view.dispatch(editor.state.tr);
    }
}

// Attach UI Event Listeners
if (btnToggleRaw) {
    btnToggleRaw.addEventListener('click', () => {
        vscode.postMessage({ type: 'requestRawMode' });
    });
}

if (btnToggleFocus) {
    btnToggleFocus.addEventListener('click', () => {
        applyFocusMode(!focusModeEnabled);
    });
}

if (btnToggleTypewriter) {
    btnToggleTypewriter.addEventListener('click', () => {
        applyTypewriterMode(!typewriterEnabled);
    });
}

if (btnToggleDialogue) {
    btnToggleDialogue.addEventListener('click', () => {
        applyDialogueMode(!dialogueHighlightEnabled);
    });
}

if (btnTakeSnapshot) {
    btnTakeSnapshot.addEventListener('click', () => {
        vscode.postMessage({ type: 'takeSnapshot' });
    });
}

// Initialize mode states
applyFocusMode(focusModeEnabled);
applyTypewriterMode(typewriterEnabled);
applyDialogueMode(dialogueHighlightEnabled);

function updateStats(text: string) {
    if (!statsEl) return;
    const cleanText = text.trim();
    const words = cleanText.length === 0 ? 0 : cleanText.split(/\s+/).filter(Boolean).length;
    const chars = cleanText.length;
    const readingMinutes = Math.max(1, Math.ceil(words / 200));
    const readingStr = words === 0 ? '0 min read' : `~${readingMinutes} min read`;
    statsEl.textContent = `${words.toLocaleString()} words • ${chars.toLocaleString()} characters • ${readingStr}`;
}

function getMarkdownFromEditor(ed: Editor): string {
    if ((ed.storage as any).markdown) {
        return (ed.storage as any).markdown.getMarkdown();
    }
    return ed.getText();
}

function handleTypewriterScroll(ed: Editor) {
    if (!typewriterEnabled || !ed.isFocused) return;
    try {
        const { from } = ed.state.selection;
        const coords = ed.view.coordsAtPos(from);
        if (!coords) return;

        // Golden reading ratio: ~42% from top of viewport
        const targetY = window.innerHeight * 0.42;
        const currentY = (coords.top + coords.bottom) / 2;
        const diff = currentY - targetY;

        if (Math.abs(diff) > 15) {
            window.scrollBy({
                top: diff,
                behavior: 'smooth'
            });
        }
    } catch {
        // Ignore pos resolution errors during transition
    }
}

// ProseMirror Decoration Plugin for Non-Destructive Dialogue Highlighting
const DialogueHighlightExtension = Extension.create({
    name: 'dialogueHighlight',
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('dialogueHighlightPlugin'),
                props: {
                    decorations(state) {
                        if (!dialogueHighlightEnabled) return DecorationSet.empty;
                        const decorations: Decoration[] = [];
                        const quoteRegex = /(?:“[^”]*”|"([^"]*)"|「[^」]*」)/g;
                        const dashRegex = /^[—–-]\s+/;

                        state.doc.descendants((node, pos) => {
                            if (node.isText && node.text) {
                                let match;
                                while ((match = quoteRegex.exec(node.text)) !== null) {
                                    const from = pos + match.index;
                                    const to = from + match[0].length;
                                    decorations.push(Decoration.inline(from, to, { class: 'prose-dialogue' }));
                                }
                            } else if (node.isBlock && node.textContent && dashRegex.test(node.textContent)) {
                                decorations.push(Decoration.inline(pos + 1, pos + node.nodeSize - 1, { class: 'prose-dialogue' }));
                            }
                        });

                        return DecorationSet.create(state.doc, decorations);
                    }
                }
            })
        ];
    }
});

// Entity Mentions Autocomplete State
let selectedMentionIndex = 0;
let currentMentionMatches: any[] = [];
let currentMentionType: 'character' | 'worldbuilding' = 'character';
let currentMentionRange: { from: number; to: number } | null = null;

function hideMentionDropdown() {
    if (mentionDropdownEl) {
        mentionDropdownEl.style.display = 'none';
        mentionDropdownEl.innerHTML = '';
    }
    currentMentionMatches = [];
    currentMentionRange = null;
}

function showMentionDropdown(matches: any[], type: 'character' | 'worldbuilding', ed: Editor, rangeFrom: number, rangeTo: number) {
    if (!mentionDropdownEl) return;
    currentMentionMatches = matches;
    currentMentionType = type;
    currentMentionRange = { from: rangeFrom, to: rangeTo };
    selectedMentionIndex = 0;

    const coords = ed.view.coordsAtPos(rangeTo);
    if (coords) {
        mentionDropdownEl.style.left = `${Math.min(window.innerWidth - 260, Math.max(10, coords.left))}px`;
        mentionDropdownEl.style.top = `${coords.bottom + 8}px`;
    }

    renderMentionItems(ed);
    mentionDropdownEl.style.display = 'block';
}

function renderMentionItems(ed: Editor) {
    if (!mentionDropdownEl) return;
    mentionDropdownEl.innerHTML = '';
    const icon = currentMentionType === 'character' ? '👤' : '🌍';

    currentMentionMatches.slice(0, 6).forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = `mention-item ${idx === selectedMentionIndex ? 'selected' : ''}`;
        div.innerHTML = `
            <span class="entity-icon">${icon}</span>
            <span class="entity-name">${item.name}</span>
            <span class="entity-role">${item.summary || (currentMentionType === 'character' ? 'Character' : 'Lore')}</span>
        `;

        div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            insertMention(item.name, ed);
        });

        mentionDropdownEl.appendChild(div);
    });
}

function insertMention(name: string, ed: Editor) {
    if (!currentMentionRange) return;
    const insertion = currentMentionType === 'character' ? name : `[[${name}]]`;
    ed.chain()
        .focus()
        .deleteRange({ from: currentMentionRange.from, to: currentMentionRange.to })
        .insertContent(insertion + ' ')
        .run();
    hideMentionDropdown();
}

function checkMentions(ed: Editor) {
    if (!mentionDropdownEl) return;
    const { from, empty } = ed.state.selection;
    if (!empty) {
        hideMentionDropdown();
        return;
    }

    const textBefore = ed.state.doc.textBetween(Math.max(0, from - 35), from, '\n', '\0');

    const matchAt = textBefore.match(/@([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF\s]{0,20})$/);
    const matchBracket = textBefore.match(/\[\[([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF\s]{0,25})$/);

    if (matchAt && knownCharacters.length > 0) {
        const query = matchAt[1].toLowerCase().trim();
        const filtered = knownCharacters.filter(c => c.name.toLowerCase().includes(query));
        if (filtered.length > 0) {
            showMentionDropdown(filtered, 'character', ed, from - matchAt[0].length, from);
            return;
        }
    } else if (matchBracket && knownWorldbuilding.length > 0) {
        const query = matchBracket[1].toLowerCase().trim();
        const filtered = knownWorldbuilding.filter(w => w.name.toLowerCase().includes(query));
        if (filtered.length > 0) {
            showMentionDropdown(filtered, 'worldbuilding', ed, from - matchBracket[0].length, from);
            return;
        }
    }

    hideMentionDropdown();
}

// Entity Hover Tooltip Inspector
function setupEntityHoverTooltips() {
    if (!entityTooltipEl) return;

    let hoverTimer: any = null;

    document.addEventListener('mousemove', (e) => {
        if (!editor || mentionDropdownEl?.style.display === 'block') {
            entityTooltipEl.style.display = 'none';
            return;
        }

        const target = e.target as HTMLElement;
        if (!target || !target.closest('.novellized-content')) {
            entityTooltipEl.style.display = 'none';
            return;
        }

        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
            const point = { left: e.clientX, top: e.clientY };
            const pos = editor?.view.posAtCoords(point);
            if (!pos) {
                entityTooltipEl.style.display = 'none';
                return;
            }

            const $pos = editor!.state.doc.resolve(pos.pos);
            const parentText = $pos.parent.textContent;
            if (!parentText) {
                entityTooltipEl.style.display = 'none';
                return;
            }

            // Check if any character or worldbuilding term is in text around cursor
            const matchedChar = knownCharacters.find(c => parentText.includes(c.name));
            const matchedWorld = knownWorldbuilding.find(w => parentText.includes(w.name));

            const matched = matchedChar ? { ...matchedChar, type: 'character' } : (matchedWorld ? { ...matchedWorld, type: 'worldbuilding' } : null);

            if (matched) {
                const icon = matched.type === 'character' ? '👤' : '🌍';
                entityTooltipEl.innerHTML = `
                    <div class="tooltip-header">
                        <span>${icon}</span>
                        <strong>${matched.name}</strong>
                    </div>
                    <div class="tooltip-body">${matched.summary || 'Entity details from Story Bible'}</div>
                `;
                entityTooltipEl.style.left = `${Math.min(window.innerWidth - 300, e.clientX + 14)}px`;
                entityTooltipEl.style.top = `${e.clientY + 18}px`;
                entityTooltipEl.style.display = 'block';
            } else {
                entityTooltipEl.style.display = 'none';
            }
        }, 300);
    });
}

function setupBubbleMenuActions(ed: Editor) {
    if (!bubbleMenuEl) return;

    const buttons = bubbleMenuEl.querySelectorAll<HTMLButtonElement>('button[data-command]');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.getAttribute('data-command');
            switch (cmd) {
                case 'bold':
                    ed.chain().focus().toggleBold().run();
                    break;
                case 'italic':
                    ed.chain().focus().toggleItalic().run();
                    break;
                case 'strike':
                    ed.chain().focus().toggleStrike().run();
                    break;
                case 'h1':
                    ed.chain().focus().toggleHeading({ level: 1 }).run();
                    break;
                case 'h2':
                    ed.chain().focus().toggleHeading({ level: 2 }).run();
                    break;
                case 'h3':
                    ed.chain().focus().toggleHeading({ level: 3 }).run();
                    break;
                case 'p':
                    ed.chain().focus().setParagraph().run();
                    break;
                case 'blockquote':
                    ed.chain().focus().toggleBlockquote().run();
                    break;
                case 'divider':
                    ed.chain().focus().setHorizontalRule().run();
                    break;
            }
            updateBubbleMenuButtons(ed);
        });
    });
}

function updateBubbleMenuButtons(ed: Editor) {
    if (!bubbleMenuEl) return;
    const checkMap: Record<string, boolean> = {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        strike: ed.isActive('strike'),
        h1: ed.isActive('heading', { level: 1 }),
        h2: ed.isActive('heading', { level: 2 }),
        h3: ed.isActive('heading', { level: 3 }),
        p: ed.isActive('paragraph'),
        blockquote: ed.isActive('blockquote')
    };

    const buttons = bubbleMenuEl.querySelectorAll<HTMLButtonElement>('button[data-command]');
    buttons.forEach(btn => {
        const cmd = btn.getAttribute('data-command');
        if (cmd && checkMap[cmd] !== undefined) {
            if (checkMap[cmd]) {
                btn.classList.add('is-active');
            } else {
                btn.classList.remove('is-active');
            }
        }
    });
}

function initEditor(initialMarkdown: string) {
    const container = document.getElementById('editor-container');
    if (!container) return;

    editor = new Editor({
        element: container,
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3]
                }
            }),
            Markdown.configure({
                html: false,
                tightLists: true,
                bulletListMarker: '-',
                linkify: true,
                breaks: false
            }),
            Focus.configure({
                className: 'has-focus',
                mode: 'shallowest'
            }),
            DialogueHighlightExtension,
            ...(bubbleMenuEl ? [
                BubbleMenu.configure({
                    element: bubbleMenuEl,
                    tippyOptions: {
                        duration: 150,
                        placement: 'top'
                    }
                })
            ] : [])
        ],
        content: initialMarkdown,
        editorProps: {
            attributes: {
                class: 'novellized-content'
            }
        },
        onUpdate({ editor: currentEditor }) {
            if (isSettingContent) return;

            const text = currentEditor.getText();
            updateStats(text);
            handleTypewriterScroll(currentEditor);
            checkMentions(currentEditor);

            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(() => {
                const markdown = getMarkdownFromEditor(currentEditor);
                vscode.postMessage({
                    type: 'change',
                    text: markdown
                });
            }, 250);
        },
        onSelectionUpdate({ editor: currentEditor }) {
            updateBubbleMenuButtons(currentEditor);
            handleTypewriterScroll(currentEditor);
            checkMentions(currentEditor);
        }
    });

    setupBubbleMenuActions(editor);
    setupEntityHoverTooltips();

    // Update initial stats
    updateStats(editor.getText());
}

// Global Keyboard Navigation (Handles Ctrl+S and Mention navigation)
window.addEventListener('keydown', (e) => {
    // 1. Mention dropdown navigation
    if (mentionDropdownEl && mentionDropdownEl.style.display === 'block' && currentMentionMatches.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedMentionIndex = (selectedMentionIndex + 1) % currentMentionMatches.length;
            if (editor) renderMentionItems(editor);
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedMentionIndex = (selectedMentionIndex - 1 + currentMentionMatches.length) % currentMentionMatches.length;
            if (editor) renderMentionItems(editor);
            return;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (editor && currentMentionMatches[selectedMentionIndex]) {
                insertMention(currentMentionMatches[selectedMentionIndex].name, editor);
            }
            return;
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionDropdown();
            return;
        }
    }

    // 2. Ctrl+S / Cmd+S save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editor) {
            const markdown = getMarkdownFromEditor(editor);
            vscode.postMessage({
                type: 'save',
                text: markdown
            });
        }
    }
});

// Listen for messages from VS Code Host
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'init': {
            if (Array.isArray(message.characters)) {
                knownCharacters = message.characters;
            }
            if (Array.isArray(message.worldbuilding)) {
                knownWorldbuilding = message.worldbuilding;
            }

            if (!editor) {
                initEditor(message.text || '');
            } else {
                isSettingContent = true;
                editor.commands.setContent(message.text || '');
                isSettingContent = false;
                updateStats(editor.getText());
            }
            break;
        }
        case 'update': {
            if (editor && !editor.isFocused) {
                const currentMarkdown = getMarkdownFromEditor(editor);
                if (currentMarkdown !== message.text) {
                    isSettingContent = true;
                    editor.commands.setContent(message.text || '');
                    isSettingContent = false;
                    updateStats(editor.getText());
                }
            }
            break;
        }
    }
});

// Notify host that webview is ready
vscode.postMessage({ type: 'ready' });
