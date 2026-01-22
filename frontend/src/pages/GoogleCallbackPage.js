import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from '@/components/ui/sonner';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000/api';

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleGoogleCallback = async () => {
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
        localStorage.setItem('token', access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        toast.success(`Welcome ${user.name}!`);
        navigate('/dashboard');
      } catch (error) {
        console.error('Google callback error:', error);
        toast.error(error.message || 'Google login failed');
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    handleGoogleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-lg font-semibold">Signing you in...</p>
        <p className="text-gray-500">Please wait while we complete your authentication.</p>
      </div>
    </div>
  );
}
