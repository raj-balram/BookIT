import * as holdService from "../services/hold.service.js";

export async function hold(req, res) {
  const result = await holdService.holdSlot(req.params.id, req.user._id);
  res.json({ hold: result });
}

export async function release(req, res) {
  await holdService.releaseHold(req.params.id, req.user._id);
  res.status(204).send();
}