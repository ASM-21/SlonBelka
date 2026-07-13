const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const ACCESS_KEY = "slonbelka_token";
const REFRESH_KEY = "slonbelka_refresh";

export const token = {
  get: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// Single-flight refresh: many concurrent 401s trigger only one refresh call.
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const r = token.getRefresh();
      if (!r) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: r }),
        });
        if (!res.ok) {
          token.clear();
          window.dispatchEvent(new Event("slonbelka:auth-expired"));
          return false;
        }
        const data = await res.json();
        token.set(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      }
    })();
    refreshing.finally(() => (refreshing = null));
  }
  return refreshing;
}

async function api<T>(path: string, opts: RequestInit = {}, retry = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });

  // Access token expired: refresh once and retry (but never for /auth/* itself).
  if (res.status === 401 && !retry && !path.startsWith("/auth/") && token.getRefresh()) {
    if (await tryRefresh()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ---------- types ----------
export interface LessonItem {
  id: number;
  type: string;
  level: number;
  lemma: string;
  stressed_form: string;
  translation_primary: string;
  translations: string[];
  part_of_speech?: string | null;
  gender?: string | null;
  aspect?: string | null;
  audio_url?: string | null;
}

export interface ReviewItem {
  item_id: number;
  question_type: "meaning" | "production";
  prompt: string;
  audio_url?: string | null;
  part_of_speech?: string | null;
}

export interface SubmitResult {
  status: string;
  correct: boolean;
  srs_stage: number;
  srs_stage_before: number;
  srs_stage_name: string;
  srs_stage_before_name: string;
  available_at?: string | null;
  pass_complete: boolean;
  passed: boolean;
  burned: boolean;
  expected: string;
  stressed_form: string;
  leveled_up?: boolean;
  current_level?: number;
}

export interface Dashboard {
  current_level: number;
  frozen?: boolean;
  level_progress: {
    level: number;
    guru: number;
    total: number;
    threshold: number;
    fraction: number;
    cleared: boolean;
  };
  srs_counts: { apprentice: number; guru: number; master: number; enlightened: number; burned: number };
  lessons_available: number;
  reviews_due: number;
  reviews_upcoming_24h: number;
  streak: number;
  accuracy: number | null;
  total_reviews: number;
  leech_count: number;
}

export interface ItemSummary {
  id: number;
  lemma: string;
  stressed_form: string;
  translation_primary: string;
  part_of_speech?: string | null;
  level: number;
  frequency_rank?: number | null;
  status: string; // locked | available | apprentice | guru | master | enlightened | burned
  srs_stage?: number | null;
  available_at?: string | null;
  is_leech: boolean;
  accessible: boolean;
}

export interface ItemBrowseResponse {
  total: number;
  limit: number;
  offset: number;
  items: ItemSummary[];
}

export interface ItemDetail extends ItemSummary {
  translations: string[];
  synonyms: string[];
  gender?: string | null;
  aspect?: string | null;
  ipa?: string | null;
  audio_url?: string | null;
  audio_attribution?: {
    source?: string | null;
    license?: string | null;
    attribution?: string | null;
  } | null;
  notes?: string | null;
  sentences: { ru: string; en: string; audio_url?: string | null }[];
  mnemonic?: { meaning?: string | null; reading?: string | null } | null;
  state?: {
    srs_stage: number;
    srs_band: string;
    available_at?: string | null;
    last_reviewed_at?: string | null;
    correct_count: number;
    incorrect_count: number;
    correct_streak: number;
    is_leech: boolean;
    leech_score: number;
  } | null;
}

export interface BillingStatus {
  is_premium: boolean;
  status: string;
  plan?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  free_level_limit: number;
  current_level: number;
  accessible_level: number;
}

export interface Settings {
  daily_lesson_cap: number;
  autoplay_audio: boolean;
  keyboard_layout: string;
  onboarded: boolean;
  reminders_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  session_size: number;
  frozen: boolean;
}

export interface Leech {
  item_id: number;
  stressed_form: string;
  translation_primary: string;
  srs_stage: number;
  stage_name: string;
  accuracy: number | null;
  incorrect_count: number;
  leech_score: number;
  last_reviewed_at: string | null;
}

export interface PracticeResult {
  correct: boolean;
  status: string;
  expected: string;
  stressed_form: string;
}

interface TokenPair { access_token: string; refresh_token: string }

// ---------- auth ----------
export const getHealth = () => api<{ status: string; version: string }>("/health");

export const register = (email: string, password: string, acceptedTerms: boolean) =>
  api<TokenPair>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, accepted_terms: acceptedTerms }),
  });

export const login = (email: string, password: string) =>
  api<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const logout = async () => {
  const r = token.getRefresh();
  if (r) {
    try {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: r }) });
    } catch {
      /* best effort */
    }
  }
  token.clear();
};

export const forgotPassword = (email: string) =>
  api<{ sent: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const verifyEmail = (verifyToken: string) =>
  api<{ verified: boolean }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: verifyToken }),
  });

export const resendVerification = () =>
  api<{ verified?: boolean; sent?: boolean }>("/auth/resend-verification", { method: "POST" });

export const resetPassword = (resetToken: string, newPassword: string) =>
  api<{ reset: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, new_password: newPassword }),
  });

export const getMe = () =>
  api<{ id: number; email: string; current_level: number; email_verified: boolean }>("/auth/me");

// ---------- lessons / reviews ----------
export const getLessons = () => api<LessonItem[]>("/lessons");

export const completeLessons = (item_ids: number[]) =>
  api<{ started: number[]; over_cap: number[]; skipped: number[] }>("/lessons/complete", {
    method: "POST",
    body: JSON.stringify({ item_ids }),
  });

export const getReviews = () => api<ReviewItem[]>("/reviews");

export interface Forecast {
  due_now: number;
  frozen: boolean;
  hourly: number[]; // 24 rolling one-hour buckets from now
  daily: number[]; // 7 rolling one-day buckets from now
}

export const getForecast = () => api<Forecast>("/reviews/forecast");

export const submitReview = (body: {
  item_id: number;
  question_type: string;
  answer: string;
  client_event_id: string;
  override?: boolean;
}) => api<SubmitResult>("/reviews", { method: "POST", body: JSON.stringify(body) });

export const getDashboard = () => api<Dashboard>("/dashboard");

export interface SyncResult {
  results: { client_event_id: string; status: string; srs_stage?: number | null; error?: string | null }[];
}

export const syncReviews = (
  events: {
    item_id: number;
    question_type: string;
    answer: string;
    client_event_id: string;
    answered_at: string;
    override: boolean;
  }[],
) => api<SyncResult>("/reviews/sync", { method: "POST", body: JSON.stringify({ events }) });

export const registerPush = (endpoint: string, keys: Record<string, string>) =>
  api<{ subscribed: boolean }>("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint, keys }),
  });

// ---------- study / leeches ----------
export const getLeeches = () => api<Leech[]>("/leeches");
export const leechStudy = () => api<ReviewItem[]>("/leeches/study", { method: "POST" });
export const extraStudy = (mode: string, level?: number) =>
  api<ReviewItem[]>(`/extra-study?mode=${mode}${level != null ? `&level=${level}` : ""}`);
export const practice = (item_id: number, question_type: string, answer: string) =>
  api<PracticeResult>("/practice", {
    method: "POST",
    body: JSON.stringify({ item_id, question_type, answer }),
  });
export const saveMnemonic = (
  item_id: number,
  m: { meaning_mnemonic?: string; reading_mnemonic?: string },
) =>
  api<{ item_id: number; meaning_mnemonic: string | null; reading_mnemonic: string | null }>(
    `/items/${item_id}/mnemonic`,
    { method: "PUT", body: JSON.stringify(m) },
  );

// ---------- item browser ----------
export const browseItems = (params: {
  search?: string;
  level?: number;
  pos?: string;
  limit?: number;
  offset?: number;
}) => {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.level != null) q.set("level", String(params.level));
  if (params.pos) q.set("pos", params.pos);
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));
  return api<ItemBrowseResponse>(`/items?${q.toString()}`);
};

export interface LevelSummary {
  level: number;
  total: number;
  guru: number;
  threshold: number;
  cleared: boolean;
  accessible: boolean;
  current: boolean;
}

export const getLevels = () => api<LevelSummary[]>("/items/levels");

export const getItem = (id: number) => api<ItemDetail>(`/items/${id}`);

export const addSynonym = (itemId: number, text: string) =>
  api<{ synonyms: string[] }>(`/items/${itemId}/synonyms`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });

export const removeSynonym = (itemId: number, text: string) =>
  api<{ synonyms: string[] }>(`/items/${itemId}/synonyms?text=${encodeURIComponent(text)}`, {
    method: "DELETE",
  });

// ---------- billing ----------
export const getBillingStatus = () => api<BillingStatus>("/billing/status");
export const checkout = (plan: string) =>
  api<{ url: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
export const billingPortal = () => api<{ url: string }>("/billing/portal", { method: "POST" });

// ---------- burned / resurrection ----------
export interface BurnedItem {
  item_id: number;
  stressed_form: string;
  translation_primary: string;
  level: number;
  burned_at?: string | null;
}

export const getBurned = () => api<BurnedItem[]>("/burned");
export const resurrect = (itemId: number) =>
  api<{ item_id: number; srs_stage: number; available_at?: string | null }>(
    `/items/${itemId}/resurrect`,
    { method: "POST" },
  );

// ---------- stats ----------
export interface Stats {
  totals: {
    total_reviews: number;
    accuracy: number | null;
    current_streak: number;
    longest_streak: number;
    items_started: number;
    items_burned: number;
  };
  reviews_by_day: { date: string; count: number; correct: number }[];
  srs_distribution: Record<string, number>;
}

export const getStats = () => api<Stats>("/stats");

// ---------- settings ----------
export const getSettings = () => api<Settings>("/settings");
export const updateSettings = (patch: Partial<Omit<Settings, "frozen">>) =>
  api<Settings>("/settings", { method: "PATCH", body: JSON.stringify(patch) });
export const exportAccount = () => api<Record<string, unknown>>("/account/export");

export const deleteAccount = (password: string) =>
  api<void>("/account/delete", { method: "POST", body: JSON.stringify({ password }) });

export const setVacation = (on: boolean) =>
  api<{ frozen: boolean }>("/settings/vacation", { method: "POST", body: JSON.stringify({ on }) });
