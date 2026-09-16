'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, Bot, Check, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAgentConsent } from '@ninomae/mcp-app-server/react';
import { LanguageSwitcher, useLocale } from '@/components/locale-provider';
import { getAuthToken, setAuthToken } from '@/lib/career';
import {
  configureCareerAuth,
  getCareerAuth,
  listenCareerAuthChanged,
  signInWithGoogle,
  signOutCareer,
  type CareerAuthConfig,
} from '@/lib/career-auth';

// Localized meaning of each scope; which ones are locked or pre-checked comes from the gateway.
const SCOPE_TEXT: Record<string, { label: string; detail: string }> = {
  'career:read': { label: '读取你的工作区', detail: '履历、求人、资料、任务和练习记录。' },
  'agent:write': { label: '保存研究与资料', detail: '保存研究报告、资料版本、问题集和点评，排队准备任务。' },
  'career:write': { label: '更新履历摘要', detail: '只在你要求时修改履历摘要。研究类技能不需要这项权限。' },
};

export default function OauthConsent() {
  const { t } = useLocale();
  const consent = useAgentConsent({
    basePath: '/api/career',
    authHeaders: (): Record<string, string> => { const token = getAuthToken(); return token ? { authorization: 'Bearer ' + token } : {}; },
  });
  const { client, chosen, toggle, error, setError, redirect: redirecting, destination } = consent;
  const [config, setConfig] = useState<CareerAuthConfig | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const busy = consent.busy || loginBusy;

  useEffect(() => {
    let dispose = () => {};
    void configureCareerAuth()
      .then((loaded) => {
        setConfig(loaded);
        dispose = listenCareerAuthChanged(
          (user, token) => {
            setAuthToken(token);
            setUserEmail(user?.email || '');
            setSignedIn(loaded.mode === 'off' || !!user);
          },
          (err) => setError(err.message),
        );
      })
      .catch((err: Error) => setError(err.message));
    return () => dispose();
  }, [setError]);

  const decide = consent.decide;

  async function login(switchAccount = false) {
    setLoginBusy(true);
    setError('');
    try {
      if (switchAccount) await signOutCareer();
      setAuthToken(await signInWithGoogle());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('登录失败'));
    } finally {
      setLoginBusy(false);
    }
  }

  const configured = !!getCareerAuth();
  const localMode = config?.mode === 'off';
  const shownError = error || (consent.missingClient ? t('缺少 client_id，请从 AI 助手重新发起授权。') : '');
  const clientName = client?.clientName || t('AI 助手');
  const returnTo = destination || client?.redirectHosts.join(', ') || '';
  const initial = (userEmail || '?').slice(0, 1).toUpperCase();
  return (
    <div className="login-page oauth-page">
      <main className="oauth-card" aria-busy={busy}>
        <div className="oauth-marks" aria-hidden="true">
          <span className="oauth-mark app">{t('就')}</span>
          <span className="oauth-link">
            <span />
            <Link2 size={14} />
            <span />
          </span>
          <span className="oauth-mark agent">
            <Bot size={22} />
          </span>
        </div>
        <h1>{t('{0} 想要访问你的就职手帖', [clientName])}</h1>
        {client && (
          <p className="oauth-return">
            {t('授权后将返回')} <b>{returnTo}</b>
          </p>
        )}
        {!client && !shownError && <p className="oauth-loading">{t('正在读取助手信息…')}</p>}
        {shownError && (
          <p className="oauth-alert" role="alert">
            <AlertCircle size={16} />
            <span>{shownError}</span>
          </p>
        )}

        {redirecting ? (
          <div className="oauth-redirect">
            <RefreshCw size={18} className="spin" />
            <p>
              {t('正在返回 {0}…', [clientName])}{' '}
              <a href={redirecting}>{t('如果没有自动跳转，请点击这里。')}</a>
            </p>
          </div>
        ) : client ? (
          <>
            {localMode ? (
              <div className="oauth-account">
                <span className="oauth-avatar">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <b>{t('本机工作区')}</b>
                  <small>{t('任何能访问这台电脑的程序都能使用该授权。')}</small>
                </span>
              </div>
            ) : signedIn ? (
              <div className="oauth-account">
                <span className="oauth-avatar">{initial}</span>
                <span>
                  <b>{userEmail}</b>
                  <small>{t('助手只能访问这个账号的工作区')}</small>
                </span>
                <button className="text-button" disabled={busy} onClick={() => void login(true)}>
                  {t('切换账号')}
                </button>
              </div>
            ) : (
              <div className="oauth-signin">
                <p>{t('请先登录，助手只能访问你自己的工作区。')}</p>
                <button className="oauth-google" disabled={busy || !config} onClick={() => void login(false)}>
                  <span className="welcome-google" aria-hidden="true">G</span>
                  {t(loginBusy ? '正在登录…' : '使用 Google 登录以继续')}
                </button>
                {config && !configured && <p className="small">{t('Google 登录暂未就绪，请联系工作区管理者。')}</p>}
              </div>
            )}

            {signedIn && (
              <>
                <fieldset className="oauth-scopes">
                  <legend>{t('这将允许 {0}：', [clientName])}</legend>
                  {client.scopeDetails.map((scope) => {
                    const text = SCOPE_TEXT[scope.name] ?? { label: scope.name, detail: scope.description };
                    const on = chosen.includes(scope.name);
                    return (
                      <label key={scope.name} className={scope.required ? 'required' : on ? 'on' : ''}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={scope.required}
                          onChange={(event) => toggle(scope.name, event.target.checked)}
                        />
                        <span className="oauth-scope-icon" aria-hidden="true">
                          {on ? <Check size={15} /> : null}
                        </span>
                        <span className="oauth-scope-text">
                          <b>{t(text.label)}</b>
                          <small>{t(text.detail)}</small>
                          {scope.required && <em>{t('必需')}</em>}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                <p className="oauth-trust">
                  {t('请确认你信任 {0}。你可以随时在「Agent 协作」页撤销这次授权。', [clientName])}
                </p>
                <div className="oauth-actions">
                  <button className="oauth-deny" disabled={busy} onClick={() => void decide('deny')}>
                    {t('取消')}
                  </button>
                  <button className="oauth-allow" disabled={busy} onClick={() => void decide('approve')}>
                    {t(consent.busy ? '正在处理…' : '允许')}
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}
        <div className="oauth-foot">
          <LanguageSwitcher />
        </div>
      </main>
    </div>
  );
}
