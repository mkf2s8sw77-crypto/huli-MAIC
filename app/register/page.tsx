'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withBasePath } from '@/lib/utils/base-path';
import { appLogoUrl } from '@/lib/utils/public-asset';
import { getAppHomeHref, navigateToAppHome, resolveCallbackUrl } from '@/lib/utils/navigation';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(username.trim())) {
      setError('用户名需为 3-32 位字母、数字、点、下划线或短横线，并以字母或数字开头');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(withBasePath('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          username: username.trim().toLowerCase(),
          password,
          nickname: nickname.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }

      // 注册成功后自动登录
      const signInResult = await signIn('credentials', {
        identifier: username.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        window.location.assign(withBasePath('/login'));
      } else {
        const callbackUrl = resolveCallbackUrl();
        if (callbackUrl === getAppHomeHref()) {
          navigateToAppHome();
        } else {
          window.location.assign(callbackUrl);
        }
      }
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src={appLogoUrl()}
            alt="Logo"
            className="h-16 w-auto mx-auto rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 mb-4"
          />
          <h1 className="text-2xl font-bold text-foreground">注册</h1>
          <p className="text-sm text-muted-foreground mt-1">创建您的账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              placeholder="3-32 位字母、数字、点、下划线或短横线"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}"
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">昵称（可选）</Label>
            <Input
              id="nickname"
              type="text"
              placeholder="您的昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">确认密码</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <a href={withBasePath('/login')} className="text-primary hover:underline font-medium">
            立即登录
          </a>
        </p>
      </div>
    </div>
  );
}
