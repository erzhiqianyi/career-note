import { GoogleAuthProvider, getAuth, onIdTokenChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';

type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
export type CareerAuthConfig = {mode: 'off' | 'on' | 'strict'; firebase: FirebaseConfig | null};
let auth: Auth | null = null;
let currentUser: User | null = null;
export function getCareerAuth(): Auth | null { return auth; }
export async function configureCareerAuth(): Promise<CareerAuthConfig> {
  const response = await fetch('/api/career/auth/config');
  if (!response.ok) throw new Error('无法读取登录配置，请检查 Worker 服务');
  const config: CareerAuthConfig = await response.json();
  if (config.firebase && config.mode !== 'off') {
    const app = getApps().find(app => app.name === 'career-note-app') || initializeApp(config.firebase, 'career-note-app');
    auth = getAuth(app);
    await auth.authStateReady();
  }
  return config;
}
export function listenCareerAuthChanged(onChange: (user: User | null, token: string | null) => void, onError: (error: Error) => void): () => void {
  if (!auth) { onChange(null, null); return () => {}; }
  return onIdTokenChanged(auth, async user => {
    currentUser = user;
    try { onChange(user, user ? await user.getIdToken() : null); }
    catch (error) { onChange(null, null); onError(error instanceof Error ? error : new Error('登录已失效')); }
  }, onError);
}
export async function freshAuthToken(): Promise<string | null> {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}
export async function signInWithGoogle(): Promise<string> {
  if (!auth) throw new Error('请先配置 Worker 的 Firebase Google 登录');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt: 'select_account'});
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}
export function signOutCareer() { return auth ? signOut(auth) : Promise.resolve(); }
export function getCurrentUser(): User | null { return currentUser; }
