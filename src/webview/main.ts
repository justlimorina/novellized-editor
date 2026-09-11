import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

declare function acquireVsCodeApi(): {
    postMessage: (message: any) => void;
    getState: () => any;
    setState: (state: any) => void;
};

const vscode = acquireVsCodeApi();

let editor: Editor | null = null;
let isSettingContent = false;
let debounceTimer: any = null;

const statsEl = document.getElementById('stats');
const btnToggleRaw = document.getElementById('btn-toggle-raw');

if (btnToggleRaw) {
    btnToggleRaw.addEventListener('click', () => {
        vscode.postMessage({ type: 'requestRawMode' });
    });
}

function updateStats(text: string) {
    if (!statsEl) return;
    const cleanText = text.trim();
    const words = cleanText.length === 0 ? 0 : cleanText.split(/\s+/).filter(Boolean).length;
    const chars = cleanText.length;
    statsEl.textContent = `${words.toLocaleString()} words • ${chars.toLocaleString()} characters`;
}

function getMarkdownFromEditor(ed: Editor): string {
    // tiptap-markdown provides getMarkdown() on editor.storage.markdown
    if ((ed.storage as any).markdown) {
        return (ed.storage as any).markdown.getMarkdown();
    }
    return ed.getText();
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
            })
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
        }
    });

    // Update initial stats
    updateStats(editor.getText());
}

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

