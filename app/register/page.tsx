"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (res.ok) {
      router.push("/login"); 
    } else {
      const data = await res.json();
      setError(data.message || "Registration failed");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-96 p-8 border rounded-lg bg-card shadow-sm">
        <h2 className="text-2xl font-bold text-center mb-6">Create an Account</h2>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        
        <Input 
          type="text" 
          placeholder="Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          required 
        />
        <Input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
        />
        <Input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
        />
        <Button type="submit" className="w-full">Sign Up</Button>
        
        <p className="text-sm text-center mt-4">
          Already have an account? <a href="/login" className="text-blue-500 hover:underline">Sign in</a>
        </p>
      </form>
    </div>
  );
}