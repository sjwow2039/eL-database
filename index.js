require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // 이미지 용량을 위해 50mb로 확장

const OWNER = 'sjwow2039'; 
const REPO = 'eL-database';
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// 데이터 로드 공통 함수
async function getFile(path) {
    try {
        const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path });
        return { content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')), sha: data.sha };
    } catch (e) { return { content: [], sha: null }; }
}

// [1] 전체 데이터 조회
app.get('/api/data', async (req, res) => {
    const { content } = await getFile('data/posts.json');
    res.json(content);
});

// [2] 업로드 (이미지 CDN 주소 생성 및 태그 처리)
app.post('/api/upload', async (req, res) => {
    const { title, text, tag, imageBase64, fileName, authorId } = req.body;
    const postId = Date.now().toString();

    try {
        let imageUrl = "";
        if (imageBase64) {
            const imagePath = `data/images/${postId}_${fileName || 'image.png'}`;
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER, repo: REPO, path: imagePath,
                message: `Upload image by ${authorId}`,
                content: imageBase64.split(',')[1]
            });
            imageUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/${imagePath}`;
        }

        const { content: currentData, sha } = await getFile('data/posts.json');
        
        const newData = { 
            id: postId, 
            authorId: authorId || "익명", 
            title, 
            text, 
            tag: tag || "#전체", 
            imageUrl, 
            comments: [], 
            date: new Date().toLocaleDateString() 
        };
        
        currentData.unshift(newData);

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Post by ${authorId}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true, data: newData });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: "저장 실패" }); 
    }
});

// [3] 댓글 작성
app.post('/api/comment', async (req, res) => {
    const { postId, authorId, text } = req.body;
    try {
        const { content: currentData, sha } = await getFile('data/posts.json');
        const postIndex = currentData.findIndex(p => p.id === postId);
        if (postIndex === -1) return res.status(404).send("Post not found");

        currentData[postIndex].comments.push({ 
            id: Date.now(), 
            authorId: authorId || "익명", 
            text, 
            date: new Date().toLocaleString() 
        });

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Comment by ${authorId}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true });
    } catch (error) { res.status(500).send("Error"); }
});

// [4] 삭제 (본인 확인 로직 강화 + 이미지 동시 삭제)
app.post('/api/delete', async (req, res) => {
    const { id, authorId } = req.body; // app.js에서 보내는 데이터
    try {
        const { content: currentData, sha } = await getFile('data/posts.json');
        const post = currentData.find(p => p.id === id);
        
        if (!post) return res.status(404).json({ success: false, message: "글을 찾을 수 없습니다." });

        // 보안: 작성자 본인 확인
        if (post.authorId !== authorId) {
            return res.status(403).json({ success: false, message: "본인 글만 삭제 가능합니다." });
        }

        // 이미지 있으면 GitHub에서 이미지도 삭제
        if (post.imageUrl) {
            try {
                const imagePath = post.imageUrl.split('@main/')[1];
                const { data: imgData } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: imagePath });
                await octokit.repos.deleteFile({ 
                    owner: OWNER, repo: REPO, path: imagePath, 
                    message: "Delete image", 
                    sha: imgData.sha 
                });
            } catch (e) { console.log("Image delete failed or already gone"); }
        }

        // JSON 데이터에서 삭제
        const filtered = currentData.filter(p => p.id !== id);
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Delete post ${id} by ${authorId}`,
            content: Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, message: "서버 삭제 에러" }); 
    }
});

app.listen(port, () => console.log(`Server running on ${port}`));
