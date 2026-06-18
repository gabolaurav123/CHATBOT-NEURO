const express = require('express');
const settingsService = require('../services/settingsService');
const { logAdminAction } = require('../services/crmService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await settingsService.getSettings());
  } catch (error) {
    next(error);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const payload = req.body && req.body.settings ? req.body.settings : req.body;
    const settings = await settingsService.upsertSettings(payload || {});
    await logAdminAction({ action: 'settings_updated', details: payload || {} });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
