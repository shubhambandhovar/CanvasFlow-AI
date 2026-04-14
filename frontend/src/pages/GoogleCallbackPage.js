import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthData } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    
    const handleGoogleCallback = async () => {
      hasProcessed.current = true;
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');

        if (!code) {
          const error = searchParams.get('error');
          const errorDescription = searchParams.get('error_description');
          throw new Error(error || errorDescription || 'No authorization code received');
        }

        // Exchange code for token on backend
        const response = await axios.post(`${API}/auth/google`, {
          code: code
        });

        const { access_token, user } = response.data;

        // Update context and storage
        setAuthData(access_token, user);

        toast.success(`Welcome ${user.name}!`);
        navigate('/dashboard');
      } catch (error) {
        console.error('Google callback error:', error);
        toast.error(error.message || 'Google login failed');
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    handleGoogleCallback();
  }, [searchParams, navigate, setAuthData]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-lg font-semibold">Signing you in...</p>
        <p className="text-gray-500">Please wait while we complete your authentication.</p>
      </div>
    </div>
  );
}
