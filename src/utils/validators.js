const { z } = require('zod');

const uuidSchema = z.string().uuid();
const textMessageSchema = z.object({
  message: z.string().min(1).max(4000).optional(),
  text: z.string().min(1).max(4000).optional()
}).refine((value) => value.message || value.text, {
  message: 'message or text is required'
});

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isValidEmail(value) {
  return z.string().email().safeParse(value).success;
}

function extractEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function parseUuidParam(req, name = 'id') {
  if (!isUuid(req.params[name])) {
    const error = new Error(`Invalid ${name}`);
    error.statusCode = 400;
    throw error;
  }
  return req.params[name];
}

module.exports = {
  uuidSchema,
  textMessageSchema,
  isUuid,
  isValidEmail,
  extractEmail,
  parseUuidParam
};
