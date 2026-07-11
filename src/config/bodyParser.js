const express = require('express');

const jsonLimit = process.env.JSON_BODY_LIMIT || '10mb';
const urlEncodedLimit = process.env.URLENCODED_BODY_LIMIT || '10mb';

function applyBodyParsing(app) {
  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ extended: true, limit: urlEncodedLimit }));
}

module.exports = { applyBodyParsing, jsonLimit, urlEncodedLimit };
