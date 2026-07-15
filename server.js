require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const postsRouter = require('./routes/posts');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', postsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ FB Post Scheduler running at http://localhost:${PORT}`);
  scheduler.start();
});
