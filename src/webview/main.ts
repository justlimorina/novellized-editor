import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import Focus from '@tiptap/extension-focus';

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
const bubbleMenuEl = document.getElementById('bubble-menu');

// Preferences State
const savedState = vscode.getState() || {};
let focusModeEnabled = savedState.focusModeEnabled !== undefined ? savedState.focusModeEnabled : true; // Default ALWAYS ON
let typewriterEnabled = savedState.typewriterEnabled !== undefined ? savedState.typewriterEnabled : true; // Default ON

function savePreferences() {
    vscode.setState({
        ...vscode.getState(),
        focusModeEnabled,
        typewriterEnabled
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

// Initialize mode states
applyFocusMode(focusModeEnabled);
applyTypewriterMode(typewriterEnabled);

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
        }
    });

    setupBubbleMenuActions(editor);

    // Update initial stats
    updateStats(editor.getText());
}

// Global Keyboard Shortcuts (Ctrl+S / Cmd+S save)
window.addEventListener('keydown', (e) => {
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

