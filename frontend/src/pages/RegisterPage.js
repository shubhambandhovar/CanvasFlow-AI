import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await register(email, password, name);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] dark:bg-[#0A1929] p-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8 animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{letterSpacing: '-0.02em'}}>Join CanvasFlow</h1>
            <p className="text-muted-foreground">Create your account and start collaborating</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" data-testid="register-name-label">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="register-name-input"
                className="bg-white/50 backdrop-blur-sm border-black/5 focus:border-black/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" data-testid="register-email-label">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="register-email-input"
                className="bg-white/50 backdrop-blur-sm border-black/5 focus:border-black/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" data-testid="register-password-label">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="register-password-input"
                className="bg-white/50 backdrop-blur-sm border-black/5 focus:border-black/20"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-full"
              disabled={loading}
              data-testid="register-submit-button"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm mt-6 text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline" data-testid="login-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
