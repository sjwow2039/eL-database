require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const OWNER = 'sjwow2039'; 
const REPO = 'eL-database';
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// 데이터 로드 공통 함수
async function getFile(path) {
    try {
        const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path });
        return { 
            content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')), 
            sha: data.sha 
        };
    } catch (e) { 
        return { content: [], sha: null }; 
    }
}

// [1] 게시판 데이터 조회
app.get('/api/data', async (req, res) => {
    const { content } = await getFile('data/posts.json');
    res.json(content);
});

// [2] 로그인 API
app.post('/api/auth/login', async (req, res) => {
    const { id, pw } = req.body;
    const { content: users } = await getFile('data/users.json');
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true });
    else res.status(401).json({ success: false, message: "아이디 또는 비번이 틀립니다." });
});

// [3] 비밀번호 변경 API
app.post('/api/auth/change-pw', async (req, res) => {
    const { id, currentPw, newPw } = req.body;
    const { content: users, sha } = await getFile('data/users.json');
    const idx = users.findIndex(u => u.id === id && u.pw === currentPw);
    
    if (idx === -1) return res.status(401).json({ success: false });

    users[idx].pw = newPw;
    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER, repo: REPO, path: 'data/users.json',
        message: `PW Change: ${id}`,
        content: Buffer.from(JSON.stringify(users, null, 2)).toString('base64'),
        sha: sha
    });
    res.json({ success: true });
});

// [4] 글 업로드 (이미지 처리 포함)
app.post('/api/upload', async (req, res) => {
    const { title, text, tag, imageBase64, fileName, authorId } = req.body;
    const postId = Date.now().toString();
    try {
        let imageUrl = "";
        if (imageBase64) {
            const filePath = `images/${postId}_${fileName}`;
            const base64Data = imageBase64.split(',')[1];
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER, repo: REPO, path: filePath,
                message: `Upload image for ${postId}`,
                content: base64Data
            });
            imageUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/${filePath}`;
        }

        const { content: currentData, sha } = await getFile('data/posts.json');
        const newPost = {
            id: postId, authorId, title, text, tag, imageUrl,
            comments: [], date: new Date().toLocaleString()
        };
        currentData.unshift(newPost);

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `New post ${postId}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true, post: newPost });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [5] 댓글 작성
app.post('/api/comment', async (req, res) => {
    const { postId, authorId, text } = req.body;
    const { content: currentData, sha } = await getFile('data/posts.json');
    const postIdx = currentData.findIndex(p => p.id === postId);
    if (postIdx === -1) return res.status(404).json({ message: "Not Found" });

    currentData[postIdx].comments.push({
        id: Date.now().toString(), authorId, text, date: new Date().toLocaleString()
    });

    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER, repo: REPO, path: 'data/posts.json',
        message: `New comment on ${postId}`,
        content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
        sha: sha
    });
    res.json({ success: true });
});

// [6] 삭제 API
app.post('/api/delete', async (req, res) => {
    const { id, authorId } = req.body;
    const { content: currentData, sha } = await getFile('data/posts.json');
    const post = currentData.find(p => p.id === id);
    if (!post || post.authorId !== authorId) return res.status(403).json({ success: false });

    const filtered = currentData.filter(p => p.id !== id);
    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER, repo: REPO, path: 'data/posts.json',
        message: `Delete post ${id}`,
        content: Buffer.from(JSON.stringify(filtered, null, 2)).toString('base64'),
        sha: sha
    });
    res.json({ success: true });
});

app.listen(port, () => console.log(`Server running on ${port}`));
