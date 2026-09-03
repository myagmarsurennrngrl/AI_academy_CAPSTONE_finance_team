/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (frontend/Dockerfile).
  output: "standalone",
  // No rewrites: the frontend calls the backend's origin directly (see
  // lib/api.ts), relying on the backend's CORS config instead of proxying
  // through Next's dev server. Long-running analysis requests (deterministic
  // pipeline + two sequential LLM calls) were observed to be cut off by
  // Next's rewrite proxy after ~30s even though the backend kept working -
  // calling the backend directly avoids that failure mode entirely.
};

export default nextConfig;
