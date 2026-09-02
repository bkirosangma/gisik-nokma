/** UI chrome only — never a doc node (the knowledge-base prior art this plan names). */
export function UploadChips({ chips }: { chips: ReadonlyMap<string, string> }): React.JSX.Element | null {
  if (chips.size === 0) return null;
  return (
    <div className="upload-chips" aria-live="polite">
      {Array.from(chips.entries()).map(([id, filename]) => (
        <div key={id} className="upload-chips__chip">
          Uploading {filename}…
        </div>
      ))}
    </div>
  );
}
