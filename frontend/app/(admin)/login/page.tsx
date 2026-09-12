'use client';

import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { useStores } from '../../../stores/provider';

/**
 * Sign in to the portal.
 *
 * Password only. `AuthStore` can already do the Google flow and the
 * link-with-password flow that a colliding address needs, but neither is
 * reachable from here until `GOOGLE_CLIENT_IDS` is configured and the browser
 * flow is wired — and a Google button that always fails teaches an Owner that
 * the portal is broken. The half worth remembering when it lands is the link
 * path: `auth.googleLink(idToken, password)`, with the address fixed to what
 * Google returned rather than editable.
 */
function LoginPage() {
  const t = useTranslations('login');
  const { auth } = useStores();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await auth.login(email, password);
    if (auth.isAuthenticated) router.push('/overview');
  }

  return (
    <main className="shell">
      <form className="panel" onSubmit={(event) => void onSubmit(event)}>
        <h1>{t('title')}</h1>

        <div className="field">
          <label htmlFor="email">{t('email')}</label>
          <InputText
            id="email"
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">{t('password')}</label>
          <Password
            inputId="password"
            value={password}
            feedback={false}
            toggleMask
            required
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          label={auth.status === 'pending' ? t('pending') : t('submit')}
          disabled={auth.status === 'pending'}
        />

        {/*
          One message for a wrong password and an unknown address alike, because
          the API answers the same way for both — this portal's administrator
          login is written down in SETUP.md, and a message that distinguished
          them would confirm which addresses exist.
        */}
        {auth.failure === 'invalid_credentials' && (
          <Message severity="error" text={t('invalid')} style={{ marginTop: 12 }} />
        )}
        {/* The session was ended on purpose. Saying "wrong password" here would
            send the Owner looking for a typo instead of at their devices. */}
        {auth.failure === 'session_replay' && (
          <Message severity="warn" text={t('replay')} style={{ marginTop: 12 }} />
        )}
        {auth.failure === 'unknown' && (
          <Message severity="error" text={t('failed')} style={{ marginTop: 12 }} />
        )}
      </form>
    </main>
  );
}

export default observer(LoginPage);
