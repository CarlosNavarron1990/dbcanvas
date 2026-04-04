import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Download from './pages/Download';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CheckoutSuccess from './pages/CheckoutSuccess';
import DeviceAuth from './pages/DeviceAuth';
import AuthCallback from './pages/AuthCallback';
import Account from './pages/Account';

const App: React.FC = () => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const isAccountPage = path.startsWith('/account');

  return (
    <>
      {!isAccountPage && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/download" element={<Download />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Account />} />
        <Route path="/account" element={<Account />} />
        <Route path="/checkout/success" element={<CheckoutSuccess />} />
        <Route path="/auth/device" element={<DeviceAuth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </>
  );
};

export default App;
