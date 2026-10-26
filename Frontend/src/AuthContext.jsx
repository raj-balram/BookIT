import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore, setUnauthorizedHandler } from "./api.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const authenticate = async (fn, body) => {
    const { user, token } = await fn(body);
    tokenStore.set(token);
    setUser(user);
  };

  const value = {
    user,
    loading,
    logout,
    login: (body) => authenticate(api.login, body),
    register: (body) => authenticate(api.register, body),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}