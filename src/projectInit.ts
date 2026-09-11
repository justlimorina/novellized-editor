import * as vscode from 'vscode';
import * as path from 'path';

interface NovelInitOptions {
    title: string;
    author: string;
    structure: 'full' | 'simple';
    pov: string;
    targetDir: vscode.Uri;
}

export async function createNewNovelProject(): Promise<void> {
    // 1. Xác định thư mục đích
    let targetWorkspaceUri: vscode.Uri | undefined;

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        targetWorkspaceUri = vscode.workspace.workspaceFolders[0].uri;
    } else {
        const pickedFolders = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Chọn thư mục lưu tác phẩm'
        });
        if (!pickedFolders || pickedFolders.length === 0) {
            return;
        }
        targetWorkspaceUri = pickedFolders[0];
    }

    // 2. Nhập Tên tác phẩm
    const title = await vscode.window.showInputBox({
        title: 'Novellized: Bước 1/4',
        prompt: 'Nhập tên tác phẩm của bạn',
        placeHolder: 'Ví dụ: Vương Triều Hoàng Hôn',
        validateInput: value => (!value || value.trim().length === 0) ? 'Tên tác phẩm không được để trống' : null
    });
    if (!title) return;

    // 3. Nhập Tên tác giả / Bút danh
    const authorInput = await vscode.window.showInputBox({
        title: 'Novellized: Bước 2/4',
        prompt: 'Nhập bút danh hoặc tên tác giả',
        placeHolder: 'Ví dụ: Mặc Khách (Mặc định: Khuyết danh)'
    });
    if (authorInput === undefined) return;
    const author = authorInput.trim() || 'Khuyết danh';

    // 4. Chọn Cấu trúc tác phẩm
    const structurePick = await vscode.window.showQuickPick([
        {
            label: '$(layers) Cấu trúc Đầy đủ (Hồi → Chương → Cảnh)',
            description: 'part_01/chapter_01/scene_01.md',
            detail: 'Khuyên dùng cho tiểu thuyết trường thiên hoặc tác phẩm nhiều tuyến nhân vật.',
            value: 'full' as const
        },
        {
            label: '$(file-submodule) Cấu trúc Gọn nhẹ (Chương → Cảnh)',
            description: 'chapter_01/scene_01.md',
            detail: 'Phù hợp cho truyện vừa, truyện ngắn hoặc tản văn.',
            value: 'simple' as const
        }
    ], {
        title: 'Novellized: Bước 3/4',
        placeHolder: 'Chọn cách tổ chức chương hồi cho tác phẩm'
    });
    if (!structurePick) return;

    // 5. Chọn Ngôi kể chính (Dành cho AI Agent)
    const povPick = await vscode.window.showQuickPick([
        {
            label: 'Ngôi thứ nhất ("Tôi")',
            description: 'Cảm xúc trực tiếp, góc nhìn nội tâm sâu sắc của một nhân vật'
        },
        {
            label: 'Ngôi thứ ba giới hạn (Third-person Limited)',
            description: 'Góc nhìn khách quan nhưng bám theo tâm lý của một nhân vật tại mỗi cảnh'
        },
        {
            label: 'Ngôi thứ ba toàn tri (Third-person Omniscient)',
            description: 'Người kể chuyện biết trước mọi suy nghĩ và bối cảnh xảy ra'
        }
    ], {
        title: 'Novellized: Bước 4/4',
        placeHolder: 'Chọn ngôi kể chủ đạo (giúp AI Agent duy trì đúng đại từ và giọng văn)'
    });
    if (!povPick) return;

    // Tạo các tệp và thư mục
    await generateNovelScaffold({
        title: title.trim(),
        author,
        structure: structurePick.value,
        pov: povPick.label,
        targetDir: targetWorkspaceUri
    });
}

async function generateNovelScaffold(options: NovelInitOptions): Promise<void> {
    const wsEdit = new vscode.WorkspaceEdit();
    const encoder = new TextEncoder();

    // Xác định đường dẫn file cảnh đầu tiên
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
        // 1. Cảnh mở màn 1
        {
            relativePath: firstSceneRelativePath,
            content: `# Hồi 1: Khởi Đầu Mới\n\n## Chương 1: Cơn Gió Đổi Chiều\n\n### Cảnh 1: Lời Mở Màn\n\nGió mùa thu khẽ thổi qua rặng cây bên ngoài khung cửa sổ, mang theo hơi lạnh đầu mùa và mùi hương thoang thoảng của cỏ khô.\n\nNhân vật chính khẽ dừng lại trước ngưỡng cửa, đưa mắt nhìn về phía con đường mòn phía xa. Cuộc hành trình dài phía trước vẫn còn bao điều chưa hé lộ.\n\n---\n\n"Đã đến lúc phải lên đường rồi."\n`
        },
        // 2. Cảnh 2 mẫu
        {
            relativePath: secondSceneRelativePath,
            content: `### Cảnh 2: Cuộc Gặp Gỡ Bất Ngờ\n\nCon đường dẫn vào thị trấn buổi chiều tà dần trở nên vắng vẻ. Những ánh đèn lồng đầu tiên bắt đầu được thắp lên dọc theo hai bên dãy phố cổ.\n\nỞ phía góc đường, một bóng người quen thuộc dường như đã chờ đợi từ lâu...\n`
        },
        // 3. docs/characters.md (Hồ sơ nhân vật cho người viết & AI)
        {
            relativePath: 'docs/characters.md',
            content: `# Hồ Sơ Nhân Vật: ${options.title}\n\n*Tài liệu này được dùng để quản lý nhân vật cho tác giả và cung cấp ngữ cảnh nhân vật cho AI Agent.*\n\n---\n\n## 1. Nhân Vật Chính\n\n* **Họ và tên**: [Tên nhân vật]\n* **Bút danh / Biệt danh**: \n* **Tuổi**: \n* **Ngoại hình & Nhận dạng**: \n* **Mục tiêu cốt lõi (Goal)**: Điều nhân vật khao khát đạt được nhất là gì?\n* **Xung đột nội tâm (Flaw/Conflict)**: Nỗi sợ, điểm yếu tâm lý hoặc sai lầm trong quá khứ.\n* **Bí mật chưa hé lộ**: \n* **Mối quan hệ**: Thân thiết với ai? Coi ai là đối thủ?\n\n---\n\n## 2. Tuyến Nhân Vật Phụ & Đối Kháng\n\n### [Tên Nhân Vật Phụ 1]\n* **Vai trò**: (Bạn đồng hành / Người cố vấn / Kẻ thù)\n* **Đặc điểm nổi bật**: \n* **Động cơ**: \n`
        },
        // 4. docs/worldbuilding.md (Bối cảnh thế giới)
        {
            relativePath: 'docs/worldbuilding.md',
            content: `# Bối Cảnh Thế Giới: ${options.title}\n\n## 1. Không Gian & Thời Gian\n* **Thời đại / Mốc lịch sử**: (Ví dụ: Thời trung cổ giả tưởng, thế kỷ 19, hoặc tương lai viễn tưởng)\n* **Địa lý chủ đạo**: Các vương quốc, thành thị, ranh giới tự nhiên quan trọng.\n\n## 2. Quy Luật & Xã Hội\n* **Cơ cấu quyền lực**: Ai nắm quyền cai trị? Mâu thuẫn giữa các tầng lớp là gì?\n* **Hệ thống đặc thù**: (Phép thuật, Công nghệ, Võ học, Tôn giáo... nếu có).\n* **Văn hóa & Tập tục**: Những điều cấm kỵ hoặc phong tục nổi bật trong thế giới này.\n`
        },
        // 5. docs/outline.md (Dàn ý 3 hồi)
        {
            relativePath: 'docs/outline.md',
            content: `# Dàn Ý Tổng Thể: ${options.title}\n\n## Hồi 1: Thiết Lập & Khởi Phát\n* **Bình thường cũ**: Cuộc sống thường nhật của nhân vật trước khi biến cố xảy ra.\n* **Sự kiện khởi phát (Inciting Incident)**: Biến cố buộc nhân vật phải bước vào cuộc phiêu lưu.\n\n## Hồi 2: Thử Thách & Leo Thang\n* **Những chướng ngại đầu tiên**: Nhân vật đối mặt với thử thách mới nhưng cách tiếp cận cũ thất bại.\n* **Điểm giữa (Midpoint)**: Bất ngờ lớn hoặc sự thật được hé lộ, chuyển từ bị động sang chủ động.\n* **Đêm tối của tâm hồn (All is Lost)**: Thời điểm khủng hoảng tồi tệ nhất, dường như mọi thứ sụp đổ.\n\n## Hồi 3: Cao Trào & Hồi Kết\n* **Đỉnh điểm cao trào (Climax)**: Trận đối đầu quyết định.\n* **Cân bằng mới**: Hậu quả, bài học và cuộc sống mới sau khi kết thúc biến cố.\n`
        },
        // 6. .novel/project.json (Metadata hệ thống)
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
        // 7. .novel/ai_rules.json (Quy tắc hành vi cho AI Agent)
        {
            relativePath: '.novel/ai_rules.json',
            content: JSON.stringify({
                novelTitle: options.title,
                author: options.author,
                pointOfView: options.pov,
                toneAndVoice: "Văn phong văn học sâu sắc, giàu hình ảnh miêu tả, nhịp điệu tự nhiên, tránh sáo rỗng.",
                prohibitedElements: [
                    "Không tùy tiện thay đổi ngôi xưng hô của nhân vật",
                    "Tránh dùng từ ngữ hiện đại hóa lố bịch nếu bối cảnh là cổ trang/lịch sử",
                    "Luôn tuân thủ quy tắc Show, Don't Tell (Miêu tả hành động và cảm giác thay vì kể lể)"
                ],
                contextFiles: [
                    "docs/characters.md",
                    "docs/worldbuilding.md",
                    "docs/outline.md"
                ]
            }, null, 2)
        }
    ];

    // Tạo từng file qua FileSystem API của VS Code
    for (const file of filesToCreate) {
        const fileUri = vscode.Uri.joinPath(options.targetDir, file.relativePath);
        await vscode.workspace.fs.writeFile(fileUri, encoder.encode(file.content));
    }

    // Mở ngay file cảnh đầu tiên ở chế độ Live View
    const firstSceneUri = vscode.Uri.joinPath(options.targetDir, firstSceneRelativePath);
    try {
        await vscode.commands.executeCommand('vscode.openWith', firstSceneUri, 'novellized.editor');
    } catch {
        const doc = await vscode.workspace.openTextDocument(firstSceneUri);
        await vscode.window.showTextDocument(doc);
    }

    vscode.window.showInformationMessage(
        `🎉 Đã khởi tạo thành công tác phẩm "${options.title}"! Bắt đầu chắp bút ngay.`
    );
}

