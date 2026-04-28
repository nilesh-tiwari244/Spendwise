import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

interface AuthViewProps {
  onRecoveryComplete?: () => void;
  initialIsRecovery?: boolean;
}

export function AuthView({ onRecoveryComplete, initialIsRecovery = false }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isRecovery, setIsRecovery] = useState(initialIsRecovery);

  useEffect(() => {
    // Check if we're in a recovery flow
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsRecovery(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isRecovery) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setMessage('Password updated successfully!');
        setIsRecovery(false);
        setIsLogin(true);
        if (onRecoveryComplete) {
          onRecoveryComplete();
        }
      } else if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage('Check your email for the reset link!');
      } else if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        setMessage('Check your email for confirmation!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50">
      <div className="w-full max-w-sm brutal-card p-8">
        <h2 className="text-3xl font-black uppercase tracking-tighter mb-8">
          {isRecovery ? 'New Password' : (isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back' : 'Join Us'))}
        </h2>

        {isForgotPassword && !message && (
          <div className="mb-6 p-3 bg-zinc-100 border-2 border-zinc-900 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] font-bold uppercase leading-tight">
              Note: If the email link points to "localhost", replace it with this site's URL in your browser.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {isRecovery ? (
            <div>
              <label className="block text-xs font-black uppercase mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="brutal-input"
                placeholder="••••••••"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-black uppercase mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="brutal-input"
                  placeholder="you@example.com"
                />
              </div>

              {!isForgotPassword && (
                <div>
                  <label className="block text-xs font-black uppercase mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="brutal-input"
                    placeholder="••••••••"
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-red-600 text-xs font-bold uppercase">{error}</p>
          )}

          {message && (
            <p className="text-green-600 text-xs font-bold uppercase">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full brutal-button flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRecovery ? 'Update Password' : (isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Login' : 'Register'))}
          </button>
        </form>

        {!isRecovery && (
          <div className="mt-8 space-y-4 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setIsForgotPassword(false);
              }}
              className="block w-full text-xs font-bold uppercase underline underline-offset-4 hover:text-zinc-600"
            >
              {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
            
            <button
              onClick={() => setIsForgotPassword(!isForgotPassword)}
              className="block w-full text-[10px] font-black uppercase text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              {isForgotPassword ? "Back to Login" : "Forgot Password?"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
