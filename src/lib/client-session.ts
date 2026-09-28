"use client";

import type { BondStatus } from "./types";

const TOKEN_KEY = "sj_token";
const STATUS_KEY = "sj_bond_status";
const PROVIDER_KEY = "sj_provider";
const EXPIRES_KEY = "sj_expires";

export interface ClientSession {
  token: string;
  bondStatus: BondStatus;
  provider: string;
  expiresAt: number;
}

function storage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function saveSession(session: ClientSession) {
  const store = storage();
  if (!store) return;
  store.setItem(TOKEN_KEY, session.token);
  store.setItem(STATUS_KEY, session.bondStatus);
  store.setItem(PROVIDER_KEY, session.provider);
  store.setItem(EXPIRES_KEY, String(session.expiresAt));
}

export function loadSession(): ClientSession | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(TOKEN_KEY);
  const bondStatus = store.getItem(STATUS_KEY) as BondStatus | null;
  const expiresAt = Number(store.getItem(EXPIRES_KEY) || 0);
  if (!token || !bondStatus || expiresAt <= Date.now()) return null;
  return { token, bondStatus, provider: store.getItem(PROVIDER_KEY) || "", expiresAt };
}

export function clearSession() {
  const store = storage();
  if (!store) return;
  for (const key of [TOKEN_KEY, STATUS_KEY, PROVIDER_KEY, EXPIRES_KEY]) store.removeItem(key);
}
