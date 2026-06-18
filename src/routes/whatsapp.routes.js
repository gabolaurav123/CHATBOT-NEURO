const express = require('express');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

router.get('/status', async (req, res, next) => {
  try {
    res.json(await whatsappService.getStatus());
  } catch (error) {
    next(error);
  }
});

router.get('/qr', async (req, res, next) => {
  try {
    res.json(await whatsappService.getQr());
  } catch (error) {
    next(error);
  }
});

router.post('/generate-qr', async (req, res, next) => {
  try {
    res.json(await whatsappService.generateQr());
  } catch (error) {
    next(error);
  }
});

router.post('/restart', async (req, res, next) => {
  try {
    res.json(await whatsappService.restart());
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    res.json(await whatsappService.logout());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
