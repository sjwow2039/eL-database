require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

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

// [기능 1] 전체 데이터 조회
app.get('/api/data', async (req, res) => {
    const { content } = await getFile('data/posts.json');
    res.json(content);
});

// [기능 2] 게시글 업로드 (작성자 ID 포함)
app.post('/api/upload', async (req, res) => {
    const { title, text, imageBase64, fileName, authorId } = req.body;
    const postId = Date.now().toString();

    try {
        let imageUrl = "";
        if (imageBase64) {
            const imagePath = `data/images/${postId}_${fileName}`;
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER, repo: REPO, path: imagePath,
                message: `Upload image by ${authorId}`,
                content: imageBase64.split(',')[1]
            });
            imageUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/${imagePath}`;
        }

        const { content: currentData, sha } = await getFile('data/posts.json');
        const newData = { id: postId, authorId, title, text, imageUrl, comments: [], date: new Date().toLocaleString() };
        currentData.unshift(newData);

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Post by ${authorId}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "저장 실패" }); }
});

// [기능 3] 댓글 작성
app.post('/api/comment', async (req, res) => {
    const { postId, authorId, text } = req.body;
    try {
        const { content: currentData, sha } = await getFile('data/posts.json');
        const postIndex = currentData.findIndex(p => p.id === postId);
        if (postIndex === -1) return res.status(404).send("Post not found");

        currentData[postIndex].comments.push({ id: Date.now(), authorId, text, date: new Date().toLocaleString() });

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Comment by ${authorId}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true });
    } catch (error) { res.status(500).send("Error"); }
});

// [기능 4] 게시글 삭제
app.delete('/api/post/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const { content: currentData, sha } = await getFile('data/posts.json');
        const post = currentData.find(p => p.id === postId);
        
        if (post && post.imageUrl) {
            try {
                const imagePath = post.imageUrl.split('@main/')[1];
                const { data: imgData } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: imagePath });
                await octokit.repos.deleteFile({ owner: OWNER, repo: REPO, path: imagePath, message: "Del img", sha: imgData.sha });
            } catch (e) {}
        }

        const filtered = currentData.filter(p => p.id !== postId);
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Delete ${postId}`,
            content: Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true });
    } catch (error) { res.status(500).send("Error"); }
});

app.listen(port, () => console.log(`Server running on ${port}`));
