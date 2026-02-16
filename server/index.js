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

// GitHub 설정
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const OWNER = 'sjwow2039'; // 본인의 GitHub ID로 되어있는지 확인하세요!
const REPO = 'eL-database';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// 1. 데이터 가져오기 (GET)
app.get('/api/data', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: 'data/posts.json'
        });
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        res.json(JSON.parse(content));
    } catch (error) {
        if (error.status === 404) return res.json([]); 
        res.status(500).json({ error: "데이터 로드 실패" });
    }
});

// 2. 데이터 및 이미지 업로드 (POST)
app.post('/api/upload', async (req, res) => {
    const { title, text, imageBase64, fileName } = req.body;
    const postId = Date.now().toString();

    try {
        let imageUrl = "";

        // 이미지 처리 로직
        if (imageBase64) {
            const imagePath = `data/images/${postId}_${fileName}`;
            await octokit.repos.createOrUpdateFileContents({
                owner: OWNER,
                repo: REPO,
                path: imagePath,
                message: `Upload image: ${fileName}`,
                content: imageBase64.split(',')[1] 
            });
            imageUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/${imagePath}`;
        }

        // posts.json 업데이트 로직
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
            owner: OWNER,
            repo: REPO,
            path: 'data/posts.json',
            message: `Add post: ${title}`,
            content: Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64'),
            sha: sha
        });

        res.json({ success: true, data: newData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "저장 실패" });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
