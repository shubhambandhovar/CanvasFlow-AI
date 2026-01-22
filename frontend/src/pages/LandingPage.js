import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export const LandingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0A1929]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-black/5">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold" style={{letterSpacing: '-0.02em'}}>CanvasFlow</span>
          </div>
          <div className="flex gap-3">
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="rounded-full h-10 px-6"
                data-testid="dashboard-button"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className="rounded-full h-10 px-6"
                  data-testid="login-button"
                >
                  Sign In
                </Button>
                <Button
                  onClick={handleGetStarted}
                  className="rounded-full h-10 px-6"
                  data-testid="get-started-button"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight" style={{letterSpacing: '-0.02em'}}>
              Your Infinite
              <br />
              <span className="text-accent">Collaborative</span>
              <br />
              Sketchbook
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Create, collaborate, and ideate in real-time with an AI-powered whiteboard.
              Perfect for teams, designers, and remote collaboration.
            </p>
            <div className="flex gap-4">
              <Button
                size="lg"
                onClick={handleGetStarted}
                className="rounded-full h-12 px-8 shadow-lg hover:shadow-xl transition-shadow"
                data-testid="hero-get-started-button"
              >
                Get Started <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="glass rounded-3xl p-8 aspect-video flex items-center justify-center">
              <img
                src="/bg.png"
                alt="AI-Assisted Collaborative Whiteboard"
                className="rounded-2xl object-cover w-full h-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{letterSpacing: '-0.02em'}}>
            Everything you need to create
          </h2>
          <p className="text-lg text-muted-foreground">Powerful features for seamless collaboration</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="glass rounded-2xl p-8 hover:bg-white/80 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300" data-testid="feature-realtime">
            <div className="w-12 h-12 bg-[#00E5FF]/10 rounded-xl flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-[#00E5FF]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Real-time Collaboration</h3>
            <p className="text-muted-foreground">
              See live cursors, presence indicators, and instant updates as your team works together.
            </p>
          </div>

          <div className="glass rounded-2xl p-8 hover:bg-white/80 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300" data-testid="feature-ai">
            <div className="w-12 h-12 bg-[#9D00FF]/10 rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-[#9D00FF]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">AI-Powered Suggestions</h3>
            <p className="text-muted-foreground">
              Get intelligent suggestions to clean up shapes, add annotations, and improve your diagrams.
            </p>
          </div>

          <div className="glass rounded-2xl p-8 hover:bg-white/80 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300" data-testid="feature-tools">
            <div className="w-12 h-12 bg-[#FFD500]/10 rounded-xl flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-[#FFD500]" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Powerful Drawing Tools</h3>
            <p className="text-muted-foreground">
              Freehand drawing, shapes, text annotations, and more with an intuitive interface.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-8 mt-24">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">CanvasFlow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 CanvasFlow. Built by Shubham Shrivastava.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
