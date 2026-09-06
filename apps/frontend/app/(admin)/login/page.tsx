'use client';

import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { useStores } from '../../../stores/provider';

function LoginPage() {
  const t = useTranslations('login');
  const { auth } = useStores();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void auth.login(email, password);
  }

  return (
    <main className="shell">
      <form className="panel" onSubmit={onSubmit}>
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
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          type="submit"
          label={auth.status === 'pending' ? t('pending') : t('submit')}
          disabled={auth.status === 'pending'}
        />

        {/* The endpoint arrives in P1. A 404 is the expected answer today, and it
            must not read as a broken portal. */}
        {auth.status === 'unavailable' && (
          <Message
            severity="info"
            text={t('notYet')}
            style={{ marginTop: 12 }}
          />
        )}
        {auth.status === 'error' && (
          <Message
            severity="error"
            text={`${t('failed')} ${auth.error ?? ''}`.trim()}
            style={{ marginTop: 12 }}
          />
        )}
        {auth.status === 'authenticated' && (
          <Message
            severity="success"
            text={t('welcome')}
            style={{ marginTop: 12 }}
          />
        )}
      </form>
    </main>
  );
}

export default observer(LoginPage);
