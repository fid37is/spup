// app/deletion-status/page.tsx
export default function DeletionStatusPage({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Data Deletion Request</h1>
      <p>Your Facebook data deletion request has been received and processed.</p>
      {searchParams.code && (
        <p style={{ color: '#666', fontSize: 14 }}>
          Confirmation code: <strong>{searchParams.code}</strong>
        </p>
      )}
      <p style={{ marginTop: 20, color: '#666' }}>
        All data associated with your Facebook account has been removed from Spup.
      </p>
    </main>
  )
}