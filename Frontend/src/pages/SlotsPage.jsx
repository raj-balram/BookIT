import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";
import Countdown from "../Countdown.jsx";

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { timeStyle: "short" });

export default function SlotsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === "ADMIN";

  const [form, setForm] = useState({ resource: "", status: "" });
  const [applied, setApplied] = useState({ resource: "", status: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
  const [holds, setHolds] = useState([]);
  const [busy, setBusy] = useState(null); // id of the slot being acted on
  const confirmKeys = useRef({}); // slotId -> Idempotency-Key of the attempt in flight

  const load = useCallback(async () => {
    try {
      const [slots, mine] = await Promise.all([
        api.listSlots({ ...applied, page, limit: 12 }),
        api.myHolds(),
      ]);
      setData(slots);
      setHolds(mine.items);
    } catch (e) {
      toast(e.message, "error");
    }
  }, [applied, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (slotId, fn, successMsg) => {
    setBusy(slotId);
    try {
      await fn();
      toast(successMsg, "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const confirm = async (slotId) => {
    // One key per ATTEMPT. A retry after a network failure reuses it (so it can never
    // double-book); once the server gives a definite answer, the next click is a new attempt.
    const key = (confirmKeys.current[slotId] ??= crypto.randomUUID());
    setBusy(slotId);
    try {
      await api.confirm(slotId, key);
      delete confirmKeys.current[slotId];
      toast("Booking confirmed!", "success");
    } catch (e) {
      if (e.status >= 400 && e.status < 500) delete confirmKeys.current[slotId];
      toast(e.message, "error");
    } finally {
      setBusy(null);
      await load();
    }
  };

  const myHoldIds = new Set(holds.map((h) => h._id));
  const now = Date.now();
  const stateOf = (s) => {
    if (myHoldIds.has(s._id)) return "MINE";
    if (s.status === "BOOKED") return "BOOKED";
    if (s.status === "HELD" && new Date(s.holdExpiresAt).getTime() > now) return "HELD";
    return "AVAILABLE"; // includes expired holds: the server lets you take those
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setApplied(form);
  };

  return (
    <>
      {holds.length > 0 && (
        <section>
          <h2>Your holds</h2>
          <div className="grid">
            {holds.map((h) => (
              <div key={h._id} className="card hold">
                <strong>{h.resource}</strong>
                <span>{fmt(h.startTime)} – {fmtTime(h.endTime)}</span>
                <span>₹{h.price}</span>
                <span>Expires in <Countdown expiresAt={h.holdExpiresAt} onExpire={load} /></span>
                <div className="row">
                  <button disabled={busy === h._id} onClick={() => confirm(h._id)}>Confirm booking</button>
                  <button
                    className="secondary"
                    disabled={busy === h._id}
                    onClick={() => act(h._id, () => api.release(h._id), "Hold released")}
                  >
                    Release
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Available slots</h2>
        <form className="filters" onSubmit={applyFilters}>
          <input
            placeholder="Resource, exact name (e.g. Court 2)"
            value={form.resource}
            onChange={(e) => setForm({ ...form, resource: e.target.value })}
          />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="HELD">Held</option>
            <option value="BOOKED">Booked</option>
          </select>
          <button>Filter</button>
        </form>

        {data.items.length === 0 && <p className="muted">No slots found.</p>}

        <div className="grid">
          {data.items.map((s) => {
            const state = stateOf(s);
            return (
              <div key={s._id} className="card slot">
                <div className="row between">
                  <strong>{s.resource}</strong>
                  <span className={`badge ${state.toLowerCase()}`}>
                    {state === "MINE" ? "YOURS" : state}
                  </span>
                </div>
                <span>{fmt(s.startTime)} – {fmtTime(s.endTime)}</span>
                <span>₹{s.price}</span>
                <div className="row">
                  {state === "AVAILABLE" && (
                    <button
                      disabled={busy === s._id}
                      onClick={() => act(s._id, () => api.hold(s._id), "Held for 5 minutes. Confirm before the timer ends.")}
                    >
                      Hold
                    </button>
                  )}
                  {state === "MINE" && <span className="muted">You hold this slot</span>}
                  {state === "HELD" && <button disabled>Held by someone</button>}
                  {state === "BOOKED" && <button disabled>Booked</button>}
                  {isAdmin && state === "AVAILABLE" && (
                    <button
                      className="danger"
                      disabled={busy === s._id}
                      onClick={() => act(s._id, () => api.deleteSlot(s._id), "Slot deleted")}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pager">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {data.page ?? page} of {Math.max(1, data.totalPages)}</span>
          <button className="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </section>
    </>
  );
}