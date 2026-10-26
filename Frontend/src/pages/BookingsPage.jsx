import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../ToastContext.jsx";

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function BookingsPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .myBookings({ page, limit: 10 })
      .then((d) => !cancelled && setData(d))
      .catch((e) => toast(e.message, "error"));
    return () => {
      cancelled = true; // ignore a stale response if the page changed meanwhile
    };
  }, [page, toast]);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <section>
      <h2>My bookings</h2>
      {data.items.length === 0 && <p className="muted">You haven't booked anything yet.</p>}
      <div className="grid">
        {data.items.map((b) => (
          <div key={b._id} className="card slot">
            <div className="row between">
              <strong>{b.slot?.resource ?? "Slot removed"}</strong>
              <span className="badge booked">{b.status}</span>
            </div>
            {b.slot && <span>{fmt(b.slot.startTime)}</span>}
            {b.slot && <span>₹{b.slot.price}</span>}
            <span className="muted">Booked {fmt(b.createdAt)}</span>
          </div>
        ))}
      </div>
      <div className="pager">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {Math.max(1, data.totalPages)}</span>
        <button className="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </section>
  );
}