import * as vscode from 'vscode';

interface NovelInitOptions {
    title: string;
    author: string;
    structure: 'full' | 'simple';
    pov: string;
    targetDir: vscode.Uri;
}

export async function createNewNovelProject(): Promise<void> {
    // 1. Determine target directory
    let targetWorkspaceUri: vscode.Uri | undefined;

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetWorkspaceUri = vscode.workspace.workspaceFolders[0].uri;
    } else {
        const pickedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder for Novel'
        });
        if (!pickedFolders || pickedFolders.length === 0) {
            return;
        }
        targetWorkspaceUri = pickedFolders[0];
    }

    // 2. Novel Title
    const title = await vscode.window.showInputBox({
        title: 'Novellized: Step 1/4',
        prompt: 'Enter your novel title',
        placeHolder: 'e.g., The Twilight Dynasty',
        validateInput: value => (!value || value.trim().length === 0) ? 'Novel title cannot be empty' : null
    });
    if (!title) return;

    // 3. Author Name / Pen Name
    const authorInput = await vscode.window.showInputBox({
        title: 'Novellized: Step 2/4',
        prompt: 'Enter author name or pen name',
        placeHolder: 'e.g., Arthur Vance (Default: Anonymous)'
    });
    if (authorInput === undefined) return;
    const author = authorInput.trim() || 'Anonymous';

    // 4. Project Structure
    const structurePick = await vscode.window.showQuickPick([
        {
            label: '$(layers) Full Structure (Part → Chapter → Scene)',
            description: 'part_01/chapter_01/scene_01.md',
            detail: 'Recommended for epic novels, fantasy series, or multi-arc stories.',
            value: 'full' as const
        },
        {
            label: '$(file-submodule) Compact Structure (Chapter → Scene)',
            description: 'chapter_01/scene_01.md',
            detail: 'Ideal for novellas, standalone books, or short fiction.',
            value: 'simple' as const
        }
    ], {
        title: 'Novellized: Step 3/4',
        placeHolder: 'Choose how to organize chapters and scenes'
    });
    if (!structurePick) return;

    // 5. Point of View (for AI Agent alignment)
    const povPick = await vscode.window.showQuickPick([
        {
            label: 'First Person ("I")',
            description: 'Direct emotional resonance and intimate character interiority'
        },
        {
            label: 'Third-Person Limited',
            description: 'Follows one POV character closely per scene (Modern fiction standard)'
        },
        {
            label: 'Third-Person Omniscient',
            description: 'Narrator possesses panoramic knowledge of all events, thoughts, and lore'
        }
    ], {
        title: 'Novellized: Step 4/4',
        placeHolder: 'Select primary narrative point of view (helps AI agents maintain consistency)'
    });
    if (!povPick) return;

    // Generate project files and folders
    await generateNovelScaffold({
        title: title.trim(),
        author,
        structure: structurePick.value,
        pov: povPick.label,
        targetDir: targetWorkspaceUri
    });
}

async function generateNovelScaffold(options: NovelInitOptions): Promise<void> {
    const encoder = new TextEncoder();

    let firstSceneRelativePath = '';
    let secondSceneRelativePath = '';

    if (options.structure === 'full') {
        firstSceneRelativePath = 'part_01/chapter_01/scene_01.md';
        secondSceneRelativePath = 'part_01/chapter_01/scene_02.md';
    } else {
        firstSceneRelativePath = 'chapter_01/scene_01.md';
        secondSceneRelativePath = 'chapter_01/scene_02.md';
    }

    const filesToCreate: Array<{ relativePath: string; content: string }> = [
        // 1. First Scene
        {
            relativePath: firstSceneRelativePath,
            content: `# Part 1: A New Beginning\n\n## Chapter 1: Winds of Change\n\n### Scene 1: The Threshold\n\nThe autumn wind stirred gently through the weathered trees outside the window, carrying the crisp chill of dawn and the faint scent of dry earth.\n\nThe traveler paused at the doorway, looking down the winding road that stretched into the distant hills. The journey ahead was long, fraught with perils and secrets yet to be uncovered.\n\n---\n\n"It is time to move on."\n`
        },
        // 2. Second Scene Template
        {
            relativePath: secondSceneRelativePath,
            content: `### Scene 2: An Unexpected Encounter\n\nThe road into town grew quieter as twilight settled over the cobblestones. Lanterns began to flicker to life along the old tavern row.\n\nNear the corner of the square, a shadowed figure waited patiently in the mist, as if expecting company...\n`
        },
        // 3. docs/characters.md (Character Bible for Author & AI)
        {
            relativePath: 'docs/characters.md',
            content: `# Character Bible: ${options.title}\n\n*This document is used by the author to track character details and by AI agents to maintain continuity and psychological depth.*\n\n---\n\n## 1. Protagonist\n\n* **Full Name**: [Character Name]\n* **Aliases / Titles**: \n* **Age**: \n* **Appearance & Identifying Marks**: \n* **Core Motivation**: What do they desire above all else?\n* **Internal Conflict & Flaws**: Deepest fear, emotional wounds, or past mistakes.\n* **Secrets**: What are they hiding from others?\n* **Key Relationships**: Allies, rivals, mentors.\n\n---\n\n## 2. Supporting Cast & Antagonists\n\n### [Character Name]\n* **Role**: (Companion / Mentor / Antagonist)\n* **Key Traits**: \n* **Motivation**: \n`
        },
        // 4. docs/worldbuilding.md (Worldbuilding Guide)
        {
            relativePath: 'docs/worldbuilding.md',
            content: `# Worldbuilding Guide: ${options.title}\n\n## 1. Setting & Atmosphere\n* **Era / Time Period**: (e.g., Medieval fantasy, Victorian mystery, Cyberpunk future)\n* **Geography & Key Locations**: Major realms, cities, geographical borders, climate.\n\n## 2. Rules & Society\n* **Power Structures**: Who governs? What are the political or social tensions?\n* **Special Systems**: (Magic, advanced technology, supernatural laws, martial arts, religion).\n* **Culture & Customs**: Key taboos, rituals, traditions, and societal expectations.\n`
        },
        // 5. docs/outline.md (Master 3-Act Outline)
        {
            relativePath: 'docs/outline.md',
            content: `# Master Outline: ${options.title}\n\n## Act 1: Setup & Inciting Incident\n* **Status Quo**: The protagonist's ordinary world before the rupture.\n* **Inciting Incident**: The catalyst that forces the protagonist out of their comfort zone.\n\n## Act 2: Rising Action & Midpoint\n* **Rising Obstacles**: Early trials, new alliances, and escalating stakes.\n* **Midpoint**: A major revelation or turning point shifting from reactive to proactive.\n* **Dark Night of the Soul**: The lowest emotional point where all seems lost.\n\n## Act 3: Climax & Resolution\n* **Climax**: The ultimate confrontation or decisive test.\n* **New Equilibrium**: The aftermath, lessons learned, and the transformed reality.\n`
        },
        // 6. .novel/project.json (Machine metadata)
        {
            relativePath: '.novel/project.json',
            content: JSON.stringify({
                title: options.title,
                author: options.author,
                structure: options.structure,
                targetWordCount: 50000,
                createdAt: new Date().toISOString(),
                version: '1.0.0'
            }, null, 2)
        },
        // 7. .novel/ai_rules.json (System instructions for AI Agents)
        {
            relativePath: '.novel/ai_rules.json',
            content: JSON.stringify({
                novelTitle: options.title,
                author: options.author,
                pointOfView: options.pov,
                toneAndVoice: "Evocative literary prose, vivid sensory descriptions, measured pacing, avoiding modern clichés.",
                prohibitedElements: [
                    "Never arbitrarily switch or break the established narrative point of view",
                    "Avoid modern slang and anachronistic vocabulary in historical or fantasy settings",
                    "Strictly adhere to 'Show, Don't Tell' (depict visceral actions and sensory details rather than summarizing)"
                ],
                contextFiles: [
                    "docs/characters.md",
                    "docs/worldbuilding.md",
                    "docs/outline.md"
                ]
            }, null, 2)
        }
    ];

    // Write all scaffold files via VS Code FileSystem API
    for (const file of filesToCreate) {
        const fileUri = vscode.Uri.joinPath(options.targetDir, file.relativePath);
        await vscode.workspace.fs.writeFile(fileUri, encoder.encode(file.content));
    }

    // Automatically open first scene in Novellized Live View
    const firstSceneUri = vscode.Uri.joinPath(options.targetDir, firstSceneRelativePath);
    try {
        await vscode.commands.executeCommand('vscode.openWith', firstSceneUri, 'novellized.editor');
    } catch {
        const doc = await vscode.workspace.openTextDocument(firstSceneUri);
        await vscode.window.showTextDocument(doc);
    }

    vscode.window.showInformationMessage(
        `Successfully initialized novel project "${options.title}"! Happy writing.`
    );
}
