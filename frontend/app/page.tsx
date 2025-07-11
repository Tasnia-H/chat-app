"use client";

import { useAuth } from "@/contexts/AuthContext";
import AuthForm from "@/components/AuthForm";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return user ? <ChatInterface /> : <AuthForm />;
}
