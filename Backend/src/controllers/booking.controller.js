import * as naive from "../services/booking.naive.service.js";
import * as bookingService from "../services/booking.service.js";

export async function bookNaive(req, res) {
  const booking = await naive.bookNaive(req.body.slotId, req.user._id);
  res.status(201).json({ booking });
}

export async function bookSlot(req, res) {
  const booking = await bookingService.bookSlot(req.body.slotId, req.user._id);
  res.status(201).json({ booking });
}

export async function myBookings(req, res) {
  res.json(await bookingService.listMyBookings(req.user._id, req.validatedQuery));
}