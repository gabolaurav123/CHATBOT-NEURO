const { z } = require('zod');

const uuidSchema = z.string().uuid();
const textMessageSchema = z.object({
  message: z.string().min(1).max(4000)
});

function isValidEmail(value) {
  return z.string().email().safeParse(value).success;
}

function extractEmail(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function parseUuidParam(req, name = 'id') {
  const parsed = uuidSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    const error = new Error(`Invalid ${name}`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.data;
}

module.exports = {
  uuidSchema,
  textMessageSchema,
  isValidEmail,
  extractEmail,
  parseUuidParam
};
