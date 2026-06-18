const express = require('express');
const paymentService = require('../services/paymentService');
const { parseUuidParam } = require('../utils/validators');
const { logAdminAction } = require('../services/crmService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await paymentService.listPayments(req.query));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseUuidParam(req);
    const payment = await paymentService.updatePayment(id, req.body || {});
    await logAdminAction({ action: 'payment_updated', details: { id, fields: req.body || {} } });
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
