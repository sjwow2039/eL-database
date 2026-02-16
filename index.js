require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// GitHub 설정 (환경변수 GITHUB_TOKEN 필요)
const OWNER = 'sjwow2039'; 
const REPO = 'eL-database';
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// [기능 1] 전체 데이터 가져오기
app.get('/api/data', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER, repo: REPO, path: 'data/posts.json'
        });
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        res.json(JSON.parse(content));
    } catch (error) {
        if (error.status === 404) return res.json([]); 
        res.status(500).json({ error: "데이터 로드 실패" });
    }
});

// [기능 2] 업로드 (텍스트 + 이미지)
app.post('/api/upload', async (req, res) => {
    const { title, text, imageBase64, fileName } = req.body;
    const postId = Date.now().toString();

    try {
        let imageUrl = "";
        if (imageBase64) {
            const imagePath = `data/images/${postId}_${fileName}`;
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER, repo: REPO, path: imagePath,
                message: `Upload image: ${fileName}`,
                content: imageBase64.split(',')[1] 
            });
            imageUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/${imagePath}`;
        }

        let currentData = [];
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: 'data/posts.json' });
            currentData = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
            sha = data.sha;
        } catch (e) { }

        const newData = { id: postId, title, text, imageUrl, date: new Date().toLocaleString() };
        currentData.unshift(newData);

        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Add post: ${title}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });
        res.json({ success: true, data: newData });
    } catch (error) {
        res.status(500).json({ error: "저장 실패" });
    }
});

// [기능 3] 삭제 (데이터 + 이미지 파일 물리적 삭제)
app.delete('/api/post/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const { data: fileData } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: 'data/posts.json' });
        let currentData = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
        const targetPost = currentData.find(p => p.id === postId);

        if (targetPost && targetPost.imageUrl) {
            try {
                const imagePath = targetPost.imageUrl.split('@main/')[1];
                const { data: imgData } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: imagePath });
                await octokit.repos.deleteFile({
                    owner: OWNER, repo: REPO, path: imagePath,
                    message: `Delete image ${postId}`, sha: imgData.sha
                });
            } catch (e) { console.log("이미지 삭제 스킵"); }
        }

        const filteredData = currentData.filter(p => p.id !== postId);
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER, repo: REPO, path: 'data/posts.json',
            message: `Delete post ${postId}`,
            content: Buffer.from(JSON.stringify(filteredData, null, 2)).toString('base64'),
            sha: fileData.sha
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "삭제 실패" });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
