import * as slotService from "../services/slot.service.js";

export async function listSlots(req, res) {
  res.json(await slotService.listSlots(req.validatedQuery));
}

export async function getSlot(req, res) {
  res.json({ slot: await slotService.getSlot(req.params.id) });
}

export async function createSlot(req, res) {
  const slot = await slotService.createSlot(req.body, req.user._id);
  res.status(201).json({ slot });
}

export async function createSlotsBulk(req, res) {
  const summary = await slotService.createSlotsBulk(req.body, req.user._id);
  res.status(201).json(summary);
}

export async function deleteSlot(req, res) {
  await slotService.deleteSlot(req.params.id);
  res.status(204).send();
}