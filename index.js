// index.js

const express = require('express');
const uploadRouter = require('./router');

const app = express();

app.get('/', (_, res) => {
  res.sendFile(`${__dirname}/test.html`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(uploadRouter);

app.listen(8080, () => {
  console.log('Form running on port 8080');
});
