import { useEffect, useState } from "react";

// Cosmetic only: the SERVER decides when a hold is really expired.
export default function Countdown({ expiresAt, onExpire }) {
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const tick = () => {
      const remaining = target - Date.now();
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onExpire?.();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = Math.max(0, Math.floor(left / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className={s < 60 ? "countdown urgent" : "countdown"}>
      {mm}:{ss}
    </span>
  );
}