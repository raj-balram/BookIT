import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login({ email: form.email, password: form.password });
      else await register(form);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit}>
        <h1>BookIt</h1>
        <p className="muted">{mode === "login" ? "Sign in to book a slot" : "Create your account"}</p>

        {mode === "register" && (
          <label>
            Name
            <input value={form.name} onChange={set("name")} required minLength={2} />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set("email")} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1} />
        </label>

        <button disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}