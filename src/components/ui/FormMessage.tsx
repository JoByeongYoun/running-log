export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (success) return <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>;
  return null;
}
