import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../ToastContext.jsx";

export default function AdminPage() {
  const toast = useToast();
  const [form, setForm] = useState({ resource: "", from: "", to: "", slotMinutes: 60, price: 0 });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const summary = await api.createSlotsBulk({
        resource: form.resource,
        from: new Date(form.from).toISOString(), // datetime-local is local time
        to: new Date(form.to).toISOString(),
        slotMinutes: Number(form.slotMinutes),
        price: Number(form.price),
      });
      setResult(summary);
      toast(`Created ${summary.created}, skipped ${summary.skipped} existing`, "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Create slots</h2>
      <form className="card auth" onSubmit={submit}>
        <label>
          Resource
          <input value={form.resource} onChange={set("resource")} required placeholder="Court 1" />
        </label>
        <label>
          From
          <input type="datetime-local" value={form.from} onChange={set("from")} required />
        </label>
        <label>
          To
          <input type="datetime-local" value={form.to} onChange={set("to")} required />
        </label>
        <label>
          Slot length (minutes)
          <input type="number" min={5} max={240} value={form.slotMinutes} onChange={set("slotMinutes")} required />
        </label>
        <label>
          Price (₹)
          <input type="number" min={0} value={form.price} onChange={set("price")} required />
        </label>
        <button disabled={busy}>{busy ? "Creating…" : "Create slots"}</button>
        {result && (
          <p className="muted">
            Requested {result.requested}, created {result.created}, skipped {result.skipped}.
          </p>
        )}
      </form>
    </section>
  );
}