const express = require('express');
const messageService = require('../services/messageService');
const { isUuid } = require('../utils/validators');

const conversationsRouter = express.Router();
const messagesRouter = express.Router();

conversationsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await messageService.listConversations(req.query));
  } catch (error) {
    next(error);
  }
});

conversationsRouter.get('/:leadId', async (req, res, next) => {
  try {
    const leadId = req.params.leadId;
    if (!isUuid(leadId)) {
      return res.status(400).json({ error: 'Invalid lead id' });
    }
    res.json(await messageService.getConversationsByLead(leadId));
  } catch (error) {
    next(error);
  }
});

messagesRouter.get('/:leadId', async (req, res, next) => {
  try {
    const leadId = req.params.leadId;
    if (!isUuid(leadId)) {
      return res.status(400).json({ error: 'Invalid lead id' });
    }
    res.json(await messageService.getMessagesByLead(leadId, req.query.limit, req.query.offset));
  } catch (error) {
    next(error);
  }
});

module.exports = {
  conversationsRouter,
  messagesRouter
};
