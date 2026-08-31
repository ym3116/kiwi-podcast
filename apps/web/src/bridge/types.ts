export interface KiwiContext {
  classId?: string;
  className?: string;
  userId?: string;
  username?: string;
  userRole?: string;
  appId?: string;
  appSlug?: string;
  uiSlug?: string;
  placement?: string;
  isAdmin?: boolean;
  capabilities?: string[];
}

export interface KiwiAppToken {
  accessToken: string;
  scopes?: string[];
  expiresIn?: number;
  appSlug?: string;
}

export type KiwiChatDisplayMode = 'modal' | 'sidepanel' | 'snap' | 'fullscreen';

export type KiwiBridgeState = {
  mode: 'simulator' | 'live';
  connected: boolean;
  context: KiwiContext | null;
  token: KiwiAppToken | null;
  hostOrigin: string | null;
  error: string | null;
};

export type KiwiBridgeAction =
  | { type: 'ready' }
  | { type: 'context'; payload: KiwiContext; origin: string }
  | { type: 'token'; payload: KiwiAppToken }
  | { type: 'error'; payload: string };
