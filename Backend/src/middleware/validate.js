const formatIssues = (error) =>
  error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: "Validation failed", errors: formatIssues(result.error) });
  }
  req.body = result.data; // cleaned: trimmed, coerced, unknown keys removed
  next();
};

// Express 5: req.query is a read-only getter, so store the parsed query elsewhere
export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ message: "Validation failed", errors: formatIssues(result.error) });
  }
  req.validatedQuery = result.data;
  next();
};