const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Dữ liệu giả, bạn có thể thay bằng DB
const validApiKey = 'nam123';
const validPassword = 'nam123';

app.use(cors());
app.use(express.json());

app.post('/validate-password', (req, res) => {
  const { apiKey, password, tool, timestamp } = req.body;

  if (!apiKey || !password || !tool) {
    return res.status(400).json({ valid: false, message: 'Missing parameters' });
  }

  if (apiKey === validApiKey && password === validPassword && tool === 'fb-auto') {
    return res.json({ valid: true, message: 'Authentication successful', timestamp });
  } else {
    return res.json({ valid: false, message: 'Invalid apiKey or password' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
