function authorized(req) {
  const need = process.env.ACCESS_KEY;
  if (!need) return true;
  return req.headers['x-access-key'] === need;
}
module.exports = { authorized };
