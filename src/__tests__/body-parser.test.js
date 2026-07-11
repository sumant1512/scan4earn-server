const express = require('express');
const request = require('supertest');
const { applyBodyParsing } = require('../config/bodyParser');

describe('body parser size limit', () => {
  it('accepts JSON payloads larger than 100kb', async () => {
    const app = express();
    applyBodyParsing(app);

    app.post('/test', (req, res) => {
      res.json({ ok: true, size: req.body.payload.length });
    });

    const payload = { payload: 'a'.repeat(120000) };

    const response = await request(app)
      .post('/test')
      .send(payload)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.size).toBe(payload.payload.length);
  });
});
