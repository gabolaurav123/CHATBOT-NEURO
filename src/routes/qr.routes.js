const express = require('express');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await whatsappService.getQr());
  } catch (error) {
    next(error);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    res.json(await whatsappService.generateQr());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
