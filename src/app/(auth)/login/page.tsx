import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded-2xl shadow-sm border p-8">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
